export const features = ['usage'];

// Verwendung eines Templates (Seiten und Blog-Kanäle), Grundlage der Warnung „Änderung betrifft N Seiten“ im Designer.
export const routes = ({ core, authed }) => ({
  'GET v1/templates/:name/usage': authed('view', async (req, res, ctx) => {
    const t = core.store.getTemplateByName(ctx.params.name);
    if (!t) return ctx.fail(404, 'Template nicht gefunden', 'TEMPLATE_NOT_FOUND');
    return res.status(200).json(await core.getTemplateUsage(t.name));
  }),
});
