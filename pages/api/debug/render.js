import { prisma } from '../../../lib/prisma'
import { renderPage } from '../../../lib/templateEngine'

export default async function handler(req, res) {
  try {
    const slug = req.query && req.query.slug
    if (!slug) return res.status(400).json({ error: 'slug required' })

    // Fetch all pages (hierarchy expected)
    const allPages = await prisma.page.findMany({ orderBy: { createdAt: 'asc' } })

    // find page by slug (top-level)
    const findPageBySlug = (nodes, s) => {
      for (const n of nodes || []) {
        if (n.slug === s) return n
        if (n.children && n.children.length) {
          const found = findPageBySlug(n.children, s)
          if (found) return found
        }
      }
      return null
    }

    const page = findPageBySlug(allPages, String(slug)) || null
    if (!page) return res.status(404).json({ error: 'page not found' })

    // Collect templates to load
    const templatesToLoad = new Set()
    if (page.blocks) {
      (page.blocks || []).forEach(block => {
        const tname = block.template || block.type
        if (tname) templatesToLoad.add(tname)
      })
    }
    if (page.template) templatesToLoad.add(page.template)

    const templateCodes = {}
    const missingTemplates = []
    for (const name of templatesToLoad) {
      try {
        const t = await prisma.template.findFirst({ where: { name: { equals: String(name), mode: 'insensitive' } } })
        if (t) templateCodes[name] = t.code
        else missingTemplates.push(name)
      } catch (e) {
        missingTemplates.push(name)
      }
    }

    // Load navigation templates
    const navFiles = []
    // reading from data/navigations via FS would be more accurate but reuse existing API shape
    try {
      const nres = await fetch(`${process.env.NEXTAUTH_URL || ''}/api/navigations`)
      // Not reliable in serverless without NEXTAUTH_URL; skip
    } catch (e) {}

    // Render page (will produce debug panels if blocks missing)
    const pageTemplateCode = page.template ? (templateCodes[page.template] || null) : null
    const rendered = renderPage(page, templateCodes, pageTemplateCode, allPages, {}, templateCodes)

    return res.status(200).json({
      slug: page.slug,
      templatesToLoad: Array.from(templatesToLoad),
      missingTemplates,
      templateCodesKeys: Object.keys(templateCodes),
      renderedLength: rendered.length,
      renderedPreview: rendered.slice(0, 800)
    })
  } catch (e) {
    console.error('debug render failed', e)
    return res.status(500).json({ error: 'server error' })
  }
}
