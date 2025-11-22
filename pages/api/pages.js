import { prisma } from '../../lib/prisma'
import { logAudit } from '../../lib/audit'

// API-Route für Seiten: Daten kommen jetzt ausschließlich aus der Datenbank
export default async function handler(req, res) {
  try {
    // GET: alle Seiten oder eine Seite per ?slug=...
    if (req.method === 'GET') {
      const slug = req.query && req.query.slug
      const includeDrafts = req.query && (req.query.includeDrafts === 'true' || req.query.includeDrafts === true)
      if (slug) {
        const page = await prisma.page.findUnique({ where: { slug: String(slug) } })
        if (!page) return res.status(404).json({ error: 'Seite nicht gefunden' })
        if (!includeDrafts && page.status !== 'PUBLISHED') return res.status(404).json({ error: 'Seite nicht gefunden' })
        return res.status(200).json(page)
      }

      const where = {}
      if (!includeDrafts) {
        where.status = 'PUBLISHED'
      }

      const pages = await prisma.page.findMany({ where, orderBy: { createdAt: 'desc' } })
      return res.status(200).json(pages)
    }

    // POST: Seite anlegen oder aktualisieren (erwartet ein Page-Objekt)
    if (req.method === 'POST') {
      const body = req.body
      // Wenn ein Array gesendet wird, upserten wir alle Einträge
      if (Array.isArray(body)) {
        const results = []
        for (const p of body) {
          if (!p.slug) continue
          const up = await prisma.page.upsert({
            where: { slug: String(p.slug) },
            create: {
              slug: String(p.slug),
              title: p.title || '',
              blocks: p.blocks || [],
              children: p.children || [],
              status: p.status || 'DRAFT',
              publishAt: p.publishAt || null
            },
            update: {
              title: p.title || undefined,
              blocks: p.blocks || undefined,
              children: p.children || undefined,
              status: p.status || undefined,
              publishAt: p.publishAt || undefined
            }
          })
          results.push(up)
        }
        // create revisions for each upserted page
        for (const up of results) {
          try {
            await prisma.pageRevision.create({ data: {
              pageId: up.id,
              data: {
                title: up.title,
                slug: up.slug,
                blocks: up.blocks,
                children: up.children,
                status: up.status,
                publishAt: up.publishAt
              }
            } })
          } catch (e) {
            // non-fatal
            console.error('Revision create failed', e)
          }
        }
        // audit logs
        for (const up of results) {
          try { await logAudit({ action: 'upsert', resource: 'page', resourceId: up.id, userId: null, details: { slug: up.slug } }) } catch (e) {}
        }
        return res.status(200).json(results)
      }

      // Single page upsert
      const p = body || {}
      if (!p.slug) return res.status(400).json({ error: 'Slug erforderlich' })
      const up = await prisma.page.upsert({
        where: { slug: String(p.slug) },
        create: {
          slug: String(p.slug),
          title: p.title || '',
          blocks: p.blocks || [],
          children: p.children || []
        },
        update: {
          title: p.title || undefined,
          blocks: p.blocks || undefined,
          children: p.children || undefined
        }
      })
      // create a revision for this upsert
      try {
        await prisma.pageRevision.create({ data: {
          pageId: up.id,
          data: {
            title: up.title,
            slug: up.slug,
            blocks: up.blocks,
            children: up.children,
            status: up.status,
            publishAt: up.publishAt
          }
        } })
      } catch (e) {
        console.error('Revision create failed', e)
      }
      try { await logAudit({ action: 'upsert', resource: 'page', resourceId: up.id, userId: null, details: { slug: up.slug } }) } catch (e) {}
      return res.status(200).json(up)
    }

    // DELETE: Seite per slug löschen
    if (req.method === 'DELETE') {
      const { slug } = req.body || {}
      if (!slug) return res.status(400).json({ error: 'Slug erforderlich' })
      const deleted = await prisma.page.delete({ where: { slug: String(slug) } })
      try { await logAudit({ action: 'delete', resource: 'page', resourceId: deleted.id, userId: null, details: { slug } }) } catch (e) {}
      return res.status(200).json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Fehler' })
  }
}
