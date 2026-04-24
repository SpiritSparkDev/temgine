import { prisma } from '../../../lib/prisma'
import { logAudit } from '../../../lib/audit'

export default async function handler(req, res) {
  try {
    // GET: ?pageId=... oder ?slug=...
    if (req.method === 'GET') {
      const { pageId, slug } = req.query || {}

      let pageIdToUse = pageId
      if (!pageIdToUse && slug) {
        const p = await prisma.page.findUnique({ where: { slug: String(slug) } })
        if (!p) return res.status(404).json({ error: 'Seite nicht gefunden' })
        pageIdToUse = p.id
      }

      if (!pageIdToUse) return res.status(400).json({ error: 'pageId oder slug erforderlich' })

      const revs = await prisma.pageRevision.findMany({
        where: { pageId: String(pageIdToUse) },
        orderBy: { createdAt: 'desc' }
      })
      return res.status(200).json(revs)
    }

    // POST: create revision { pageId || slug, data, note, createdBy }
    if (req.method === 'POST') {
      const body = req.body || {}
      let { pageId, slug, data, note, createdBy } = body

      if (!pageId && slug) {
        const p = await prisma.page.findUnique({ where: { slug: String(slug) } })
        if (!p) return res.status(404).json({ error: 'Seite nicht gefunden' })
        pageId = p.id
      }

      if (!pageId) return res.status(400).json({ error: 'pageId oder slug erforderlich' })

      const rev = await prisma.pageRevision.create({ data: {
        pageId: String(pageId),
        data: data || {},
        note: note || null,
        createdBy: createdBy || null
      } })

      try {
        await logAudit({ action: 'create_revision', resource: 'page', resourceId: String(pageId), userId: createdBy || null, details: { note } })
      } catch (e) {}

      return res.status(200).json(rev)
    }

    // PUT: restore revision { revisionId }
    if (req.method === 'PUT') {
      const { revisionId } = req.body || {}
      if (!revisionId) return res.status(400).json({ error: 'revisionId erforderlich' })

      const rev = await prisma.pageRevision.findUnique({ where: { id: String(revisionId) } })
      if (!rev) return res.status(404).json({ error: 'Revision nicht gefunden' })

      const data = rev.data || {}
      const pageId = rev.pageId

      // Aktuellen Seitenzustand als Backup-Revision sichern, bevor wir wiederherstellen
      const currentPage = await prisma.page.findUnique({ where: { id: pageId } })
      if (currentPage) {
        await prisma.pageRevision.create({
          data: {
            pageId,
            data: {
              title: currentPage.title,
              slug: currentPage.slug,
              blocks: currentPage.blocks,
              children: currentPage.children,
              template: currentPage.template,
              status: currentPage.status,
              publishAt: currentPage.publishAt,
              data: currentPage.data,
            },
            note: 'Automatisches Backup vor Wiederherstellung',
            createdBy: null,
          },
        })
      }

      const updated = await prisma.page.update({
        where: { id: pageId },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.blocks !== undefined && { blocks: data.blocks }),
          ...(data.children !== undefined && { children: data.children }),
          ...(data.template !== undefined && { template: data.template }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.publishAt !== undefined && { publishAt: data.publishAt ? new Date(data.publishAt) : null }),
          ...(data.data !== undefined && { data: data.data }),
        },
      })

      try {
        await logAudit({ action: 'restore_revision', resource: 'page', resourceId: updated.id, userId: null, details: { revisionId: revisionId } })
      } catch (e) {}

      return res.status(200).json({ ok: true, page: updated })
    }

    // DELETE: einzelne Revision löschen { revisionId }
    if (req.method === 'DELETE') {
      const { revisionId } = req.body || {}
      if (!revisionId) return res.status(400).json({ error: 'revisionId erforderlich' })

      const rev = await prisma.pageRevision.findUnique({ where: { id: String(revisionId) } })
      if (!rev) return res.status(404).json({ error: 'Revision nicht gefunden' })

      await prisma.pageRevision.delete({ where: { id: String(revisionId) } })

      try {
        await logAudit({ action: 'delete_revision', resource: 'page', resourceId: rev.pageId, userId: null, details: { revisionId } })
      } catch (e) {}

      return res.status(200).json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Fehler' })
  }
}
