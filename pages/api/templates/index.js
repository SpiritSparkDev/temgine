import { listTemplates, getTemplateByName, saveTemplate, deleteTemplateByName } from '../../../lib/templateStore'
import { validatePreviewSubset } from '../../../lib/blogTemplateWorkflow'

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

const toResponseShape = (t) => ({
  id: t.name, // file-based: name IS the identity, no separate DB id anymore
  name: t.name,
  code: t.code,
  type: t.type,
  blogRole: t.blogRole,
  masterTemplateName: t.masterTemplateName,
});

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const typeFilter = req.query && req.query.type ? String(req.query.type).toUpperCase() : null
      const scopeFilter = req.query && req.query.scope ? String(req.query.scope).toLowerCase() : null
      const name = req.query && req.query.name

      if (name) {
        const t = getTemplateByName(String(name))
        if (!t) {
          const [status, resp] = errorResponse(404, 'Template nicht gefunden', 'TEMPLATE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        return res.status(200).json(toResponseShape(t))
      }

      let list = listTemplates()
      if (typeFilter) list = list.filter((t) => t.type === typeFilter)
      if (scopeFilter === 'normal') list = list.filter((t) => !t.blogRole)
      if (scopeFilter === 'blog') list = list.filter((t) => !!t.blogRole)

      return res.status(200).json(list.map(toResponseShape))
    }

    if (req.method === 'POST') {
      const { name, code, type, blogRole, masterTemplateName } = req.body || {}
      if (!name || !code) {
        const missing = [];
        if (!name) missing.push('name');
        if (!code) missing.push('code');
        const [status, resp] = errorResponse(400, 'Name und Code erforderlich', 'VALIDATION_ERROR', { missing });
        return res.status(status).json(resp);
      }

      const role = String(blogRole || '').trim().toLowerCase() || null

      if (role === 'preview') {
        const master = String(masterTemplateName || '').trim()
        if (!master) {
          const [status, resp] = errorResponse(400, 'Vorschau-Template benötigt ein Master-Template', 'VALIDATION_ERROR', { masterTemplateName: 'Pflichtfeld für Vorschau-Templates' });
          return res.status(status).json(resp);
        }

        const masterTemplate = getTemplateByName(master)
        if (!masterTemplate) {
          const [status, resp] = errorResponse(400, 'Master-Template nicht gefunden', 'MASTER_TEMPLATE_NOT_FOUND', { masterTemplateName: master });
          return res.status(status).json(resp);
        }

        const subset = validatePreviewSubset(String(code), String(masterTemplate.code || ''))
        if (!subset.ok) {
          const [status, resp] = errorResponse(400, 'Vorschau enthält Platzhalter, die nicht im Master vorkommen', 'PREVIEW_PLACEHOLDER_MISMATCH', {
            masterTemplateName: masterTemplate.name,
            invalidPlaceholders: subset.invalid,
          });
          return res.status(status).json(resp);
        }
      }

      const ttype = String(type || 'BLOCK').toUpperCase() === 'SITE' ? 'SITE' : 'BLOCK'
      const saved = saveTemplate({
        name: String(name),
        code: String(code),
        type: ttype,
        blogRole: role,
        masterTemplateName: role === 'preview' ? String(masterTemplateName).trim() : null,
      })
      const full = getTemplateByName(saved.name)
      return res.status(200).json({ ok: true, ...toResponseShape(full) })
    }

    if (req.method === 'DELETE') {
      const { name } = req.body || {}
      if (!name) {
        const [status, resp] = errorResponse(400, 'Name erforderlich', 'VALIDATION_ERROR', { missing: ['name'] });
        return res.status(status).json(resp);
      }
      const deleted = deleteTemplateByName(String(name))
      if (!deleted) {
        const [status, resp] = errorResponse(404, 'Template nicht gefunden', 'TEMPLATE_NOT_FOUND');
        return res.status(status).json(resp);
      }
      return res.status(200).json({ ok: true })
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/templates Error]', e.message, e.stack)
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
