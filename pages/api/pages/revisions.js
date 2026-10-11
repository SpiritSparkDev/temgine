import { prisma } from '../../../lib/prisma'
import { logAudit } from '../../../lib/audit'
import { stripPageAccessPasswords } from '../../../lib/pageAccessPassword'
import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { acquirePagesLock, stampNode, indexNodesById, replaceNestedNode } from '../../../lib/pageConcurrency'

const userLabel = (user) => (user && (user.name || user.email)) || null

// Verschachtelte Seiten haben keine eigene DB-Zeile und damit keine eigenen
// Revisionen — ihre Stände stecken im `children`-JSON der Revisionen ihrer
// obersten Elternseite. Liefert die id dieser Elternseite (oder null).
async function findTopLevelIdForNested(nodeId) {
  const rows = await prisma.page.findMany({ select: { id: true, children: true } })
  const hit = indexNodesById(rows).get(String(nodeId))
  return hit && hit.topLevelId !== String(nodeId) ? hit.topLevelId : null
}

function nestedNodeInRevision(rev, nodeId) {
  const children = rev && rev.data && Array.isArray(rev.data.children) ? rev.data.children : []
  const hit = indexNodesById([{ id: '__rev__', children }]).get(String(nodeId))
  return hit ? hit.node : null
}

export default async function handler(req, res) {
  try {
    // GET: ?pageId=... oder ?slug=...
    if (req.method === 'GET') {
      const auth = await requireAuth(req, res, PERMISSIONS.PAGES_VIEW)
      if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
      const { pageId, slug } = req.query || {}

      let pageIdToUse = pageId
      if (!pageIdToUse && slug) {
        const p = await prisma.page.findUnique({ where: { slug: String(slug) } })
        if (!p) return res.status(404).json({ error: 'Seite nicht gefunden' })
        pageIdToUse = p.id
      }

      if (!pageIdToUse) return res.status(400).json({ error: 'pageId oder slug erforderlich' })

      const isRow = await prisma.page.findUnique({ where: { id: String(pageIdToUse) }, select: { id: true } })
      if (!isRow) {
        const topLevelId = await findTopLevelIdForNested(pageIdToUse)
        if (!topLevelId) return res.status(200).json([])
        const parentRevs = await prisma.pageRevision.findMany({
          where: { pageId: topLevelId },
          orderBy: { createdAt: 'desc' }
        })
        // Nur Stände zeigen, in denen sich diese Unterseite selbst unterscheidet.
        const out = []
        let lastKey = null
        for (const rev of parentRevs.slice().reverse()) {
          const node = nestedNodeInRevision(rev, pageIdToUse)
          if (!node) continue
          const { children, accessPasswordHash, ...own } = node
          const key = JSON.stringify(own)
          if (key === lastKey) continue
          lastKey = key
          out.push({ ...rev, data: { ...own, children: [] }, nested: true })
        }
        return res.status(200).json(out.reverse())
      }

      const revs = await prisma.pageRevision.findMany({
        where: { pageId: String(pageIdToUse) },
        orderBy: { createdAt: 'desc' }
      })
      return res.status(200).json(revs)
    }

    // POST: create revision { pageId || slug, data, note, createdBy }
    if (req.method === 'POST') {
      const auth = await requireAuth(req, res, PERMISSIONS.PAGES_EDIT)
      if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
      const body = req.body || {}
      let { pageId, slug, data, note } = body
      const createdBy = userLabel(auth.user)

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
        await logAudit({ action: 'create_revision', resource: 'page', resourceId: String(pageId), userId: auth.user.id, details: { note } })
      } catch (e) {}

      return res.status(200).json(rev)
    }

    // PUT: restore revision { revisionId, pageId? } — mit pageId einer
    // Unterseite wird nur diese aus der Revision ihrer Elternseite zurückgeholt.
    if (req.method === 'PUT') {
      const auth = await requireAuth(req, res, PERMISSIONS.PAGES_EDIT)
      if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
      const release = await acquirePagesLock()
      try {
      const { revisionId } = req.body || {}
      if (!revisionId) return res.status(400).json({ error: 'revisionId erforderlich' })

      const rev = await prisma.pageRevision.findUnique({ where: { id: String(revisionId) } })
      if (!rev) return res.status(404).json({ error: 'Revision nicht gefunden' })

      const nestedId = req.body && req.body.pageId && String(req.body.pageId) !== rev.pageId ? String(req.body.pageId) : null
      if (nestedId) {
        const node = nestedNodeInRevision(rev, nestedId)
        if (!node) return res.status(404).json({ error: 'Diese Unterseite ist in der Version nicht enthalten' })
        const row = await prisma.page.findUnique({ where: { id: rev.pageId } })
        if (!row) return res.status(404).json({ error: 'Elternseite nicht gefunden' })
        await prisma.pageRevision.create({ data: {
          pageId: row.id,
          data: { title: row.title, slug: row.slug, blocks: row.blocks, children: row.children, template: row.template, status: row.status, publishAt: row.publishAt, data: row.data },
          note: 'Automatisches Backup vor Wiederherstellung',
          createdBy: userLabel(auth.user),
        } })
        const { children: _ignored, accessPasswordHash: _hash, ...own } = node
        const children = replaceNestedNode(row.children, nestedId, (n) => stampNode({ ...n, ...own, children: n.children }, auth.user))
        if (!children) return res.status(404).json({ error: 'Diese Unterseite existiert nicht mehr' })
        const updated = await prisma.page.update({ where: { id: row.id }, data: { children } })
        try {
          await logAudit({ action: 'restore_revision', resource: 'page', resourceId: nestedId, userId: auth.user.id, details: { revisionId, topLevelId: row.id } })
        } catch (e) {}
        return res.status(200).json({ ok: true, page: stripPageAccessPasswords(updated) })
      }

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
            createdBy: userLabel(auth.user),
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
          // Neuer Stempel: Wer die Seite noch mit dem alten Stand im Editor
          // offen hat, überschreibt die Wiederherstellung nicht unbemerkt.
          data: stampNode({ data: { ...((data.data !== undefined ? data.data : currentPage && currentPage.data) || {}) } }, auth.user).data,
        },
      })

      try {
        await logAudit({ action: 'restore_revision', resource: 'page', resourceId: updated.id, userId: auth.user.id, details: { revisionId: revisionId } })
      } catch (e) {}

      return res.status(200).json({ ok: true, page: stripPageAccessPasswords(updated) })
      } finally {
        release()
      }
    }

    // DELETE: einzelne Revision löschen { revisionId }
    if (req.method === 'DELETE') {
      const auth = await requireAuth(req, res, PERMISSIONS.PAGES_DELETE)
      if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
      const { revisionId } = req.body || {}
      if (!revisionId) return res.status(400).json({ error: 'revisionId erforderlich' })

      const rev = await prisma.pageRevision.findUnique({ where: { id: String(revisionId) } })
      if (!rev) return res.status(404).json({ error: 'Revision nicht gefunden' })

      await prisma.pageRevision.delete({ where: { id: String(revisionId) } })

      try {
        await logAudit({ action: 'delete_revision', resource: 'page', resourceId: rev.pageId, userId: auth.user.id, details: { revisionId } })
      } catch (e) {}

      return res.status(200).json({ ok: true })
    }

    res.status(405).json({ error: 'Methode nicht erlaubt' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Fehler' })
  }
}
