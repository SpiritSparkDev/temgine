import { NAME_RE, sha256, shape, fromKind, ifMatchHash, isDryRun, paginate, setEtag } from '../common';

export const features = ['dry-run', 'etag', 'pagination'];

export const routes = ({ core, authed, audit, validateTemplate }) => ({
  'GET v1/templates': authed('view', async (req, res, ctx) => {
    const used = await core.getUsedTemplateNames();
    let list = core.store.listTemplates().map((t) => shape(t, { isUsed: used.has(t.name) }));
    if (ctx.query?.kind) list = list.filter((t) => t.kind === ctx.query.kind);
    const p = paginate(ctx, list, (t) => t.name);
    return p.bad ? ctx.fail(400, p.bad, 'VALIDATION_ERROR', { path: p.path }) : res.status(200).json(p.body);
  }),

  'GET v1/templates/:name': authed('view', async (req, res, ctx) => {
    const t = core.store.getTemplateByName(ctx.params.name);
    if (!t) return ctx.fail(404, 'Template nicht gefunden', 'TEMPLATE_NOT_FOUND');
    const used = await core.getUsedTemplateNames();
    setEtag(res, ctx, sha256(t.code));
    return res.status(200).json(shape(t, { isUsed: used.has(t.name) }));
  }),

  'PUT v1/templates/:name': authed('edit', async (req, res, ctx, user) => {
    const { name } = ctx.params;
    const { code, kind = 'block', master = null, newName, expectedHash } = req.body || {};
    const target = String(newName || name).trim();
    if (!NAME_RE.test(name) || !NAME_RE.test(target) || target.startsWith('.')) return ctx.fail(400, 'Ungültiger Template-Name', 'VALIDATION_ERROR', { path: 'name' });
    const errors = await validateTemplate({ code, kind, master });
    if (errors.length) return ctx.fail(400, errors[0].message, errors[0].code, { details: errors });

    const existing = core.store.getTemplateByName(name);
    const expected = expectedHash || (ctx.v >= 2 ? ifMatchHash(req) : null);
    if (existing && expected && sha256(existing.code) !== expected) {
      return ctx.fail(409, 'Template wurde in Temgine geändert', 'TEMPLATE_CHANGED', { current: shape(existing) });
    }
    const clash = target.toLowerCase() !== name.toLowerCase() && core.store.getTemplateByName(target);
    if (clash) return ctx.fail(409, 'Name bereits vergeben', 'NAME_TAKEN', { path: 'newName' });

    const hash = sha256(code);
    setEtag(res, ctx, hash);
    if (isDryRun(req, ctx)) return res.status(200).json({ dryRun: true, action: existing ? 'update' : 'create', name: target, kind, hash });
    const saved = core.store.saveTemplate({ name: target, code, ...fromKind(kind, master) }, existing ? existing.name : null);
    await audit(user, existing ? 'template.update' : 'template.create', target, { kind });
    return res.status(200).json({ name: saved.name, kind, hash });
  }, { rateLimit: { windowMs: 60000, max: 120 } }),

  'DELETE v1/templates/:name': authed('delete', async (req, res, ctx, user) => {
    const t = core.store.getTemplateByName(ctx.params.name);
    if (!t) return ctx.fail(404, 'Template nicht gefunden', 'TEMPLATE_NOT_FOUND');
    const expected = ctx.v >= 2 ? ifMatchHash(req) : null;
    if (expected && sha256(t.code) !== expected) return ctx.fail(409, 'Template wurde in Temgine geändert', 'TEMPLATE_CHANGED', { current: shape(t) });
    if ((await core.getUsedTemplateNames()).has(t.name) && ctx.query?.force !== '1') return ctx.fail(409, 'Template wird verwendet', 'TEMPLATE_IN_USE');
    if (isDryRun(req, ctx)) return res.status(200).json({ dryRun: true, action: 'delete', name: t.name });
    core.store.deleteTemplateByName(t.name);
    await audit(user, 'template.delete', t.name, null);
    return res.status(200).json({ ok: true });
  }),
});
