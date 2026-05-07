import { prisma } from '../../../lib/prisma'
import { sanitizeRecursive } from '../../../lib/htmlSanitize'

/**
 * POST /api/import/create
 *
 * Body:
 * {
 *   parentSlug:  string,            // slug of the folder (parent) page — required
 *   parentTitle: string,            // title for the folder page (used only when creating it)
 *   pageTitle:   string,
 *   pageSlug:    string,            // slug segment of the child page (without folder prefix)
 *   siteTemplate: string?,
 *   blocks: Array<{ template, props, children? }>,
 *   newTemplates?: Array<{ name, code, type? }>
 * }
 *
 * Returns: { ok: true, page: { slug, title }, createdTemplates: string[] }
 */
export default async function handler(req, res) {
  if (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_DEV_MODE !== 'true') {
    return res.status(404).json({ error: 'Not found' })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = req.body || {}
    const { parentSlug, parentTitle, pageTitle, pageSlug, siteTemplate, blocks, newTemplates } = body

    // --- Validate required fields ---
    const pSlug  = String(parentSlug  || '').trim()
    const pTitle = String(parentTitle || '').trim()
    const title  = String(pageTitle   || '').trim()
    const slug   = String(pageSlug    || '').trim()

    if (!pSlug)  return res.status(400).json({ error: 'parentSlug ist erforderlich' })
    if (!pTitle) return res.status(400).json({ error: 'parentTitle ist erforderlich' })
    if (!title)  return res.status(400).json({ error: 'pageTitle ist erforderlich' })
    if (!slug)   return res.status(400).json({ error: 'pageSlug ist erforderlich' })

    const slugRe = /^[a-z0-9][a-z0-9-]*$/
    if (!slugRe.test(pSlug)) return res.status(400).json({ error: 'parentSlug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten' })
    if (!slugRe.test(slug))  return res.status(400).json({ error: 'pageSlug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten' })

    // --- Step 1: Save new templates (if any) ---
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

    // --- Step 2: Sanitize blocks ---
    const rawBlocks = Array.isArray(blocks) ? blocks : []
    const sanitizedBlocks = rawBlocks.map(block => {
      if (!block || typeof block !== 'object') return null
      return {
        template: String(block.template || '').trim() || undefined,
        type: block.type ? String(block.type).trim() : undefined,
        props: sanitizeRecursive(block.props || {}),
        children: Array.isArray(block.children) ? block.children : [],
      }
    }).filter(Boolean)

    // Child page object — stored in parent.children JSON (no separate DB row)
    const childPage = {
      slug,
      title,
      template: siteTemplate ? String(siteTemplate).trim() : null,
      blocks: sanitizedBlocks,
      children: [],
      status: 'DRAFT',
      data: {},
      isHomepage: false,
      accessGroups: [],
    }

    // --- Step 3: Upsert parent (folder) page ---
    let parentPage = await prisma.page.findUnique({ where: { slug: pSlug } })

    if (parentPage) {
      // Check child slug uniqueness within this folder
      const existingChildren = Array.isArray(parentPage.children) ? parentPage.children : []
      if (existingChildren.some(c => c.slug === slug)) {
        return res.status(409).json({ error: `Eine Seite mit dem Slug "${slug}" existiert bereits in Ordner "${pSlug}"` })
      }
      parentPage = await prisma.page.update({
        where: { slug: pSlug },
        data: { children: [...existingChildren, childPage] },
      })
    } else {
      parentPage = await prisma.page.create({
        data: {
          slug: pSlug,
          title: pTitle,
          template: null,
          blocks: [],
          children: [childPage],
          status: 'DRAFT',
          data: {},
          isHomepage: false,
          accessGroups: [],
        },
      })
    }

    // Record revision for parent
    try {
      await prisma.pageRevision.create({
        data: {
          pageId: parentPage.id,
          data: { title: parentPage.title, slug: parentPage.slug, blocks: parentPage.blocks, children: parentPage.children, status: parentPage.status },
        },
      })
    } catch (e) {
      console.warn('[import/create] Revision create failed:', e.message)
    }

    const fullSlug = `${pSlug}/${slug}`
    return res.status(200).json({
      ok: true,
      page: { id: parentPage.id, slug: fullSlug, title },
      parentSlug: pSlug,
      createdTemplates,
    })
  } catch (e) {
    console.error('[/api/import/create]', e.message, e.stack)
    return res.status(500).json({ error: 'Server-Fehler beim Import', details: e.message })
  }
}
