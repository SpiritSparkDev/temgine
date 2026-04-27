import { prisma } from '../../../lib/prisma'
import { logAudit } from '../../../lib/audit'

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
      return res.status(status).json(resp);
    }

    const { id, slug, action, publishAt } = req.body || {}

    if (!id && !slug) {
      const [status, resp] = errorResponse(400, 'id oder slug erforderlich', 'VALIDATION_ERROR', { missing: ['id', 'slug'] });
      return res.status(status).json(resp);
    }

    let page
    if (id) page = await prisma.page.findUnique({ where: { id: String(id) } })
    else page = await prisma.page.findUnique({ where: { slug: String(slug) } })

    if (!page) {
      const [status, resp] = errorResponse(404, 'Seite nicht gefunden', 'PAGE_NOT_FOUND');
      return res.status(status).json(resp);
    }

    const pageData = page && typeof page.data === 'object' && page.data !== null ? page.data : {};
    const seo = pageData && typeof pageData.seo === 'object' && pageData.seo !== null ? pageData.seo : {};
    const seoMissing = [];
    if (!String(seo.metaTitle || '').trim()) seoMissing.push('metaTitle');
    if (!String(seo.metaDescription || '').trim()) seoMissing.push('metaDescription');

    if (action === 'publish') {
      if (seoMissing.length > 0) {
        const [status, resp] = errorResponse(
          400,
          'Seite kann nicht publiziert werden: SEO-Pflichtfelder fehlen',
          'VALIDATION_ERROR',
          {
            missing: seoMissing,
            hint: 'Bitte im Seiteneditor unter SEO mindestens Meta Title und Meta Description setzen.'
          }
        );
        return res.status(status).json(resp);
      }

      const updated = await prisma.page.update({ where: { id: page.id }, data: { status: 'PUBLISHED', publishAt: publishAt || null } })
      try { await prisma.pageRevision.create({ data: { pageId: updated.id, data: { title: updated.title, slug: updated.slug, blocks: updated.blocks, children: updated.children, status: updated.status, publishAt: updated.publishAt } } }) } catch (e) {}
      try { await logAudit({ action: 'publish', resource: 'page', resourceId: updated.id, details: { slug: updated.slug } }) } catch (e) {}
      return res.status(200).json({ ok: true, page: updated })
    }

    if (action === 'unpublish') {
      const updated = await prisma.page.update({ where: { id: page.id }, data: { status: 'DRAFT', publishAt: null } })
      try { await logAudit({ action: 'unpublish', resource: 'page', resourceId: updated.id, details: { slug: updated.slug } }) } catch (e) {}
      return res.status(200).json({ ok: true, page: updated })
    }

    if (action === 'schedule') {
      if (seoMissing.length > 0) {
        const [status, resp] = errorResponse(
          400,
          'Seite kann nicht geplant werden: SEO-Pflichtfelder fehlen',
          'VALIDATION_ERROR',
          {
            missing: seoMissing,
            hint: 'Bitte im Seiteneditor unter SEO mindestens Meta Title und Meta Description setzen.'
          }
        );
        return res.status(status).json(resp);
      }

      if (!publishAt) {
        const [status, resp] = errorResponse(400, 'publishAt erforderlich für schedule', 'VALIDATION_ERROR', { missing: ['publishAt'] });
        return res.status(status).json(resp);
      }
      const dt = new Date(publishAt)
      if (isNaN(dt.getTime())) {
        const [status, resp] = errorResponse(400, 'Ungültiges publishAt Datum', 'VALIDATION_ERROR', { invalid: ['publishAt'] });
        return res.status(status).json(resp);
      }
      const updated = await prisma.page.update({ where: { id: page.id }, data: { status: 'SCHEDULED', publishAt: dt } })
      try { await logAudit({ action: 'schedule', resource: 'page', resourceId: updated.id, details: { slug: updated.slug, publishAt: dt } }) } catch (e) {}
      return res.status(200).json({ ok: true, page: updated })
    }

    const [status, resp] = errorResponse(400, 'Ungültige oder fehlende Action', 'VALIDATION_ERROR', { invalid: ['action'], value: action });
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/pages/publish Error]', e.message, e.stack)
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
