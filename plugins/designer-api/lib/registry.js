import crypto from 'crypto';

// Register für Kopplungscodes und ausgestellte Tokens. Ein einziger JSON-Wert im Temgine-Setting
// `designer-api_registry` (keine Datenbanktabelle, kein Prozess-Speicher): übersteht Neustarts und mehrere Prozesse.
// Schreiben per Vergleich-und-Tausch (`state.cas`): wer verliert, liest neu und versucht es erneut. Dadurch wird ein
// Code auch bei gleichzeitiger Einlösung genau einmal verbraucht. Keine Temgine-Importe: `state` kommt über core.
//   state = { get(key) -> string|null, cas(key, erwartet|null, neu) -> boolean, set(key, wert) }

export const KEY = 'designer-api_registry';
export const PASSWORD_OFF_KEY = 'designer-api_password_login_off';
export const DISABLED_KEY = 'designer-api_disabled';
export const READ_ONLY_KEY = 'designer-api_read_only';
export const CODE_TTL_MS = 5 * 60 * 1000;
export const CODE_KEEP_MS = 60 * 60 * 1000; // abgelaufene/verbrauchte Codes bleiben für genauere Fehlermeldungen
export const MAX_OPEN_CODES = 5;
export const MAX_TTL_HOURS = 24 * 365;
export const DEFAULT_TTL_HOURS = 24 * 30;

export class PairingError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function memoryState() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    cas: async (k, expected, next) => { if ((m.has(k) ? m.get(k) : null) !== expected) return false; m.set(k, next); return true; },
    set: async (k, v) => { m.set(k, v); },
  };
}

const parse = (raw) => {
  try { const r = JSON.parse(raw || '{}'); return { codes: Array.isArray(r.codes) ? r.codes : [], tokens: Array.isArray(r.tokens) ? r.tokens : [] }; } catch (_e) { return { codes: [], tokens: [] }; }
};
const prune = (reg, now) => {
  reg.tokens = reg.tokens.filter((t) => t.exp > now);
  reg.codes = reg.codes.filter((c) => c.exp + CODE_KEEP_MS > now);
};

export const normalizeCode = (input) => String(input ?? '').replace(/[\s-]/g, '');
const hashCode = (code, secret) => crypto.createHmac('sha256', secret).update(`pairing:${code}`).digest('hex');

// Liest das Register, wendet fn darauf an und schreibt per cas; bei verlorenem Wettlauf mit frischem Stand wiederholen.
async function update(state, now, fn) {
  for (let i = 0; i < 8; i++) {
    const raw = await state.get(KEY);
    const reg = parse(raw);
    prune(reg, now);
    const result = fn(reg);
    if (await state.cas(KEY, raw, JSON.stringify(reg))) return result;
  }
  throw new Error('Register ist stark umkämpft, bitte erneut versuchen');
}

export const readRegistry = async (state, now) => { const r = parse(await state.get(KEY)); prune(r, now); return r; };

const clampTtl = (hours) => {
  const n = Number(hours ?? DEFAULT_TTL_HOURS);
  if (!Number.isFinite(n) || n < 1 || n > MAX_TTL_HOURS) throw new PairingError(400, 'VALIDATION_ERROR', `Laufzeit muss zwischen 1 und ${MAX_TTL_HOURS} Stunden liegen`);
  return Math.round(n * 3600 * 1000);
};

// by = { sub, name, role } des Admins, der den Code erzeugt. -> { code (8 Ziffern), expiresAt }
export async function createCode(state, { now, secret, by, access = 'write', ttlHours }) {
  if (!['read', 'write'].includes(access)) throw new PairingError(400, 'VALIDATION_ERROR', 'Zugriff muss „read“ oder „write“ sein');
  const ttlMs = clampTtl(ttlHours);
  const code = String(crypto.randomInt(0, 1e8)).padStart(8, '0');
  const h = hashCode(code, secret);
  await update(state, now, (reg) => {
    if (reg.codes.filter((c) => !c.used && c.exp > now).length >= MAX_OPEN_CODES) throw new PairingError(429, 'TOO_MANY_CODES', `Es sind schon ${MAX_OPEN_CODES} Codes offen, bitte erst einlösen oder 5 Minuten warten`);
    reg.codes.push({ h, exp: now + CODE_TTL_MS, access, ttlMs, by });
  });
  return { code, expiresAt: new Date(now + CODE_TTL_MS).toISOString() };
}

// Löst einen Code ein (einmalig) und trägt das Token ein. -> Token-Eintrag { id, name, role, access, exp, … }
export async function redeemCode(state, { now, secret, code, label }) {
  const digits = normalizeCode(code);
  if (!/^\d{8}$/.test(digits)) throw new PairingError(400, 'CODE_INVALID', 'Der Code besteht aus 8 Ziffern');
  const h = hashCode(digits, secret);
  const id = crypto.randomBytes(8).toString('hex');
  return update(state, now, (reg) => {
    const c = reg.codes.find((x) => x.h === h);
    if (!c) throw new PairingError(401, 'CODE_INVALID', 'Der Code ist falsch. Bitte in Temgine einen neuen Code erzeugen.');
    if (c.used) throw new PairingError(401, 'CODE_USED', 'Der Code wurde schon verwendet. Bitte in Temgine einen neuen Code erzeugen.');
    if (c.exp <= now) throw new PairingError(401, 'CODE_EXPIRED', 'Der Code ist abgelaufen (5 Minuten). Bitte in Temgine einen neuen Code erzeugen.');
    c.used = true;
    const entry = { id, name: c.by.name, sub: c.by.sub, role: c.by.role, access: c.access, via: 'code', label: String(label || '').slice(0, 60) || null, iat: now, exp: now + c.ttlMs };
    reg.tokens.push(entry);
    return entry;
  });
}

// Token der Passwort-Anmeldung eintragen (damit es in der Liste steht und widerrufbar ist)
export async function registerToken(state, { now, entry }) {
  await update(state, now, (reg) => { reg.tokens.push({ ...entry, id: entry.id || crypto.randomBytes(8).toString('hex'), iat: now }); });
}

export async function revokeToken(state, { now, id }) {
  return update(state, now, (reg) => { const n = reg.tokens.length; reg.tokens = reg.tokens.filter((t) => t.id !== id); return reg.tokens.length < n; });
}

// -> Eintrag oder null (widerrufen/abgelaufen/unbekannt); nur lesen, kein Schreibzugriff pro Anfrage
export async function findToken(state, { now, id }) {
  const reg = await readRegistry(state, now);
  return reg.tokens.find((t) => t.id === id) || null;
}

export const switchOn = async (state, key) => (await state?.get(key)) === 'true'; // ohne state (Test-Kerne) nie aus

export async function passwordLoginAllowed(state) { return (await state.get(PASSWORD_OFF_KEY)) !== 'true'; }
