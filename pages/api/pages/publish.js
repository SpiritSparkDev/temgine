import { prisma } from '../../../lib/prisma'
import { logAudit } from '../../../lib/audit'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { id, slug, action, publishAt } = req.body || {}

    if (!id && !slug) return res.status(400).json({ error: 'id oder slug erforderlich' })

    let page
    if (id) page = await prisma.page.findUnique({ where: { id: String(id) } })
    else page = await prisma.page.findUnique({ where: { slug: String(slug) } })

    if (!page) return res.status(404).json({ error: 'Seite nicht gefunden' })

    if (action === 'publish') {
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
      if (!publishAt) return res.status(400).json({ error: 'publishAt erforderlich für schedule' })
      const dt = new Date(publishAt)
      if (isNaN(dt.getTime())) return res.status(400).json({ error: 'Ungültiges publishAt Datum' })
      const updated = await prisma.page.update({ where: { id: page.id }, data: { status: 'SCHEDULED', publishAt: dt } })
      try { await logAudit({ action: 'schedule', resource: 'page', resourceId: updated.id, details: { slug: updated.slug, publishAt: dt } }) } catch (e) {}
      return res.status(200).json({ ok: true, page: updated })
    }

    res.status(400).json({ error: 'Unbekannte Aktion' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Fehler' })
  }
}
