import { prisma } from './prisma'
import { stampNode } from './pageConcurrency'
import { applyShared } from './sharedBlocks'

// Der Aufrufer hält bereits die Seiten-Sperre (acquirePagesLock in pages/api/pages.js) – hier nicht erneut holen (Deadlock).
// Schreibt geänderte geteilte Blöcke (`changes`: Map id -> Block, siehe lib/sharedBlocks.js) in alle
// anderen Seiten, die einen Block mit derselben ID tragen. Jede geänderte Seite bekommt einen frischen
// Stempel (ein dort offener Editor bekommt beim Speichern die normale 409-Meldung) und eine Revision.
export async function propagateSharedBlocks(sourcePageId, changes, user) {
  if (!changes || !changes.size) return []
  const touchedPages = []
  {
    const rows = await prisma.page.findMany()
    for (const row of rows) {
      const update = {}
      const touch = (node) => {
        if (String(node.id) === String(sourcePageId)) return node
        const r = applyShared(node.blocks, changes)
        if (!r.changed) return node
        touchedPages.push(node.title || node.slug || node.id)
        return stampNode({ ...node, blocks: r.blocks }, user)
      }
      const top = touch(row)
      if (top !== row) { update.blocks = top.blocks; update.data = top.data }
      const walk = (list) => (Array.isArray(list) ? list : []).map((n) => {
        if (!n) return n
        const next = touch(n)
        return Array.isArray(next.children) && next.children.length ? { ...next, children: walk(next.children) } : next
      })
      const children = walk(row.children)
      if (JSON.stringify(children) !== JSON.stringify(row.children || [])) update.children = children
      if (!Object.keys(update).length) continue
      const saved = await prisma.page.update({ where: { id: row.id }, data: update })
      try {
        await prisma.pageRevision.create({ data: {
          pageId: saved.id,
          data: { title: saved.title, slug: saved.slug, blocks: saved.blocks, children: saved.children, status: saved.status, publishAt: saved.publishAt, template: saved.template, data: saved.data },
          createdBy: (user && (user.name || user.email)) || null,
          note: 'Geteilter Block abgeglichen',
        } })
      } catch (e) { console.error('Revision create failed', e) }
    }
  }
  return touchedPages
}
