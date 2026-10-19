// Konfiguration, Token-Verschlüsselung, Admin-Sicht und Formular-Anbindung des Plugins "Anfrage-Weiterleitung".
// Ablage in den Plugin-Settings (plugin.json): tnt-inquiries_base_url, _token (verschlüsselt, v1-Blob),
// _mappings (JSON), _alert (JSON, secret). /api/settings gibt Token und Alarm nie heraus.
// Alle Funktionen bekommen ctx = { prisma, crypto: { encrypt, decrypt } } (siehe development_docs/PLUGINS.md).
import crypto from 'crypto';
import { listTemplates, getTemplateByName } from '../../lib/templateStore';
import { extractContactFormFields } from '../../lib/contactFormFields';
import {
  TARGETS, TARGET_BY_PATH, BLOCKING_ALERTS, suggestTarget, suggestPrivacyField, normalizeBaseUrl,
  postInquiry, buildInquiryPayload, validateInquiry, enqueue, deliverSafely, releaseHeld, isChecked,
} from './lib';

export const K = {
  baseUrl: 'tnt-inquiries_base_url',
  token: 'tnt-inquiries_token',
  mappings: 'tnt-inquiries_mappings',
  alert: 'tnt-inquiries_alert',
};

// ── Settings ─────────────────────────────────────────────────────────────────
const parseObj = (s) => { try { const v = s ? JSON.parse(s) : null; return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
const writeSetting = (prisma, key, value) => prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });

export async function loadConfig({ prisma }) {
  const rows = await prisma.setting.findMany({ where: { key: { in: [K.baseUrl, K.token, K.mappings] } } });
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { baseUrl: m[K.baseUrl] || '', tokenEnc: m[K.token] || '', mappings: parseObj(m[K.mappings]) || {} };
}

/** Wirksame Werte: Umgebungsvariablen haben Vorrang vor der DB. */
export function effective(cfg, { decrypt }) {
  let token = '';
  if (process.env.TNT_INQUIRY_TOKEN) token = process.env.TNT_INQUIRY_TOKEN;
  else if (cfg.tokenEnc) {
    // Ein über die generische Settings-API gesetzter Klartext-Token (ohne v1:-Blob) wird akzeptiert, aber nie ausgegeben.
    try { token = cfg.tokenEnc.startsWith('v1:') ? decrypt(cfg.tokenEnc) : cfg.tokenEnc; } catch { token = ''; }
  }
  return { baseUrl: process.env.TNT_BASE_URL || cfg.baseUrl || '', token };
}

export async function getAlertCode({ prisma }) {
  const row = await prisma.setting.findUnique({ where: { key: K.alert } });
  return parseObj(row?.value)?.code || null;
}
async function setAlert(ctx, code) {
  if ((await getAlertCode(ctx)) !== code) await writeSetting(ctx.prisma, K.alert, JSON.stringify({ code, since: new Date().toISOString() }));
}
const clearAlert = ({ prisma }) => prisma.setting.deleteMany({ where: { key: K.alert } });

/** Laufzeit-Kontext für lib.js (Outbox-Verarbeitung). */
export async function getRuntime(ctx) {
  const { baseUrl, token } = effective(await loadConfig(ctx), ctx.crypto);
  return {
    baseUrl, token, encrypt: ctx.crypto.encrypt, decrypt: ctx.crypto.decrypt,
    getAlertCode: () => getAlertCode(ctx),
    setAlert: (code) => setAlert(ctx, code),
    clearAlert: () => clearAlert(ctx),
  };
}

// ── Formulare & Bereitschaft ─────────────────────────────────────────────────
export function listForms() {
  return listTemplates().filter((t) => t.category === 'contact').map((t) => ({
    formId: t.name, label: t.name,
    fields: extractContactFormFields(t.code).map((f) => ({ key: f.name, label: f.label, type: f.type })),
  }));
}

const hasTarget = (fields, ...paths) => Object.values(fields || {}).some((p) => paths.includes(p));
const formActive = (m) => !!m && (!!m.privacyField || hasTarget(m.fields, ...Object.keys(TARGET_BY_PATH)));

/** Gründe, warum die Weiterleitung (noch) nicht arbeitet. Leere Liste = bereit. */
export function readinessReasons({ baseUrl, tokenSet, mappings, forms }) {
  const r = [];
  if (!normalizeBaseUrl(baseUrl)) r.push('TNT-Adresse fehlt oder beginnt nicht mit https://.');
  if (!tokenSet) r.push('Zugangs-Token fehlt.');
  const active = forms.filter((f) => formActive(mappings[f.formId]));
  if (!active.length) r.push('Kein Formular zugeordnet.');
  for (const f of active) {
    const m = mappings[f.formId];
    if (!m.privacyField || !f.fields.some((x) => x.key === m.privacyField)) r.push(`${f.label}: Datenschutz-Checkbox ist nicht zugeordnet.`);
    if (!hasTarget(m.fields, 'customer.firstName', 'customer.lastName', 'customer.companyName')) r.push(`${f.label}: Name oder Firma fehlt in der Zuordnung.`);
    if (!hasTarget(m.fields, 'customer.email', 'customer.phone')) r.push(`${f.label}: E-Mail oder Telefon fehlt in der Zuordnung.`);
  }
  return r;
}

export function maskToken(token) {
  if (!token) return null;
  return token.length >= 12 ? `••••${token.slice(-4)}` : '••••';
}

export async function buildView(ctx) {
  const { prisma } = ctx;
  const cfg = await loadConfig(ctx);
  const eff = effective(cfg, ctx.crypto);
  const forms = listForms();
  const reasons = readinessReasons({ baseUrl: eff.baseUrl, tokenSet: !!eff.token, mappings: cfg.mappings, forms });

  let alert = null;
  const stored = parseObj((await prisma.setting.findUnique({ where: { key: K.alert } }))?.value);
  if (stored?.code) alert = { code: stored.code, since: stored.since };
  else {
    const f = await prisma.inquiryOutbox.findFirst({ where: { status: 'failed' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    if (f) alert = { code: 'FAILED', since: f.createdAt.toISOString() };
  }

  return {
    baseUrl: eff.baseUrl, tokenSet: !!eff.token, tokenHint: maskToken(eff.token),
    ready: reasons.length === 0, readyReasons: reasons, alert,
    forms: forms.map((f) => {
      const m = cfg.mappings[f.formId] || { fields: {}, privacyField: null };
      return {
        formId: f.formId, label: f.label,
        fields: f.fields.map((x) => ({ ...x, suggested: suggestTarget(x.key, x.type) })),
        mapping: Object.fromEntries(f.fields.map((x) => [x.key, m.fields?.[x.key] || ''])),
        privacyField: m.privacyField || null,
        mailAfterDelivery: !!m.mailAfterDelivery,
        suggestedPrivacyField: suggestPrivacyField(f.fields),
      };
    }),
    targets: TARGETS.map(({ path, label, group }) => ({ path, label, group })),
  };
}

const TOKEN_RE = /^[\x21-\x7e]{8,500}$/; // druckbares ASCII ohne Leerzeichen (Header-sicher)

/** Admin-PUT. Rückgabe { view } oder { errors: { feld: text } } (→ 422). */
export async function applyUpdate(ctx, body) {
  const { prisma } = ctx;
  const b = body || {};
  const cfg = await loadConfig(ctx);
  const forms = listForms();
  const errors = {};
  const next = { ...cfg, mappings: { ...cfg.mappings } };

  if (b.baseUrl !== undefined) {
    const raw = String(b.baseUrl || '').trim();
    if (raw && !normalizeBaseUrl(raw)) errors.baseUrl = 'Die Adresse muss mit https:// beginnen und darf keine Zugangsdaten enthalten.';
    else next.baseUrl = raw ? normalizeBaseUrl(raw) : '';
  }
  if (b.token === null) next.tokenEnc = '';
  else if (typeof b.token === 'string' && b.token !== '') {
    if (!TOKEN_RE.test(b.token)) errors.token = 'Token ungültig (mindestens 8 sichtbare Zeichen, keine Leerzeichen).';
    else next.tokenEnc = ctx.crypto.encrypt(b.token);
  }
  if (b.mappings && typeof b.mappings === 'object') {
    for (const [formId, m] of Object.entries(b.mappings)) {
      const form = forms.find((f) => f.formId === formId);
      if (!form) { errors[`mappings.${formId}`] = 'Unbekanntes Formular.'; continue; }
      const keys = new Set(form.fields.map((f) => f.key));
      const fields = {};
      for (const [k, target] of Object.entries(m?.fields || {})) {
        if (!target) continue;
        if (!keys.has(k) || !TARGET_BY_PATH[target]) errors[`mappings.${formId}.${k}`] = 'Ungültige Zuordnung.';
        else fields[k] = target;
      }
      const privacyField = m?.privacyField || null;
      if (privacyField && !keys.has(privacyField)) errors[`mappings.${formId}.privacyField`] = 'Unbekanntes Feld.';
      const mailAfterDelivery = typeof m?.mailAfterDelivery === 'boolean' ? m.mailAfterDelivery : !!cfg.mappings[formId]?.mailAfterDelivery;
      next.mappings[formId] = { fields, privacyField, mailAfterDelivery };
    }
  }
  if (Object.keys(errors).length) return { errors };

  await writeSetting(prisma, K.baseUrl, next.baseUrl);
  await writeSetting(prisma, K.token, next.tokenEnc);
  await writeSetting(prisma, K.mappings, JSON.stringify(next.mappings));
  if (next.baseUrl !== cfg.baseUrl || next.tokenEnc !== cfg.tokenEnc) {
    await clearAlert(ctx);
    await releaseHeld(prisma);
  }
  return { view: await buildView(ctx) };
}

// ── Verbindungstest ──────────────────────────────────────────────────────────
const HINTS = {
  CERT: 'Zertifikat des Servers nicht vertrauenswürdig – es wird bewusst nichts gesendet.',
  TIMEOUT: 'Zeitüberschreitung – Server nicht erreichbar.',
  HTTPS: 'Die Adresse muss mit https:// beginnen.',
  NO_TOKEN: 'Zugangs-Token fehlt.',
  NETWORK: 'Server nicht erreichbar.',
  ENOTFOUND: 'Adresse nicht gefunden (DNS).',
  ECONNREFUSED: 'Verbindung abgelehnt.',
};
const STATUS_HINTS = {
  200: 'Verbindung in Ordnung.', 401: 'Token falsch, abgelaufen oder deaktiviert.',
  403: 'HTTPS fehlt (Proxy oder Adresse falsch).', 429: 'Zu viele Anfragen – später erneut versuchen.',
};

export async function testConnection(ctx, fetchImpl) {
  const { baseUrl, token } = effective(await loadConfig(ctx), ctx.crypto);
  const sample = {
    externalId: `temgine-test-${Date.now()}`, source: 'temgine', privacyAccepted: true,
    customer: { lastName: 'Testkontakt', email: 'test@example.com' },
    event: { title: 'Verbindungstest' },
  };
  const res = await postInquiry({ baseUrl, token, payload: sample, dryRun: true, fetchImpl });
  if (res.error) return { ok: false, status: null, hint: HINTS[res.error] || 'Verbindung fehlgeschlagen.' };
  const ok = res.status === 200;
  if (ok) {
    if (BLOCKING_ALERTS.includes(await getAlertCode(ctx))) { await clearAlert(ctx); await releaseHeld(ctx.prisma); }
  }
  const hint = STATUS_HINTS[res.status] || (res.status >= 500 ? 'Fehler auf der TNT-Seite – später erneut versuchen.' : `Anfrage abgelehnt (Status ${res.status}).`);
  return { ok, status: res.status, hint };
}

// ── Einhängepunkt Kontaktformular ────────────────────────────────────────────

/** Plan für diese Absendung oder null (Formular nicht zugeordnet, unvollständig, Fehler). Das Plugin ist hier immer aktiv. */
/**
 * Rückfallebene: Ist das Datum zugeordnet, aber keine Uhrzeit (z. B. weil die gespeicherte Zuordnung aus der Zeit
 * stammt, bevor das Feld im Formular stand), wird das Zeitfeld des Formulars (type=time bzw. Name "uhrzeit")
 * als event.time übertragen. Greift nur, wenn dieses Feld sonst nirgends zugeordnet ist.
 */
export function withTimeFallback(mapping, fieldDefs) {
  const fields = mapping?.fields || {};
  const targets = Object.values(fields);
  if (!targets.includes('event.date') || targets.includes('event.time')) return mapping;
  const f = (fieldDefs || []).find((x) => !fields[x.name] && (x.type === 'time' || /^uhrzeit$/i.test(x.name)));
  return f ? { ...mapping, fields: { ...fields, [f.name]: 'event.time' } } : mapping;
}

export async function getForwardingPlan(ctx, formName) {
  try {
    const name = typeof formName === 'string' ? formName.trim() : '';
    if (!name) return null;
    const cfg = await loadConfig(ctx);
    const form = getTemplateByName(name);
    if (!form || form.category !== 'contact') return null;
    let mapping = cfg.mappings[form.name];
    if (!mapping?.privacyField) return null;
    mapping = withTimeFallback(mapping, extractContactFormFields(form.code));
    const rt = await getRuntime(ctx);
    if (!normalizeBaseUrl(rt.baseUrl) || !rt.token) return null;
    return { formId: form.name, mapping, rt };
  } catch {
    return null;
  }
}

/**
 * Outbox-Eintrag anlegen und sofort (nicht abgewartet) senden. Wirft nie.
 * Wartet nur aufs Anlegen; Rückgabe { done: Promise des Sofortversuchs } oder null.
 */
export async function forwardSubmission(ctx, plan, body, submissionId = crypto.randomUUID()) {
  try {
    const payload = buildInquiryPayload({ formId: plan.formId }, body, plan.mapping, submissionId);
    if (!payload || validateInquiry(payload).length) {
      console.warn(`[tnt-inquiries] ${submissionId} skipped INVALID`);
      return null;
    }
    const row = await enqueue(ctx.prisma, plan.rt, { formId: plan.formId, submissionId, payload });
    if (!row || BLOCKING_ALERTS.includes(await plan.rt.getAlertCode())) return null;
    return { done: deliverSafely(ctx.prisma, plan.rt, row) };
  } catch {
    console.warn(`[tnt-inquiries] ${submissionId} error ENQUEUE`);
    return null;
  }
}

// Mail erst nach TNT-Antwort: Wartezeit für den Besucher höchstens MAIL_WAIT_MS.
export const MAIL_WAIT_MS = 5000;

/**
 * Hook contactMailContext: Outbox-Eintrag anlegen, synchron zustellen (5 s) und Mail-Variablen liefern.
 * Nur wenn die Option am Formular an ist und die Datenschutz-Checkbox angehakt wurde, sonst undefined.
 * Fehler/Timeout/Alarm: { tnt_status: 'ausstehend' } ohne tnt_url; der Retry-Job stellt später zu. Wirft nie, loggt nie Inhalte.
 */
export async function mailContextFor(ctx, formId, values, submissionId) {
  try {
    const plan = await getForwardingPlan(ctx, formId);
    if (!plan?.mapping.mailAfterDelivery || !isChecked(values?.[plan.mapping.privacyField])) return undefined;
    const payload = buildInquiryPayload({ formId: plan.formId }, values, plan.mapping, submissionId);
    if (!payload || validateInquiry(payload).length) return undefined;
    const row = await enqueue(ctx.prisma, plan.rt, { formId: plan.formId, submissionId, payload });
    if (!row) return undefined; // Duplikat: schon angelegt, nichts doppelt
    const pending = { vars: { tnt_status: 'ausstehend' }, appendText: 'Übertragung an den Planer steht noch aus.' };
    if (BLOCKING_ALERTS.includes(await plan.rt.getAlertCode())) return pending;
    const out = await deliverSafely(ctx.prisma, { ...plan.rt, timeoutMs: MAIL_WAIT_MS, readBody: true }, row);
    if (out?.row?.status !== 'delivered') return pending;
    const { appointmentId: id, appointmentUrl: url } = out.answer || {};
    const vars = { tnt_status: 'angelegt' };
    if (id) vars.tnt_id = id;
    if (url) vars.tnt_url = url;
    return { vars, appendText: url ? `Termin im Planer: ${url}` : (id ? `Termin im Planer: Nr. ${id}` : 'Anfrage an den Planer übertragen.') };
  } catch {
    console.warn(`[tnt-inquiries] ${submissionId} error MAILCONTEXT`);
    return undefined;
  }
}
