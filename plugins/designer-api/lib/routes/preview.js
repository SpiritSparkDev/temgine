import { MAX_CODE } from '../common';

export const features = [];

export const routes = ({ core, authed, validateTemplate, varNames }) => ({
  'POST v1/validate': authed('view', async (req, res) => {
    const { code, kind = 'block', master = null } = req.body || {};
    const errors = await validateTemplate({ code, kind, master });
    return res.status(200).json({ ok: !errors.length, variables: errors.length ? [] : varNames(code), errors });
  }, { readOnlyOk: true }),

  'POST v1/preview': authed('view', (req, res, ctx) => {
    const { code, props = {}, page = {}, children = [] } = req.body || {};
    if (typeof code !== 'string' || code.length > MAX_CODE) return ctx.fail(400, 'Code fehlt oder zu groß', 'VALIDATION_ERROR', { path: 'code' });
    const data = { ...props, page: { title: 'Beispiel', slug: 'beispiel', isChild: false, ...page }, inner: (Array.isArray(children) ? children : []).map(String).join('') };
    const warnings = varNames(code).filter((n) => !n.includes('.') && !n.includes(':') && props[n] === undefined).map((n) => `Variable '${n}' hat keinen Wert`);
    return res.status(200).json({ html: core.renderTemplate(code, data), warnings });
  }, { readOnlyOk: true }),
});
