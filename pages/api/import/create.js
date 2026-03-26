import { prisma } from '../../../lib/prisma'
import { sanitizeRecursive } from '../../../lib/htmlSanitize'

/**
 * POST /api/import/create
 *
 * Body:
 * {
 *   pageTitle: string,
 *   pageSlug: string,
 *   siteTemplate: string,           // name of the site template to use
 *   blocks: Array<{                 // blocks to store on the page
 *     template: string,             // block template name
 *     props: Object,
 *     children?: Array
 *   }>,
 *   newTemplates?: Array<{          // new BLOCK templates to create
 *     name: string,
 *     code: string,
 *     type?: 'BLOCK' | 'SITE'
 *   }>
 * }
 *
 * Returns: { ok: true, page: { slug, title }, createdTemplates: string[] }
 */
export default async function handler(req, res) {
  // This endpoint is only available in development mode
  if (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_DEV_MODE !== 'true') {
    return res.status(404).json({ error: 'Not found' })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = req.body || {}
    const { pageTitle, pageSlug, siteTemplate, blocks, newTemplates } = body

    // --- Validate required fields ---
    const title = String(pageTitle || '').trim()
    const slug = String(pageSlug || '').trim()

    if (!title) return res.status(400).json({ error: 'pageTitle ist erforderlich' })
    if (!slug)  return res.status(400).json({ error: 'pageSlug ist erforderlich' })

    // Basic slug format validation: only lowercase letters, digits, hyphens, slashes
    if (!/^[a-z0-9][a-z0-9\-/]*$/.test(slug)) {
      return res.status(400).json({ error: 'pageSlug darf nur Kleinbuchstaben, Ziffern, Bindestriche und Schrägstriche enthalten' })
    }

    // Ensure slug is not already taken
    const existing = await prisma.page.findUnique({ where: { slug } })
    if (existing) {
      return res.status(409).json({ error: `Eine Seite mit dem Slug "${slug}" existiert bereits` })
    }

    // --- Step 1: Save new block templates (if any) ---
    const createdTemplates = []
    const templateList = Array.isArray(newTemplates) ? newTemplates : []

    for (const t of templateList) {
      const tname = String(t.name || '').trim()
      const tcode = String(t.code || '').trim()
      if (!tname || !tcode) continue

      const ttype = String(t.type || 'BLOCK').toUpperCase() === 'SITE' ? 'SITE' : 'BLOCK'
      await prisma.template.upsert({
        where: { name: tname },
        create: { name: tname, code: tcode, type: ttype },
        update: { code: tcode, type: ttype },
      })
      createdTemplates.push(tname)
    }

    // --- Step 2: Sanitize and normalise blocks ---
    const rawBlocks = Array.isArray(blocks) ? blocks : []
    const sanitizedBlocks = rawBlocks.map(block => {
      if (!block || typeof block !== 'object') return null
      return {
        template: String(block.template || '').trim() || undefined,
        props: sanitizeRecursive(block.props || {}),
        children: Array.isArray(block.children) ? block.children : [],
      }
    }).filter(Boolean)

    // --- Step 3: Create the page ---
    const page = await prisma.page.create({
      data: {
        slug,
        title,
        template: siteTemplate ? String(siteTemplate).trim() : null,
        blocks: sanitizedBlocks,
        children: [],
        status: 'DRAFT',
        data: {},
        isHomepage: false,
      },
    })

    // Record revision
    try {
      await prisma.pageRevision.create({
        data: {
          pageId: page.id,
          data: { title: page.title, slug: page.slug, blocks: page.blocks, children: page.children, status: page.status },
        },
      })
    } catch (e) {
      // Non-fatal
      console.warn('[import/create] Revision create failed:', e.message)
    }

    return res.status(200).json({
      ok: true,
      page: { id: page.id, slug: page.slug, title: page.title },
      createdTemplates,
    })
  } catch (e) {
    console.error('[/api/import/create]', e.message, e.stack)
    return res.status(500).json({ error: 'Server-Fehler beim Import', details: e.message })
  }
}
