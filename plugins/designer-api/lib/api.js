import crypto from 'crypto';
import { signToken, verifyToken } from './tokens';

// Routen der Designer-API (Vertrag: docs/TEMGINE-API.md im Designer-Repo). Alle Kernabhängigkeiten
// kommen über `core` (server.js verdrahtet sie), damit diese Datei ohne Temgine testbar bleibt.
// Auth: alle Routen sind für den Kern 'public'; das Bearer-Token wird hier geprüft.

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const NAME_RE = /^[^\\/:*?"<>|\u0000-\u001f]{1,100}$/;
const KINDS = ['block', 'site', 'contact', 'blog-master', 'blog-preview'];
const FIELD_TYPES = ['text', 'textarea', 'number', 'url', 'image', 'date', 'select', 'color', 'array', 'checkbox'];
const SYSTEM_VARS = ['page.title', 'page.slug', 'page.isChild', 'page.data.*', 'global.*', 'data.*', 'widget.*', 'inner'];
const NAV_VARS = ['nav:main', 'nav:page', 'nav:mobile', 'nav:auto'];
const MAX_CODE = 500 * 1024;

const fail = (res, status, error, code = 'ERROR', details = null) =>
  res.status(status).json({ error, code, ...(details ? { details } : {}) });

export const toKind = (t) => (t.category === 'contact' ? 'contact'
  : t.blogRole === 'master' ? 'blog-master'
    : t.blogRole === 'preview' ? 'blog-preview'
      : String(t.type).toUpperCase() === 'SITE' ? 'site' : 'block');

const fromKind = (kind, master) => ({
  type: kind === 'site' ? 'SITE' : 'BLOCK',
  blogRole: kind === 'blog-master' ? 'master' : kind === 'blog-preview' ? 'preview' : null,
  masterTemplateName: kind === 'blog-preview' ? master : null,
  category: kind === 'contact' ? 'contact' : null,
});

const shape = (t, extra = {}) => ({ name: t.name, kind: toKind(t), master: t.masterTemplateName || null, code: t.code, hash: sha256(t.code), ...extra });

export function createRoutes(core) {
  const secret = () => core.secret();

  // Route mit Token-Prüfung; `right` = Schlüssel in core.roles (wird bei jeder Anfrage gelesen, die
  // Rollen-Overrides von Temgine können sich ändern) oder null (jede gültige Anmeldung).
  const authed = (right, handler, extra = {}) => ({
    auth: 'public',
    ...extra,
    handler: async (req, res, ctx) => {
      const s = secret();
      if (!s) return fail(res, 503, 'Plugin nicht eingerichtet (kein Secret)', 'NOT_CONFIGURED');
      const m = /^Bearer (.+)$/.exec(req.headers?.authorization || '');
      const user = m && verifyToken(m[1], s, core.now());
      if (!user) return fail(res, 401, 'Nicht angemeldet', 'UNAUTHORIZED');
      if (right && !core.roles[right].includes(user.role)) return fail(res, 403, 'Keine Berechtigung', 'FORBIDDEN');
      res.setHeader?.('Cache-Control', 'private, no-store');
      try { return await handler(req, res, ctx, user); } catch (e) { ctx.log?.error?.(`designer-api: ${e.message}`); return fail(res, 500, 'Interner Fehler', 'INTERNAL'); }
    },
  });

  const audit = (user, action, resourceId, details) => core.audit({ action: `designer.${action}`, resource: 'designer', resourceId, userId: user.sub, details });

  async function validateTemplate({ code, kind, master }) {
    const errors = [];
    if (typeof code !== 'string' || !code.trim()) errors.push({ code: 'CODE_REQUIRED', message: 'Code fehlt' });
    else if (code.length > MAX_CODE) errors.push({ code: 'CODE_TOO_LARGE', message: 'Code zu groß' });
    if (!KINDS.includes(kind)) errors.push({ code: 'KIND_INVALID', message: `Unbekannte Art: ${kind}` });
    if (kind === 'blog-preview' && !errors.length) {
      const m = master && core.store.getTemplateByName(master);
      if (!m) errors.push({ code: 'MASTER_TEMPLATE_NOT_FOUND', message: 'Master-Template nicht gefunden' });
      else {
        const sub = core.validatePreviewSubset(code, m.code);
        if (!sub.ok) errors.push({ code: 'PREVIEW_PLACEHOLDER_MISMATCH', message: 'Vorschau enthält Platzhalter, die nicht im Master vorkommen', details: sub.invalid });
      }
    }
    return errors;
  }

  const varNames = (code) => core.extractTemplateVariables(code).map((v) => (typeof v === 'string' ? v : v.name));

  return {
    'POST v1/auth/login': {
      auth: 'public',
      rateLimit: { windowMs: 15 * 60 * 1000, max: 10 },
      handler: async (req, res, ctx) => {
        const s = secret();
        if (!s) return fail(res, 503, 'Plugin nicht eingerichtet (kein Secret)', 'NOT_CONFIGURED');
        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');
        if (!username || !password) return fail(res, 400, 'Benutzername und Passwort erforderlich', 'VALIDATION_ERROR');
        const user = await ctx.prisma.user.findFirst({
          where: { password: { not: null }, OR: [{ email: { equals: username, mode: 'insensitive' } }, { name: { equals: username, mode: 'insensitive' } }] },
          select: { id: true, name: true, email: true, password: true, role: true },
        });
        const hash = user?.password || '';
        const valid = hash && (hash.startsWith('$2') ? await core.bcrypt.compare(password, hash) : hash === sha256(password));
        if (!valid) return fail(res, 401, 'Anmeldung fehlgeschlagen', 'LOGIN_FAILED');
        if (!core.roles.edit.includes(user.role)) return fail(res, 403, 'Diese Rolle darf keine Templates bearbeiten', 'FORBIDDEN');
        const t = signToken({ sub: user.id, name: user.name || user.email, role: user.role }, s, undefined, core.now());
        await audit({ sub: user.id }, 'login', user.id, null);
        return res.status(200).json({ token: t.token, expiresAt: t.expiresAt, user: { name: user.name || user.email, role: user.role } });
      },
    },

    'GET v1/capabilities': authed('view', (req, res) => res.status(200).json({
      temgineVersion: core.version,
      apiVersion: 1,
      fieldTypes: FIELD_TYPES,
      systemVars: SYSTEM_VARS,
      navVars: NAV_VARS,
      sectionProviders: Object.keys(core.sectionProviders()).map((prefix) => ({ prefix })),
      templateKinds: KINDS,
    })),

    'GET v1/templates': authed('view', async (req, res, ctx) => {
      const used = await core.getUsedTemplateNames();
      let list = core.store.listTemplates().map((t) => shape(t, { isUsed: used.has(t.name) }));
      if (ctx.query?.kind) list = list.filter((t) => t.kind === ctx.query.kind);
      return res.status(200).json(list);
    }),

    'GET v1/templates/:name': authed('view', async (req, res, ctx) => {
      const t = core.store.getTemplateByName(ctx.params.name);
      if (!t) return fail(res, 404, 'Template nicht gefunden', 'TEMPLATE_NOT_FOUND');
      const used = await core.getUsedTemplateNames();
      return res.status(200).json(shape(t, { isUsed: used.has(t.name) }));
    }),

    'PUT v1/templates/:name': authed('edit', async (req, res, ctx, user) => {
      const { name } = ctx.params;
      const { code, kind = 'block', master = null, newName, expectedHash } = req.body || {};
      const target = String(newName || name).trim();
      if (!NAME_RE.test(name) || !NAME_RE.test(target) || target.startsWith('.')) return fail(res, 400, 'Ungültiger Template-Name', 'VALIDATION_ERROR');
      const errors = await validateTemplate({ code, kind, master });
      if (errors.length) return fail(res, 400, errors[0].message, errors[0].code, errors);

      const existing = core.store.getTemplateByName(name);
      if (existing && expectedHash && sha256(existing.code) !== expectedHash) {
        return res.status(409).json({ error: 'Template wurde in Temgine geändert', code: 'TEMPLATE_CHANGED', current: shape(existing) });
      }
      const clash = target.toLowerCase() !== name.toLowerCase() && core.store.getTemplateByName(target);
      if (clash) return fail(res, 409, 'Name bereits vergeben', 'NAME_TAKEN');

      const saved = core.store.saveTemplate({ name: target, code, ...fromKind(kind, master) }, existing ? existing.name : null);
      await audit(user, existing ? 'template.update' : 'template.create', target, { kind });
      return res.status(200).json({ name: saved.name, kind, hash: sha256(code) });
    }, { rateLimit: { windowMs: 60000, max: 120 } }),

    'DELETE v1/templates/:name': authed('delete', async (req, res, ctx, user) => {
      const t = core.store.getTemplateByName(ctx.params.name);
      if (!t) return fail(res, 404, 'Template nicht gefunden', 'TEMPLATE_NOT_FOUND');
      if ((await core.getUsedTemplateNames()).has(t.name) && ctx.query?.force !== '1') return fail(res, 409, 'Template wird verwendet', 'TEMPLATE_IN_USE');
      core.store.deleteTemplateByName(t.name);
      await audit(user, 'template.delete', t.name, null);
      return res.status(200).json({ ok: true });
    }),

    'POST v1/validate': authed('view', async (req, res) => {
      const { code, kind = 'block', master = null } = req.body || {};
      const errors = await validateTemplate({ code, kind, master });
      return res.status(200).json({ ok: !errors.length, variables: errors.length ? [] : varNames(code), errors });
    }),

    'POST v1/preview': authed('view', (req, res) => {
      const { code, props = {}, page = {}, children = [] } = req.body || {};
      if (typeof code !== 'string' || code.length > MAX_CODE) return fail(res, 400, 'Code fehlt oder zu groß', 'VALIDATION_ERROR');
      const data = { ...props, page: { title: 'Beispiel', slug: 'beispiel', isChild: false, ...page }, inner: (Array.isArray(children) ? children : []).map(String).join('') };
      const warnings = varNames(code).filter((n) => !n.includes('.') && !n.includes(':') && props[n] === undefined).map((n) => `Variable '${n}' hat keinen Wert`);
      return res.status(200).json({ html: core.renderTemplate(code, data), warnings });
    }),

    'GET v1/css': authed('cssView', (req, res) => res.status(200).json(
      core.externCss.list().filter((f) => f.filename.startsWith('designer-')).map((f) => ({ filename: f.filename, content: f.content, hash: sha256(f.content) })),
    )),

    'PUT v1/css/:file': authed('cssEdit', async (req, res, ctx, user) => {
      const filename = core.externCss.normalize(ctx.params.file);
      const { content, expectedHash } = req.body || {};
      if (!filename.startsWith('designer-')) return fail(res, 400, 'Nur Dateien mit dem Namensanfang "designer-" erlaubt', 'VALIDATION_ERROR');
      if (typeof content !== 'string') return fail(res, 400, 'Inhalt fehlt', 'VALIDATION_ERROR');
      const existing = core.externCss.list().find((f) => f.filename === filename);
      if (existing && expectedHash && sha256(existing.content) !== expectedHash) {
        return res.status(409).json({ error: 'CSS-Datei wurde in Temgine geändert', code: 'CSS_CHANGED', current: { filename, content: existing.content, hash: sha256(existing.content) } });
      }
      core.externCss.write(filename, content);
      await audit(user, 'css.write', filename, null);
      return res.status(200).json({ filename, hash: sha256(content) });
    }),

    'DELETE v1/css/:file': authed('cssDelete', async (req, res, ctx, user) => {
      const filename = core.externCss.normalize(ctx.params.file);
      if (!filename.startsWith('designer-') || !core.externCss.list().some((f) => f.filename === filename)) return fail(res, 404, 'Datei nicht gefunden', 'NOT_FOUND');
      core.externCss.remove(filename);
      await audit(user, 'css.delete', filename, null);
      return res.status(200).json({ ok: true });
    }),

    'GET v1/assets': authed('filesView', (req, res, ctx) => res.status(200).json(core.listUploads(String(ctx.query?.path || ''))
      .map((i) => ({ path: i.path, url: i.url, name: i.name, size: i.size, isImage: i.isImage })))),
  };
}
