import { prisma } from '../../../lib/prisma'
import { encodeBlogTemplateMeta, parseBlogTemplateMeta, validatePreviewSubset } from '../../../lib/blogTemplateWorkflow'

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const typeFilter = req.query && req.query.type ? String(req.query.type).toUpperCase() : null
      const scopeFilter = req.query && req.query.scope ? String(req.query.scope).toLowerCase() : null
      const name = req.query && req.query.name
      if (name) {
        // Case-insensitive lookup so client casing differences don't break rendering
        const t = await prisma.template.findFirst({ where: { name: { equals: String(name), mode: 'insensitive' } } })
        if (!t) {
          const [status, resp] = errorResponse(404, 'Template nicht gefunden', 'TEMPLATE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        const meta = parseBlogTemplateMeta(t.blogType)
        return res.status(200).json({
          id: t.id,
          name: t.name,
          code: t.code,
          type: t.type,
          blogType: t.blogType || null,
          blogRole: meta.blogRole,
          masterTemplateName: meta.masterTemplateName,
        })
      }

      // List templates with explicit field selection.
      // This avoids runtime 500 when local DB schema lags behind optional columns.
      const where = {}
      if (typeFilter) where.type = typeFilter
      if (scopeFilter === 'normal') where.blogType = null
      if (scopeFilter === 'blog') where.blogType = { not: null }

      const templates = await prisma.template.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, code: true, type: true, blogType: true },
      })
      const list = templates.map(t => {
        const meta = parseBlogTemplateMeta(t.blogType)
        return {
          id: t.id,
          name: t.name,
          code: t.code,
          type: t.type,
          blogType: t.blogType || null,
          blogRole: meta.blogRole,
          masterTemplateName: meta.masterTemplateName,
        }
      })
      return res.status(200).json(list)
    }

    if (req.method === 'POST') {
      const { name, code, type, blogType, blogRole, masterTemplateName } = req.body || {}
      if (!name || !code) {
        const missing = [];
        if (!name) missing.push('name');
        if (!code) missing.push('code');
        const [status, resp] = errorResponse(400, 'Name und Code erforderlich', 'VALIDATION_ERROR', { missing });
        return res.status(status).json(resp);
      }

      const normalizedBlogType = encodeBlogTemplateMeta(blogRole, masterTemplateName, blogType)
      const parsedMeta = parseBlogTemplateMeta(normalizedBlogType)

      if (parsedMeta.blogRole === 'preview') {
        if (!parsedMeta.masterTemplateName) {
          const [status, resp] = errorResponse(400, 'Vorschau-Template benötigt ein Master-Template', 'VALIDATION_ERROR', { masterTemplateName: 'Pflichtfeld für Vorschau-Templates' });
          return res.status(status).json(resp);
        }

        const masterTemplate = await prisma.template.findFirst({
          where: { name: { equals: String(parsedMeta.masterTemplateName), mode: 'insensitive' } },
          select: { id: true, name: true, code: true },
        })
        if (!masterTemplate) {
          const [status, resp] = errorResponse(400, 'Master-Template nicht gefunden', 'MASTER_TEMPLATE_NOT_FOUND', { masterTemplateName: parsedMeta.masterTemplateName });
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

      // normalize type — always BLOCK
      const ttype = String(type || 'BLOCK').toUpperCase() === 'SITE' ? 'SITE' : 'BLOCK'
      const up = await prisma.template.upsert({
        where: { name: String(name) },
        create: { name: String(name), code: String(code), type: ttype, blogType: normalizedBlogType || null },
        update: { code: String(code), type: ttype, blogType: normalizedBlogType || null },
        select: { id: true, name: true, code: true, type: true, blogType: true },
      })
      const upMeta = parseBlogTemplateMeta(up.blogType)
      return res.status(200).json({
        ok: true,
        id: up.id,
        name: up.name,
        code: up.code,
        type: up.type,
        blogType: up.blogType || null,
        blogRole: upMeta.blogRole,
        masterTemplateName: upMeta.masterTemplateName,
      })
    }

    if (req.method === 'DELETE') {
      const { name } = req.body || {}
      if (!name) {
        const [status, resp] = errorResponse(400, 'Name erforderlich', 'VALIDATION_ERROR', { missing: ['name'] });
        return res.status(status).json(resp);
      }
      try {
        await prisma.template.delete({ where: { name: String(name) } })
        return res.status(200).json({ ok: true })
      } catch (e) {
        if (e.code === 'P2025') {
          const [status, resp] = errorResponse(404, 'Template nicht gefunden', 'TEMPLATE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        throw e;
      }
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/templates Error]', e.message, e.stack)
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
