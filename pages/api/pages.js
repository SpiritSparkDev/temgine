import { prisma } from '../../lib/prisma'
import { logAudit } from '../../lib/audit'
import { sanitizeRecursive } from '../../lib/htmlSanitize'

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

      // Get all root-level pages (those without a parent). To preserve editing order,
      // we don't strictly orderBy createdAt. Instead, let the client manage order via children array.
      // Return pages with minimal ordering (updatedAt desc) so recently modified appear first,
      // but rely on the client to send the full tree structure in the desired order on save.
      const pages = await prisma.page.findMany({ where })
      return res.status(200).json(pages)
    }

    // POST: Seite anlegen oder aktualisieren (erwartet ein Page-Objekt)
    if (req.method === 'POST') {
      const body = req.body
      console.log('DEBUG /api/pages POST body:', JSON.stringify(body, null, 2));
      // Wenn ein Array gesendet wird, upserten wir alle Einträge
      if (Array.isArray(body)) {
        const results = []

        // helper: collect all slugs present in the provided tree (including children)
        const collectSlugs = (nodes) => {
          const s = new Set()
          const walk = (arr) => {
            for (const n of arr || []) {
              if (n && n.slug) s.add(String(n.slug))
              if (n && n.children && Array.isArray(n.children)) walk(n.children)
            }
          }
          walk(nodes)
          return s
        }

        const providedSlugs = collectSlugs(body)

        // Only upsert top-level nodes; children are stored in the parent's `children` JSON
        for (const p of body) {
          // sanitize incoming page content (blocks.props, data)
          try {
            if (p && p.data) p.data = sanitizeRecursive(p.data)
            if (p && p.blocks && Array.isArray(p.blocks)) {
              p.blocks = p.blocks.map(b => {
                if (!b || !b.props) return b
                return { ...b, props: sanitizeRecursive(b.props) }
              })
            }
          } catch (e) {
            console.warn('Failed to sanitize incoming page payload', e)
          }
          if (!p || !p.slug) continue

          try {
            // Wenn diese Seite als Homepage gesetzt wird, deaktiviere alle anderen Homepages
            if (p.isHomepage === true) {
              console.log(`Setting ${p.slug} as homepage, disabling others...`);
              await prisma.page.updateMany({
                where: { isHomepage: true, slug: { not: String(p.slug) } },
                data: { isHomepage: false }
              })
              console.log('Homepage update successful');
            }
          } catch (e) {
            console.error('Error updating homepages:', e);
          }

          const up = await prisma.page.upsert({
            where: { slug: String(p.slug) },
            create: {
              slug: String(p.slug),
              title: p.title || '',
              blocks: p.blocks || [],
              children: p.children || [],
              status: p.status || 'DRAFT',
              publishAt: p.publishAt || null,
              template: p.template || null,
              data: p.data || {},
              isHomepage: p.isHomepage || false
            },
            update: {
              title: p.title || undefined,
              blocks: p.blocks || undefined,
              children: p.children || undefined,
              status: p.status || undefined,
              publishAt: p.publishAt || undefined,
              template: p.template || undefined,
              data: p.data || undefined,
              isHomepage: p.isHomepage !== undefined ? p.isHomepage : undefined
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
            console.error('Revision create failed', e)
          }
        }

        // Remove pages that are no longer present in the provided tree
        try {
          const allPages = await prisma.page.findMany()
          const existingSlugs = allPages.map(p => p.slug)
          // Visible debug output
          console.log('DEBUG /api/pages POST providedSlugs:', Array.from(providedSlugs))
          console.log('DEBUG /api/pages POST existingSlugs:', existingSlugs)
          const toDelete = existingSlugs.filter(s => !providedSlugs.has(s))
          console.log('DEBUG /api/pages POST toDelete:', toDelete)

          if (toDelete.length > 0) {
            // Find matching DB entries for the toDelete slugs
            const pagesToDelete = await prisma.page.findMany({ where: { slug: { in: toDelete } } })
            const slugsFound = pagesToDelete.map(p => p.slug)
            if (slugsFound.length > 0) {
              // Bulk delete for efficiency
              const delRes = await prisma.page.deleteMany({ where: { slug: { in: slugsFound } } })
              console.log('DEBUG /api/pages POST deleteMany count:', delRes.count)
              // Create audit logs per deleted page
              for (const pd of pagesToDelete) {
                try { await logAudit({ action: 'delete', resource: 'page', resourceId: pd.id, userId: null, details: { slug: pd.slug } }) } catch (e) { console.error('Audit log failed for deleted page', pd.slug, e) }
                console.log('DEBUG /api/pages POST deleted and audited:', pd.slug)
              }
            } else {
              console.log('DEBUG /api/pages POST no matching pages found to delete for slugs:', toDelete)
            }
          }
        } catch (e) {
          console.error('Failed to clean up removed pages:', e)
        }

        console.log('DEBUG /api/pages POST upsert results:', results.map(r => ({ id: r.id, slug: r.slug, status: r.status })));
        // audit logs for upserts
        for (const up of results) {
          try { await logAudit({ action: 'upsert', resource: 'page', resourceId: up.id, userId: null, details: { slug: up.slug } }) } catch (e) {}
        }
        return res.status(200).json(results)
      }

      // Single page upsert
      const p = body || {}
      // sanitize single payload
      try {
        if (p && p.data) p.data = sanitizeRecursive(p.data)
        if (p && p.blocks && Array.isArray(p.blocks)) {
          p.blocks = p.blocks.map(b => {
            if (!b || !b.props) return b
            return { ...b, props: sanitizeRecursive(b.props) }
          })
        }
      } catch (e) {
        console.warn('Failed to sanitize incoming single page payload', e)
      }
      if (!p.slug) return res.status(400).json({ error: 'Slug erforderlich' })
      const up = await prisma.page.upsert({
        where: { slug: String(p.slug) },
        create: {
          slug: String(p.slug),
          title: p.title || '',
          blocks: p.blocks || [],
          children: p.children || [],
          template: p.template || null,
          data: p.data || {}
        },
        update: {
          title: p.title || undefined,
          blocks: p.blocks || undefined,
          children: p.children || undefined,
          template: p.template || undefined,
          data: p.data || undefined
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
            publishAt: up.publishAt,
            template: up.template,
            data: up.data
          }
        } })
      } catch (e) {
        console.error('Revision create failed', e)
      }
      console.log('DEBUG /api/pages POST single upsert result:', { id: up.id, slug: up.slug, status: up.status });
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
