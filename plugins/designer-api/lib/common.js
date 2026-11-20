import crypto from 'crypto';
import { verifyToken } from './tokens';
import { findToken, switchOn, DISABLED_KEY, READ_ONLY_KEY } from './registry';

// Gemeinsame Bausteine der Routen-Dateien (lib/routes/*.js). Keine Temgine-Importe: alles Kernspezifische
// kommt über `core` (server.js verdrahtet es).

export const SUPPORTED_VERSIONS = [1, 2];
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const NAME_RE = /^[^\\/:*?"<>|\u0000-\u001f]{1,100}$/;
export const KINDS = ['block', 'site', 'contact', 'blog-master', 'blog-preview', 'page-fields'];
export const MAX_CODE = 500 * 1024;

// Temgine-Typ (BLOCK | SITE | PAGE_FIELDS) <-> Designer-Art
const TYPE_KIND = { SITE: 'site', PAGE_FIELDS: 'page-fields' };
export const toKind = (t) => (t.category === 'contact' ? 'contact'
  : t.blogRole === 'master' ? 'blog-master'
    : t.blogRole === 'preview' ? 'blog-preview'
      : TYPE_KIND[String(t.type).toUpperCase()] || 'block');

export const fromKind = (kind, master) => ({
  type: kind === 'site' ? 'SITE' : kind === 'page-fields' ? 'PAGE_FIELDS' : 'BLOCK',
  blogRole: kind === 'blog-master' ? 'master' : kind === 'blog-preview' ? 'preview' : null,
  masterTemplateName: kind === 'blog-preview' ? master : null,
  category: kind === 'contact' ? 'contact' : null,
});

export const shape = (t, extra = {}) => ({ name: t.name, kind: toKind(t), master: t.masterTemplateName || null, code: t.code, hash: sha256(t.code), ...extra });

// Header `X-Designer-Api: 1,2` -> höchste gemeinsame Version; ohne Angabe 1 (v1-Verhalten); keine Übereinstimmung -> null.
export function negotiate(header) {
  if (header === undefined || header === null || !String(header).trim()) return 1;
  const common = String(header).split(',').map((s) => Number(s.trim())).filter((n) => SUPPORTED_VERSIONS.includes(n));
  return common.length ? Math.max(...common) : null;
}

// `If-Match: "<hash>"` -> hash oder null
export const ifMatchHash = (req) => {
  const raw = String(req.headers?.['if-match'] || '').trim().replace(/^W\//, '').replace(/^"(.*)"$/, '$1');
  return raw && raw !== '*' ? raw : null;
};

// Paginierung nur in v2 und nur mit `limit`/`cursor`; sonst bleibt die Liste ein einfaches Array (wie v1).
// -> { body } oder { bad: 'Text' }. Cursor = Schlüssel des letzten Eintrags (stabil bei Änderungen zwischen den Seiten).
export function paginate(ctx, items, key) {
  const { limit, cursor } = ctx.query || {};
  if (ctx.v < 2 || (limit === undefined && cursor === undefined)) return { body: items };
  const n = limit === undefined ? 50 : Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > 500) return { bad: 'limit muss eine ganze Zahl von 1 bis 500 sein', path: 'limit' };
  let last = null;
  if (cursor !== undefined) {
    try { last = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8')); } catch (_e) { last = undefined; }
    if (typeof last !== 'string') return { bad: 'Ungültiger cursor', path: 'cursor' };
  }
  const sorted = [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)).filter((i) => last === null || key(i) > last);
  const page = sorted.slice(0, n);
  return { body: { items: page, nextCursor: sorted.length > n ? Buffer.from(JSON.stringify(key(page[page.length - 1]))).toString('base64url') : null, total: items.length } };
}

// ETag ab v2. Next.js überschreibt den Standard-Header ETag mit einem eigenen Inhalts-Hash, deshalb zusätzlich X-Designer-ETag
// (verlässlich = SHA-256 des Codes, identisch mit `hash` im Body). If-Match akzeptiert diesen Wert.
export const setEtag = (res, ctx, hash) => { if (ctx.v >= 2) { res.setHeader('ETag', `"${hash}"`); res.setHeader('X-Designer-ETag', `"${hash}"`); } };

export const isDryRun = (req, ctx) => ctx.v >= 2 && (ctx.query?.dryRun === '1' || ctx.query?.dryRun === 'true' || req.body?.dryRun === true);

// Fehlerantwort; ab v2 zusätzlich `errors: [{code,message,path}]`. extra.path wird nur in die Liste übernommen.
const makeFail = (res, v) => (status, error, code = 'ERROR', extra = {}) => {
  const { path = null, ...rest } = extra;
  const body = { error, code, ...rest };
  if (v >= 2) {
    body.errors = Array.isArray(rest.details) && rest.details.length
      ? rest.details.map((e) => ({ code: e.code, message: e.message, path: e.path ?? null }))
      : [{ code, message: error, path }];
  }
  return res.status(status).json(body);
};

export function createKit(core) {
  const secret = () => core.secret();

  // Aushandlung + ctx.v/ctx.fail für jede Route
  // `always`: Route ignoriert „Designer-Zugriff aus“ (Info, Admin-Routen; sonst ließe sich der Schalter nicht zurücknehmen)
  const gate = (handler, always) => async (req, res, ctx) => {
    const v = negotiate(req.headers?.['x-designer-api']);
    const c = { ...ctx, v: v || 1, fail: makeFail(res, v === null ? 2 : v) };
    if (v === null) return c.fail(406, `Keine gemeinsame API-Version (Plugin unterstützt ${SUPPORTED_VERSIONS.join(', ')})`, 'API_VERSION_UNSUPPORTED', { apiVersions: SUPPORTED_VERSIONS });
    res.setHeader?.('X-Designer-Api', String(v));
    if (!always && await switchOn(core.state, DISABLED_KEY)) return c.fail(403, 'Der Designer-Zugriff ist in Temgine ausgeschaltet (Einstellungen → Plugins → Designer verbinden).', 'DESIGNER_DISABLED');
    return handler(req, res, c);
  };

  // Routen mit Admin-Sitzung (auth ≠ public) und `always: true` gelten immer
  const open = (handler, { always, ...extra } = {}) => ({ auth: 'public', ...extra, handler: gate(handler, always || (extra.auth && extra.auth !== 'public')) });

  // Route mit Token-Prüfung; `right` = Schlüssel in core.roles (wird bei jeder Anfrage gelesen, die
  // Rollen-Overrides von Temgine können sich ändern) oder null (jede gültige Anmeldung).
  // `readOnlyOk`: POST-Route ohne Schreibwirkung (Vorschau, Prüfung), die auch ein „nur lesen“-Token nutzen darf.
  const authed = (right, handler, { readOnlyOk = false, ...extra } = {}) => open(async (req, res, ctx) => {
    const s = secret();
    if (!s) return ctx.fail(503, 'Plugin nicht eingerichtet (kein Secret)', 'NOT_CONFIGURED');
    const m = /^Bearer (.+)$/.exec(req.headers?.authorization || '');
    const user = m && verifyToken(m[1], s, core.now());
    if (!user) return ctx.fail(401, 'Nicht angemeldet', 'UNAUTHORIZED');
    // Tokens mit Kennung (jti) gelten nur, solange sie im Register stehen (Widerruf wirkt sofort).
    // ponytail: Tokens ohne jti stammen aus Plugin < 2.1 und laufen nach höchstens 8 h von selbst ab.
    if (user.jti && !(await findToken(core.state, { now: core.now(), id: user.jti }))) return ctx.fail(401, 'Token widerrufen oder abgelaufen', 'TOKEN_REVOKED');
    if (user.access === 'read' && !readOnlyOk && !['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) return ctx.fail(403, 'Diese Verbindung ist nur lesend', 'READ_ONLY');
    if (!readOnlyOk && !['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase()) && await switchOn(core.state, READ_ONLY_KEY)) return ctx.fail(403, 'Der Designer ist in Temgine global auf „nur lesen“ gestellt', 'READ_ONLY');
    if (right && !core.roles[right].includes(user.role)) return ctx.fail(403, 'Keine Berechtigung', 'FORBIDDEN');
    res.setHeader?.('Cache-Control', 'private, no-store');
    try { return await handler(req, res, ctx, user); } catch (e) { ctx.log?.error?.(`designer-api: ${e.message}`); return ctx.fail(500, 'Interner Fehler', 'INTERNAL'); }
  }, extra);

  const audit = (user, action, resourceId, details) => core.audit({ action: `designer.${action}`, resource: 'designer', resourceId, userId: user.sub, details });

  // getMaster: Suche nach dem Blog-Master (Standard: Store); die Sammelübertragung (routes/bulk.js) kennt auch Master derselben Anfrage.
  async function validateTemplate({ code, kind, master }, getMaster = core.store.getTemplateByName) {
    const errors = [];
    if (typeof code !== 'string' || !code.trim()) errors.push({ code: 'CODE_REQUIRED', message: 'Code fehlt', path: 'code' });
    else if (code.length > MAX_CODE) errors.push({ code: 'CODE_TOO_LARGE', message: 'Code zu groß', path: 'code' });
    if (!KINDS.includes(kind)) errors.push({ code: 'KIND_INVALID', message: `Unbekannte Art: ${kind}`, path: 'kind' });
    if (kind === 'blog-preview' && !errors.length) {
      const m = master && getMaster(master);
      if (!m) errors.push({ code: 'MASTER_TEMPLATE_NOT_FOUND', message: 'Master-Template nicht gefunden', path: 'master' });
      else {
        const sub = core.validatePreviewSubset(code, m.code);
        if (!sub.ok) errors.push({ code: 'PREVIEW_PLACEHOLDER_MISMATCH', message: 'Vorschau enthält Platzhalter, die nicht im Master vorkommen', path: 'code', details: sub.invalid });
      }
    }
    return errors;
  }

  const varNames = (code) => core.extractTemplateVariables(code).map((v) => (typeof v === 'string' ? v : v.name));

  return { core, open, authed, audit, validateTemplate, varNames, features: [] };
}
