import { prisma } from '../../lib/prisma'
import { logAudit } from '../../lib/audit'
import { sanitizeRecursive } from '../../lib/htmlSanitize'
import { validate, rules } from '../../lib/validate'

// Löscht Revisionen, die älter als die konfigurierte Aufbewahrungsfrist sind
async function pruneRevisions(pageId) {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'revisionRetentionDays' } })
    const days = setting ? parseInt(setting.value, 10) : 7
    if (isNaN(days) || days < 0) return
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    await prisma.pageRevision.deleteMany({
      where: { pageId: String(pageId), createdAt: { lt: cutoff } },
    })
  } catch (e) {
    console.error('Revision pruning failed', e)
  }
}

// Standardized error response helper
const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

// API-Route für Seiten: Daten kommen jetzt ausschließlich aus der Datenbank
export default async function handler(req, res) {
  try {
    const normalizeSlotName = (value) => {
      if (value === undefined || value === null) return ''
      return String(value).trim().replace(/\s+/g, '-')
    }

    const sanitizeBlockNode = (block) => {
      if (!block || typeof block !== 'object') return block

      const next = { ...block }
      if (next.props && typeof next.props === 'object') {
        next.props = sanitizeRecursive(next.props)
      }

      if (next.slot !== undefined) {
        const normalizedSlot = normalizeSlotName(next.slot)
        if (normalizedSlot) {
          next.slot = normalizedSlot
        } else {
          delete next.slot
        }
      }

      if (Array.isArray(next.children)) {
        next.children = next.children.map(sanitizeBlockNode)
      }

      return next
    }

    // GET: alle Seiten oder eine Seite per ?slug=...
    if (req.method === 'GET') {
      const slug = req.query && req.query.slug
      const includeDrafts = req.query && (req.query.includeDrafts === 'true' || req.query.includeDrafts === true)
      if (slug) {
        const page = await prisma.page.findUnique({ where: { slug: String(slug) } })
        if (!page) {
          const [status, resp] = errorResponse(404, 'Seite nicht gefunden', 'PAGE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        if (!includeDrafts && page.status !== 'PUBLISHED') {
          const [status, resp] = errorResponse(404, 'Seite nicht gefunden', 'PAGE_NOT_FOUND');
          return res.status(status).json(resp);
        }
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
      // Restore user-defined sort order (stored as data._order on each top-level page)
      pages.sort((a, b) => {
        const ao = (a.data && typeof a.data._order === 'number') ? a.data._order : 99999
        const bo = (b.data && typeof b.data._order === 'number') ? b.data._order : 99999
        return ao !== bo ? ao - bo : (a.createdAt < b.createdAt ? -1 : 1)
      })
      return res.status(200).json(pages)
    }

    // POST: Seite anlegen oder aktualisieren (erwartet ein Page-Objekt)
    if (req.method === 'POST') {
      const body = req.body
      // Wenn ein Array gesendet wird, upserten wir alle Einträge
      if (Array.isArray(body)) {
        const results = []

        // helper: collect only TOP-LEVEL slugs from the provided array.
        // Children are stored as JSON inside their parent's `children` column
        // and do NOT have their own DB rows, so we must NOT recurse into them —
        // otherwise a deleted top-level page whose slug still appears in another
        // page's children JSON would never be removed from the DB.
        const collectSlugs = (nodes) => {
          const s = new Set()
          for (const n of nodes || []) {
            if (n && n.slug) s.add(String(n.slug))
          }
          return s
        }

        const providedSlugs = collectSlugs(body)

        // Stamp top-level sort order into data so GET can restore it
        for (let _i = 0; _i < body.length; _i++) {
          if (body[_i]) body[_i].data = { ...(body[_i].data || {}), _order: _i }
        }

        // Only upsert top-level nodes; children are stored in the parent's `children` JSON
        for (const p of body) {
          // sanitize incoming page content (blocks.props, data)
          try {
            if (p && p.data) p.data = sanitizeRecursive(p.data)
            if (p && p.blocks && Array.isArray(p.blocks)) {
              p.blocks = p.blocks.map(sanitizeBlockNode)
            }
          } catch (e) {
            console.warn('Failed to sanitize incoming page payload', e)
          }
          if (!p || !p.slug) continue

          try {
            // Wenn diese Seite als Homepage gesetzt wird, deaktiviere alle anderen Homepages
            if (p.isHomepage === true) {
              await prisma.page.updateMany({
                where: { isHomepage: true, slug: { not: String(p.slug) } },
                data: { isHomepage: false }
              })
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
              isHomepage: p.isHomepage || false,
              accessGroups: Array.isArray(p.accessGroups) ? p.accessGroups : []
            },
            update: {
              title: p.title || undefined,
              blocks: p.blocks || undefined,
              children: p.children || undefined,
              status: p.status || undefined,
              publishAt: p.publishAt || undefined,
              template: p.template || undefined,
              data: p.data || undefined,
              isHomepage: p.isHomepage !== undefined ? p.isHomepage : undefined,
              accessGroups: Array.isArray(p.accessGroups) ? p.accessGroups : undefined
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
            await pruneRevisions(up.id)
          } catch (e) {
            console.error('Revision create failed', e)
          }
        }

        // Remove pages that are no longer present in the provided tree
        try {
          const allPages = await prisma.page.findMany()
          const existingSlugs = allPages.map(p => p.slug)
          const toDelete = existingSlugs.filter(s => !providedSlugs.has(s))

          if (toDelete.length > 0) {
            // Find matching DB entries for the toDelete slugs
            const pagesToDelete = await prisma.page.findMany({ where: { slug: { in: toDelete } } })
            const slugsFound = pagesToDelete.map(p => p.slug)
            if (slugsFound.length > 0) {
              // Bulk delete for efficiency
              await prisma.page.deleteMany({ where: { slug: { in: slugsFound } } })
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
          p.blocks = p.blocks.map(sanitizeBlockNode)
        }
      } catch (e) {
        console.warn('Failed to sanitize incoming single page payload', e)
      }
      if (!p.slug) {
        const [status, resp] = errorResponse(400, 'Slug erforderlich', 'VALIDATION_ERROR', { missing: ['slug'] });
        return res.status(status).json(resp);
      }
      // Validate single page fields
      const [pageOk, pageErrors] = validate(p, {
        slug:   [rules.required(), rules.string(), rules.maxLen(255)],
        title:  [rules.string(), rules.maxLen(300)],
        status: [rules.oneOf(['DRAFT','REVIEW','APPROVED','PUBLISHED','SCHEDULED'])],
      });
      if (!pageOk) {
        const [status, resp] = errorResponse(400, 'Ungültige Seitendaten', 'VALIDATION_ERROR', pageErrors);
        return res.status(status).json(resp);
      }
      const up = await prisma.page.upsert({
        where: { slug: String(p.slug) },
        create: {
          slug: String(p.slug),
          title: p.title || '',
          blocks: p.blocks || [],
          children: p.children || [],
          template: p.template || null,
          data: p.data || {},
          status: p.status || 'DRAFT',
          publishAt: p.publishAt || null,
          isHomepage: p.isHomepage || false,
          accessGroups: Array.isArray(p.accessGroups) ? p.accessGroups : []
        },
        update: {
          title: p.title || undefined,
          blocks: p.blocks || undefined,
          children: p.children || undefined,
          template: p.template || undefined,
          data: p.data || undefined,
          status: p.status || undefined,
          publishAt: p.publishAt !== undefined ? (p.publishAt || null) : undefined,
          isHomepage: p.isHomepage !== undefined ? p.isHomepage : undefined,
          accessGroups: Array.isArray(p.accessGroups) ? p.accessGroups : undefined
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
        await pruneRevisions(up.id)
      } catch (e) {
        console.error('Revision create failed', e)
      }
      try { await logAudit({ action: 'upsert', resource: 'page', resourceId: up.id, userId: null, details: { slug: up.slug } }) } catch (e) {}
      return res.status(200).json(up)
    }

    // DELETE: Seite per slug löschen
    if (req.method === 'DELETE') {
      const { slug } = req.body || {}
      if (!slug) {
        const [status, resp] = errorResponse(400, 'Slug erforderlich', 'VALIDATION_ERROR', { missing: ['slug'] });
        return res.status(status).json(resp);
      }
      try {
        const deleted = await prisma.page.delete({ where: { slug: String(slug) } })
        try { await logAudit({ action: 'delete', resource: 'page', resourceId: deleted.id, userId: null, details: { slug } }) } catch (e) {}
        return res.status(200).json({ ok: true })
      } catch (e) {
        if (e.code === 'P2025') {
          const [status, resp] = errorResponse(404, 'Seite nicht gefunden', 'PAGE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        throw e;
      }
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/pages Error]', e.message, e.stack)
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
