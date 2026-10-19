// Add-on "Anfrage-Weiterleitung": Konfiguration, Token-Verschlüsselung, Admin-Sicht, Einhängepunkt fürs Kontaktformular.
// Ablage: Setting-Keys tnt_inquiries (JSON) + tnt_inquiries_alert; beide gibt /api/settings nie heraus.
import crypto from 'crypto';
import { listTemplates, getTemplateByName } from './templateStore';
import { extractContactFormFields } from './contactFormFields';
import {
  TARGETS, TARGET_BY_PATH, BLOCKING_ALERTS, suggestTarget, suggestPrivacyField, normalizeBaseUrl,
  postInquiry, buildInquiryPayload, validateInquiry, enqueue, deliverSafely, releaseHeld,
} from './tntInquiries';

export const CONFIG_KEY = 'tnt_inquiries';
export const ALERT_KEY = 'tnt_inquiries_alert';

// ── Verschlüsselung (AES-256-GCM, Schlüssel per HKDF aus NEXTAUTH_SECRET) ─────
function key() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NO_SECRET');
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'temgine', 'tnt-inquiries-v1', 32));
}
export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), ct].map((p) => (Buffer.isBuffer(p) ? p.toString('base64') : p)).join(':');
}
export function decrypt(blob) {
  const [v, iv, tag, ct] = String(blob || '').split(':');
  if (v !== 'v1' || !ct) throw new Error('BAD_BLOB');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

// ── Konfiguration ────────────────────────────────────────────────────────────
async function readJson(prisma, k) {
  const row = await prisma.setting.findUnique({ where: { key: k } });
  try { return row?.value ? JSON.parse(row.value) : null; } catch { return null; }
}
const writeJson = (prisma, k, v) => prisma.setting.upsert({
  where: { key: k }, update: { value: JSON.stringify(v) }, create: { key: k, value: JSON.stringify(v) },
});

export async function loadConfig(prisma) {
  const c = (await readJson(prisma, CONFIG_KEY)) || {};
  return { enabled: c.enabled === true, baseUrl: c.baseUrl || '', tokenEnc: c.tokenEnc || '', mappings: c.mappings || {} };
}

/** Wirksame Werte: Umgebungsvariablen haben Vorrang vor der DB. */
export function effective(cfg) {
  let token = '';
  if (process.env.TNT_INQUIRY_TOKEN) token = process.env.TNT_INQUIRY_TOKEN;
  else if (cfg.tokenEnc) { try { token = decrypt(cfg.tokenEnc); } catch { token = ''; } }
  return { baseUrl: process.env.TNT_BASE_URL || cfg.baseUrl || '', token };
}

export async function getAlertCode(prisma) {
  return (await readJson(prisma, ALERT_KEY))?.code || null;
}
async function setAlert(prisma, code) {
  if ((await getAlertCode(prisma)) !== code) await writeJson(prisma, ALERT_KEY, { code, since: new Date().toISOString() });
}
const clearAlert = (prisma) => prisma.setting.deleteMany({ where: { key: ALERT_KEY } });

/** Laufzeit-Kontext für lib/tntInquiries.js (Outbox-Verarbeitung). */
export async function getRuntime(prisma) {
  const { baseUrl, token } = effective(await loadConfig(prisma));
  return {
    baseUrl, token, encrypt, decrypt,
    getAlertCode: () => getAlertCode(prisma),
    setAlert: (code) => setAlert(prisma, code),
    clearAlert: () => clearAlert(prisma),
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

/** Gründe, warum die Weiterleitung (noch) nicht aktivierbar ist. Leere Liste = bereit. */
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

export async function buildView(prisma) {
  const cfg = await loadConfig(prisma);
  const eff = effective(cfg);
  const forms = listForms();
  const reasons = readinessReasons({ baseUrl: eff.baseUrl, tokenSet: !!eff.token, mappings: cfg.mappings, forms });

  let alert = null;
  const stored = await readJson(prisma, ALERT_KEY);
  if (stored?.code) alert = { code: stored.code, since: stored.since };
  else {
    const f = await prisma.inquiryOutbox.findFirst({ where: { status: 'failed' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    if (f) alert = { code: 'FAILED', since: f.createdAt.toISOString() };
  }

  return {
    enabled: cfg.enabled, baseUrl: eff.baseUrl, tokenSet: !!eff.token, tokenHint: maskToken(eff.token),
    ready: reasons.length === 0, readyReasons: reasons, alert,
    forms: forms.map((f) => {
      const m = cfg.mappings[f.formId] || { fields: {}, privacyField: null };
      return {
        formId: f.formId, label: f.label,
        fields: f.fields.map((x) => ({ ...x, suggested: suggestTarget(x.key, x.type) })),
        mapping: Object.fromEntries(f.fields.map((x) => [x.key, m.fields?.[x.key] || ''])),
        privacyField: m.privacyField || null,
        suggestedPrivacyField: suggestPrivacyField(f.fields),
      };
    }),
    targets: TARGETS.map(({ path, label, group }) => ({ path, label, group })),
  };
}

const TOKEN_RE = /^[\x21-\x7e]{8,500}$/; // druckbares ASCII ohne Leerzeichen (Header-sicher)

/** Admin-PUT. Rückgabe { view } oder { errors: { feld: text } } (→ 422). */
export async function applyUpdate(prisma, body) {
  const b = body || {};
  const cfg = await loadConfig(prisma);
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
    else next.tokenEnc = encrypt(b.token);
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
      next.mappings[formId] = { fields, privacyField };
    }
  }
  if (b.enabled !== undefined) next.enabled = b.enabled === true;

  if (next.enabled) {
    const eff = effective(next);
    const reasons = readinessReasons({ baseUrl: eff.baseUrl, tokenSet: !!eff.token, mappings: next.mappings, forms });
    if (reasons.length) errors.enabled = `Weiterleitung nicht aktivierbar: ${reasons.join(' ')}`;
  }
  if (Object.keys(errors).length) return { errors };

  await writeJson(prisma, CONFIG_KEY, next);
  if (next.baseUrl !== cfg.baseUrl || next.tokenEnc !== cfg.tokenEnc) {
    await clearAlert(prisma);
    await releaseHeld(prisma);
  }
  return { view: await buildView(prisma) };
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

export async function testConnection(prisma, fetchImpl) {
  const { baseUrl, token } = effective(await loadConfig(prisma));
  const sample = {
    externalId: `temgine-test-${Date.now()}`, source: 'temgine', privacyAccepted: true,
    customer: { lastName: 'Testkontakt', email: 'test@example.com' },
    event: { title: 'Verbindungstest' },
  };
  const res = await postInquiry({ baseUrl, token, payload: sample, dryRun: true, fetchImpl });
  if (res.error) return { ok: false, status: null, hint: HINTS[res.error] || 'Verbindung fehlgeschlagen.' };
  const ok = res.status === 200;
  if (ok) {
    if (BLOCKING_ALERTS.includes(await getAlertCode(prisma))) { await clearAlert(prisma); await releaseHeld(prisma); }
  }
  const hint = STATUS_HINTS[res.status] || (res.status >= 500 ? 'Fehler auf der TNT-Seite – später erneut versuchen.' : `Anfrage abgelehnt (Status ${res.status}).`);
  return { ok, status: res.status, hint };
}

// ── Einhängepunkt Kontaktformular ────────────────────────────────────────────

/** Plan für diese Absendung oder null (Add-on aus, Formular nicht zugeordnet, unvollständig, Fehler). */
export async function getForwardingPlan(prisma, formName) {
  try {
    const name = typeof formName === 'string' ? formName.trim() : '';
    if (!name) return null;
    const cfg = await loadConfig(prisma);
    if (!cfg.enabled) return null;
    const form = getTemplateByName(name);
    if (!form || form.category !== 'contact') return null;
    const mapping = cfg.mappings[form.name];
    if (!mapping?.privacyField) return null;
    const rt = await getRuntime(prisma);
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
export async function forwardSubmission(prisma, plan, body, submissionId = crypto.randomUUID()) {
  try {
    const payload = buildInquiryPayload({ formId: plan.formId }, body, plan.mapping, submissionId);
    if (!payload || validateInquiry(payload).length) {
      console.warn(`[tnt-inquiries] ${submissionId} skipped INVALID`);
      return null;
    }
    const row = await enqueue(prisma, plan.rt, { formId: plan.formId, submissionId, payload });
    if (!row || BLOCKING_ALERTS.includes(await plan.rt.getAlertCode())) return null;
    return { done: deliverSafely(prisma, plan.rt, row) };
  } catch {
    console.warn(`[tnt-inquiries] ${submissionId} error ENQUEUE`);
    return null;
  }
}
