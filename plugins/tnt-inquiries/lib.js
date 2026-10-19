// Add-on "Anfrage-Weiterleitung an TNT Manager" — reine Funktionen + Outbox-Verarbeitung.
// Konfiguration/Verschlüsselung/Admin-Sicht: lib/tntInquiriesConfig.js. Spec: docs/specs/tnt-inquiries.md
//
// Datenschutz: Personendaten leben nur im (verschlüsselten) Outbox-Payload und im Request.
// Geloggt werden ausschließlich Outbox-ID + Statuscode bzw. ein generischer Fehlercode.

export const MAX_BODY_BYTES = 20 * 1024;
export const TIMEOUT_MS = 10_000;
export const MAX_ATTEMPTS = 9; // 1 Erstversuch + 8 Wiederholungen (1 min … 24 h)
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const DELAYS_MS = [1 * MINUTE, 5 * MINUTE, 15 * MINUTE, 1 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR];
const LEASE_MS = 2 * MINUTE; // Sperre, solange ein Versuch läuft (Worker vs. Sofortversuch)
const HOLD_MS = HOUR;
export const RETENTION_MS = 30 * 24 * HOUR;
export const BLOCKING_ALERTS = ['AUTH', 'HTTPS', 'CERT'];

// ── Ziel-Felder der TNT-API ──────────────────────────────────────────────────
const T = (path, label, group, max, extra = {}) => ({ path, label, group, max, ...extra });
export const TARGETS = [
  T('customer.salutation', 'Anrede', 'Kunde', 40),
  T('customer.firstName', 'Vorname', 'Kunde', 100),
  T('customer.lastName', 'Nachname / Name', 'Kunde', 100),
  T('customer.companyName', 'Firma', 'Kunde', 200),
  T('customer.email', 'E-Mail', 'Kunde', 200, { kind: 'email' }),
  T('customer.phone', 'Telefon', 'Kunde', 50),
  T('customer.address', 'Adresse', 'Kunde', 500, { multiline: true }),
  T('event.title', 'Titel der Veranstaltung', 'Veranstaltung', 200),
  T('event.date', 'Datum', 'Veranstaltung', 40, { kind: 'date' }),
  T('event.time', 'Uhrzeit', 'Veranstaltung', 40, { kind: 'time' }),
  T('event.venue', 'Ort / Location', 'Veranstaltung', 300),
  T('event.showVariant', 'Show-Variante', 'Veranstaltung', 200),
  T('event.durationMinutes', 'Dauer (Minuten)', 'Veranstaltung', 10, { kind: 'duration' }),
  T('event.guests', 'Gästezahl', 'Veranstaltung', 10, { kind: 'guests' }),
  T('event.message', 'Nachricht', 'Veranstaltung', 5000, { multiline: true }),
];
export const TARGET_BY_PATH = Object.fromEntries(TARGETS.map((t) => [t.path, t]));

// Vorbelegung anhand von Feldname/-typ (Reihenfolge = Priorität).
const SUGGESTIONS = [
  [/vorname|first.?name|given/i, 'customer.firstName'],
  [/nachname|last.?name|surname|familienname/i, 'customer.lastName'],
  [/^(full.?)?name$|^ihr.?name$/i, 'customer.lastName'],
  [/firma|company|unternehmen|organisation/i, 'customer.companyName'],
  [/e.?mail|mail/i, 'customer.email'],
  [/tel|phone|handy|mobil/i, 'customer.phone'],
  [/anrede|salutation/i, 'customer.salutation'],
  [/^ort$|veranstaltungsort|location|venue|spielort|auftrittsort/i, 'event.venue'],
  [/adresse|address|stra(ß|ss)e|plz|anschrift/i, 'customer.address'],
  [/dauer|duration/i, 'event.durationMinutes'],
  [/g(ä|ae)ste|guests|personen|teilnehmer/i, 'event.guests'],
  [/show|variante|programm|paket/i, 'event.showVariant'],
  [/datum|date/i, 'event.date'],
  [/uhrzeit|zeit|time|beginn/i, 'event.time'],
  [/titel|title|anlass|veranstaltung|event/i, 'event.title'],
  [/nachricht|message|anmerkung|kommentar|bemerkung|wunsch|text/i, 'event.message'],
];
export function suggestTarget(key, type) {
  if (type === 'checkbox' && /datenschutz|privacy|dsgvo|einwilligung|zustimm/i.test(key)) return null;
  const hit = SUGGESTIONS.find(([re]) => re.test(String(key)));
  return hit ? hit[1] : null;
}
export function suggestPrivacyField(fields) {
  const f = (fields || []).find((x) => x.type === 'checkbox' && /datenschutz|privacy|dsgvo|einwilligung|zustimm/i.test(x.key || x.name));
  return f ? (f.key || f.name) : null;
}

// ── Eingaben säubern ─────────────────────────────────────────────────────────
const INVISIBLE_RE = /[​-‏‪-‮⁦-⁩﻿]/g;

/** Wert → String; Listen (mehrere Checkboxen) werden mit ", " verbunden, Objekte verworfen. */
export function flatten(v) {
  if (Array.isArray(v)) return v.map(flatten).filter(Boolean).join(', ');
  if (v === null || v === undefined || typeof v === 'object') return '';
  return String(v);
}

export function sanitize(value, { max = 200, multiline = false } = {}) {
  let s = flatten(value).replace(/\r\n?/g, '\n').replace(INVISIBLE_RE, '');
  s = multiline
    ? s.replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, '')
    : s.replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ').replace(/ {2,}/g, ' ');
  s = s.trim();
  return [...s].slice(0, max).join('').trim();
}

/** Ist eine Checkbox wirklich angehakt? (ungesendet = nicht angehakt; "on"/"true"/"ja"/… = angehakt) */
export function isChecked(v) {
  const s = flatten(v).trim().toLowerCase();
  return s !== '' && !['false', '0', 'off', 'nein', 'no'].includes(s);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normDate(s) {
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  let y, mo, d, hh, mm;
  if (m) [, y, mo, d, hh, mm] = m;
  else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s))) { [, d, mo, y] = m; }
  else return null;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${y}-${pad(mo)}-${pad(d)}`, time: hh !== undefined ? normTime(`${hh}:${mm}`) : null };
}

function normTime(s) {
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(?:uhr)?$/i.exec(s);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
}

const toInt = (s) => { const m = /^\s*(\d+)/.exec(s); return m ? parseInt(m[1], 10) : null; };

/** Externe ID: stabil je Absendung, nur unkritische Zeichen, ≤ 200 Zeichen. */
export function makeExternalId(formId, submissionId) {
  const clean = (x, n) => String(x).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, n);
  return `temgine-${clean(formId, 80)}-${clean(submissionId, 80)}`;
}

/**
 * Formular-Werte → TNT-Body. Gibt null zurück, wenn die Datenschutz-Checkbox nicht angehakt ist.
 * mapping = { fields: { [feldname]: zielpfad }, privacyField }. Nicht zugeordnete Felder werden nie übertragen.
 */
export function buildInquiryPayload(formDefinition, values, mapping, submissionId) {
  const { fields = {}, privacyField } = mapping || {};
  if (!privacyField || !isChecked(values?.[privacyField])) return null;

  const acc = {};
  for (const [key, path] of Object.entries(fields)) {
    const t = TARGET_BY_PATH[path];
    if (!t) continue;
    const v = sanitize(values?.[key], t);
    if (!v) continue;
    acc[path] = acc[path] && t.multiline ? sanitize(`${acc[path]}\n${v}`, t) : (acc[path] || v);
  }

  const out = { customer: {}, event: {} };
  let dateTime = null;
  for (const [path, v] of Object.entries(acc)) {
    const t = TARGET_BY_PATH[path];
    const [group, name] = path.split('.');
    let val = v;
    if (t.kind === 'email') val = EMAIL_RE.test(v) ? v : null;
    else if (t.kind === 'date') { const d = normDate(v); val = d?.date || null; dateTime = d?.time || null; }
    else if (t.kind === 'time') val = normTime(v);
    else if (t.kind === 'duration') { const n = toInt(v); val = n >= 1 && n <= 1440 ? n : null; }
    else if (t.kind === 'guests') { const n = toInt(v); val = n >= 1 && n <= 1_000_000 ? n : null; }
    if (val !== null && val !== undefined && val !== '') out[group][name] = val;
  }
  if (out.event.date && !out.event.time && dateTime) out.event.time = dateTime;
  if (!out.event.date) delete out.event.time;

  const payload = { externalId: makeExternalId(formDefinition?.formId, submissionId), source: 'temgine', privacyAccepted: true };
  if (Object.keys(out.customer).length) payload.customer = out.customer;
  if (Object.keys(out.event).length) payload.event = out.event;

  // 20-KB-Limit: Freitext notfalls kürzen
  while (out.event.message && Buffer.byteLength(JSON.stringify(payload)) > MAX_BODY_BYTES) {
    out.event.message = [...out.event.message].slice(0, Math.max(0, [...out.event.message].length - 500)).join('');
    if (!out.event.message) delete out.event.message;
    if (!Object.keys(out.event).length) delete payload.event;
  }
  return payload;
}

/** Entspricht den 422-Regeln der Gegenseite; liefert die Namen ungültiger/fehlender Felder. */
export function validateInquiry(p) {
  const bad = [];
  if (!p || p.privacyAccepted !== true) bad.push('privacyAccepted');
  const c = p?.customer || {};
  if (!c.firstName && !c.lastName && !c.companyName) bad.push('customer.name');
  if (!c.email && !c.phone) bad.push('customer.contact');
  if (Buffer.byteLength(JSON.stringify(p || {})) > MAX_BODY_BYTES) bad.push('size');
  return bad;
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

/** Gültige Basis-URL (https, keine Zugangsdaten/Query/Fragment) oder null. Ohne Slash am Ende. */
export function normalizeBaseUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || !u.hostname) return null;
  // Versehentlich mit eingetragenes /api/inquiries entfernen (der Pfad wird beim Senden selbst angehängt)
  return `${u.origin}${u.pathname.replace(/\/+$/, '').replace(/\/api\/inquiries$/i, '')}`;
}

/** Fehler → generischer Code. Nie die Fehlermeldung selbst weitergeben (kann URLs enthalten). */
export function errorCode(err) {
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return 'TIMEOUT';
  const code = String(err?.cause?.code || err?.code || '');
  if (/CERT|SELF_SIGNED|UNABLE_TO_(VERIFY|GET)|ERR_TLS|DEPTH_ZERO|HOSTNAME_MISMATCH|ALTNAME/i.test(code)) return 'CERT';
  if (/^[A-Z0-9_]{3,30}$/.test(code)) return code;
  return 'NETWORK';
}

const MAX_ANSWER_BYTES = 4096;

/** Liest höchstens 4 KB der Antwort; übernimmt nur appointmentId (Ganzzahl > 0) und appointmentUrl (https, Host = Basis-Host, ohne Userinfo). Nie loggen. */
export async function readAnswer(res, base) {
  const out = { appointmentId: null, appointmentUrl: null };
  try {
    let text = '';
    if (res.body?.getReader) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let size = 0;
      while (size < MAX_ANSWER_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        text += dec.decode(value, { stream: true });
      }
      try { await reader.cancel(); } catch { /* egal */ }
    } else if (typeof res.text === 'function') text = await res.text();
    const j = JSON.parse(text.slice(0, MAX_ANSWER_BYTES));
    if (Number.isInteger(j?.appointmentId) && j.appointmentId > 0) out.appointmentId = j.appointmentId;
    if (typeof j?.appointmentUrl === 'string' && j.appointmentUrl.length <= 500) {
      const u = new URL(j.appointmentUrl);
      if (u.protocol === 'https:' && !u.username && !u.password && u.host === new URL(base).host) out.appointmentUrl = u.href;
    }
  } catch { /* unlesbar: ohne Zusatzdaten */ }
  return out;
}

/**
 * Sendet einen Request an TNT. Wirft nie; Ergebnis: { status, headers } oder { error: <Code> }.
 * Kein http, keine Weiterleitungen, TLS-Prüfung unverändert (kein Agent/Option, die sie abschaltet).
 */
export async function postInquiry({ baseUrl, token, payload, dryRun = false, fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, readBody = false }) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return { error: 'HTTPS' };
  if (!token) return { error: 'NO_TOKEN' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/api/inquiries${dryRun ? '?dryRun=1' : ''}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: ctl.signal,
    });
    // Antwortinhalt wird nur bei readBody gelesen (Mail-Pfad) und auf appointmentId/appointmentUrl reduziert.
    if (readBody && (res.status === 200 || res.status === 201)) return { status: res.status, headers: res.headers, answer: await readAnswer(res, base) };
    try { await res.body?.cancel?.(); } catch { /* nicht gebraucht */ }
    return { status: res.status, headers: res.headers };
  } catch (e) {
    return { error: errorCode(e) };
  } finally {
    clearTimeout(timer);
  }
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const k = Object.keys(headers).find((x) => x.toLowerCase() === name);
  return k ? headers[k] : null;
}

export function parseRetryAfter(headers, now = Date.now()) {
  const v = headerValue(headers, 'retry-after');
  if (!v) return null;
  const secs = /^\d+$/.test(String(v).trim()) ? Number(v) * 1000 : Date.parse(v) - now;
  return Number.isFinite(secs) ? Math.min(Math.max(secs, 0), 24 * HOUR) : null;
}

/** HTTP-Status → Aktion (Tabelle in der Vorgabe). */
export function classifyResponse(status, headers) {
  if (status === 200 || status === 201) return { action: 'delivered', retryAfterMs: null };
  if (status === 401) return { action: 'alert', alert: 'AUTH', retryAfterMs: null };
  if (status === 403) return { action: 'alert', alert: 'HTTPS', retryAfterMs: null };
  if (status === 429) return { action: 'retry', retryAfterMs: parseRetryAfter(headers) };
  if (status >= 500) return { action: 'retry', retryAfterMs: null };
  return { action: 'fail-permanent', retryAfterMs: null };
}

/** Wartezeit nach dem n-ten (1-basiert) fehlgeschlagenen Versuch. */
export const nextDelay = (attempt) => DELAYS_MS[Math.min(Math.max(attempt, 1), DELAYS_MS.length) - 1];

// ── Outbox ───────────────────────────────────────────────────────────────────

const logStatus = (id, what) => console.warn(`[tnt-inquiries] ${id} ${what}`);

/**
 * rt = { baseUrl, token, fetchImpl?, encrypt(str), decrypt(str), setAlert(code), clearAlert() }
 * Legt den Eintrag an (gesperrt für den Worker) und gibt die Zeile zurück; null bei Duplikat.
 */
export async function enqueue(prisma, rt, { formId, submissionId, payload }, now = new Date()) {
  try {
    return await prisma.inquiryOutbox.create({
      data: {
        formId, submissionId, externalId: payload.externalId,
        payload: rt.encrypt(JSON.stringify(payload)),
        nextAttemptAt: new Date(now.getTime() + LEASE_MS),
      },
    });
  } catch (e) {
    if (e?.code === 'P2002') return null;
    throw e;
  }
}

/** Ein Zustellversuch für eine bereits gesperrte/besessene Zeile. */
export async function deliver(prisma, rt, row, now = new Date()) {
  const upd = (data) => prisma.inquiryOutbox.update({ where: { id: row.id }, data });
  let payload;
  try { payload = JSON.parse(rt.decrypt(row.payload)); } catch {
    logStatus(row.id, 'failed DECRYPT');
    return { row: await upd({ status: 'failed', payload: null, lastError: 'DECRYPT' }), answer: null };
  }
  const res = await postInquiry({ baseUrl: rt.baseUrl, token: rt.token, payload, fetchImpl: rt.fetchImpl, timeoutMs: rt.timeoutMs, readBody: rt.readBody });
  const attempts = row.attempts + 1;
  const code = res.status ?? null;

  let c;
  if (res.error === 'CERT' || res.error === 'HTTPS' || res.error === 'NO_TOKEN') c = { action: 'alert', alert: res.error === 'CERT' ? 'CERT' : res.error === 'HTTPS' ? 'HTTPS' : 'AUTH' };
  else if (res.error) c = { action: 'retry', retryAfterMs: null };
  else c = classifyResponse(res.status, res.headers);
  const errTag = res.error || `HTTP_${res.status}`;
  logStatus(row.id, `result ${code ?? errTag}`);

  if (c.action === 'delivered') {
    await rt.clearAlert();
    return { answer: res.answer || null, row: await upd({ status: 'delivered', payload: null, attempts, lastStatusCode: code, lastError: null, deliveredAt: now }) };
  }
  if (c.action === 'alert') { // Absendung bleibt erhalten, Versuch wird nicht verbraucht
    await rt.setAlert(c.alert);
    return { row: await upd({ nextAttemptAt: new Date(now.getTime() + HOLD_MS), lastStatusCode: code, lastError: errTag }), answer: null };
  }
  if (c.action === 'retry' && attempts < MAX_ATTEMPTS) {
    const wait = c.retryAfterMs ?? nextDelay(attempts);
    return { row: await upd({ attempts, nextAttemptAt: new Date(now.getTime() + wait), lastStatusCode: code, lastError: errTag }), answer: null };
  }
  // fail-permanent oder Versuche aufgebraucht: Payload bleibt (für „Erneut senden“) bis zur Aufbewahrungsfrist
  return { answer: null, row: await upd({ status: 'failed', attempts, lastStatusCode: code, lastError: c.action === 'retry' ? 'RETRIES_EXHAUSTED' : errTag }) };
}

/** Sofortversuch direkt nach dem Anlegen. Fängt jeden Fehler ab. */
export async function deliverSafely(prisma, rt, row, now = new Date()) {
  try { return await deliver(prisma, rt, row, now); } catch { logStatus(row.id, 'error INTERNAL'); return null; }
}

/** Fällige Einträge senden. Hält komplett an, solange ein blockierender Alarm besteht. */
export async function processOutbox(prisma, now = new Date(), rt) {
  if (BLOCKING_ALERTS.includes(await rt.getAlertCode())) return { held: true, processed: 0 };
  const due = await prisma.inquiryOutbox.findMany({
    where: { status: 'pending', nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' }, take: 20,
  });
  let processed = 0;
  for (const row of due) {
    const claim = await prisma.inquiryOutbox.updateMany({
      where: { id: row.id, status: 'pending', nextAttemptAt: { lte: now } },
      data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
    });
    if (claim.count !== 1) continue;
    await deliverSafely(prisma, rt, row, now);
    processed += 1;
    if (BLOCKING_ALERTS.includes(await rt.getAlertCode())) break;
  }
  return { held: false, processed };
}

/** Datensparsamkeit: nicht zugestellte Einträge (inkl. Personendaten) nach 30 Tagen entfernen. */
export function cleanupOutbox(prisma, now = new Date()) {
  return prisma.inquiryOutbox.deleteMany({
    where: { status: { not: 'delivered' }, createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } },
  });
}

/** Nach Behebung eines Alarms: gehaltene Einträge sofort wieder fällig stellen. */
export function releaseHeld(prisma, now = new Date()) {
  return prisma.inquiryOutbox.updateMany({ where: { status: 'pending' }, data: { nextAttemptAt: now } });
}

/** „Erneut senden“: nur fehlgeschlagene mit noch vorhandenem Inhalt. */
export async function retryFailed(prisma, id, now = new Date()) {
  const r = await prisma.inquiryOutbox.updateMany({
    where: { id, status: 'failed', payload: { not: null } },
    data: { status: 'pending', attempts: 0, nextAttemptAt: now, lastError: null },
  });
  return r.count === 1;
}
