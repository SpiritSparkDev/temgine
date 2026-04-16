import { prisma } from '../../../lib/prisma'
import { sanitizeRecursive } from '../../../lib/htmlSanitize'
import fs from 'fs'
import path from 'path'

async function importCSSFiles(cssFiles = [], strategy = 'merge') {
  const cssDir = path.join(process.cwd(), 'public', 'extern_css')
  if (!fs.existsSync(cssDir)) fs.mkdirSync(cssDir, { recursive: true })

  // If replace strategy: delete all existing CSS files
  if (strategy === 'replace') {
    try {
      const allFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'))
      for (const file of allFiles) {
        fs.unlinkSync(path.join(cssDir, file))
      }
      // Also delete .order.json
      const orderPath = path.join(cssDir, '.order.json')
      if (fs.existsSync(orderPath)) fs.unlinkSync(orderPath)
    } catch (e) {
      console.warn('Failed to delete old CSS files:', e.message)
    }
  }

  // Write new CSS files
  const newFilenames = []
  for (const file of cssFiles) {
    const filename = file.filename || 'style.css'
    const content = file.content || ''
    const filePath = path.join(cssDir, filename)
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      newFilenames.push(filename)
    } catch (e) {
      console.warn(`Failed to write CSS file ${filename}:`, e.message)
    }
  }

  // Update .order.json — merge with existing order so non-imported files keep their position
  if (newFilenames.length > 0) {
    try {
      const orderPath = path.join(cssDir, '.order.json')
      let existingOrder = []
      if (strategy === 'merge' && fs.existsSync(orderPath)) {
        try { existingOrder = JSON.parse(fs.readFileSync(orderPath, 'utf-8')).order || [] } catch (e) {}
      }
      // Append new filenames that aren't already in the order
      const merged = [...existingOrder, ...newFilenames.filter(f => !existingOrder.includes(f))]
      fs.writeFileSync(orderPath, JSON.stringify({ order: merged }, null, 2), 'utf-8')
    } catch (e) {
      console.warn('Failed to write .order.json:', e.message)
    }
  }
}

function importJsonConfig(filename, data, strategy = 'merge') {
  if (!data || typeof data !== 'object') return
  const filePath = path.join(process.cwd(), 'data', filename)
  try {
    const dataDir = path.join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

    if (strategy === 'merge' && fs.existsSync(filePath)) {
      // Merge: combine disabled arrays, keeping unique entries
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      const merged = Array.from(new Set([
        ...(Array.isArray(existing.disabled) ? existing.disabled : []),
        ...(Array.isArray(data.disabled) ? data.disabled : [])
      ]))
      fs.writeFileSync(filePath, JSON.stringify({ ...existing, ...data, disabled: merged }, null, 2), 'utf-8')
    } else {
      // Replace: write as-is
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    }
  } catch (e) {
    console.warn(`Failed to write ${filename}:`, e.message)
  }
}

async function importNavigations(navigations = [], strategy = 'merge') {
  const navDir = path.join(process.cwd(), 'data', 'navigations')
  if (!fs.existsSync(navDir)) fs.mkdirSync(navDir, { recursive: true })

  // If replace strategy: delete all existing navigation files
  if (strategy === 'replace') {
    try {
      const allFiles = fs.readdirSync(navDir).filter(f => f.endsWith('.html'))
      for (const file of allFiles) {
        fs.unlinkSync(path.join(navDir, file))
      }
    } catch (e) {
      console.warn('Failed to delete old navigation files:', e.message)
    }
  }

  // Write navigation files
  for (const nav of navigations) {
    const filename = nav.filename || `${nav.name || 'nav'}.html`
    const code = nav.code || ''
    const filePath = path.join(navDir, filename)
    try {
      fs.writeFileSync(filePath, code, 'utf-8')
    } catch (e) {
      console.warn(`Failed to write navigation file ${filename}:`, e.message)
    }
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end()

    const strategy = (req.query.strategy || 'merge').toLowerCase()
    if (!['merge', 'replace'].includes(strategy)) {
      return res.status(400).json({ error: 'Invalid strategy. Use "merge" or "replace"' })
    }

    const body = req.body || {}
    const backup = body.metadata ? body : { templates: body.templates || [], snippets: body.snippets || [], pages: body.pages || [], css: body.css || [], navigations: body.navigations || [] }
    
    const templates = Array.isArray(backup.templates) ? backup.templates : []
    const snippets = Array.isArray(backup.snippets) ? backup.snippets : []
    const pages = Array.isArray(backup.pages) ? backup.pages : []
    const css = Array.isArray(backup.css) ? backup.css : []
    const navigations = Array.isArray(backup.navigations) ? backup.navigations : []
    const cssConfig = backup.cssConfig || null
    const fontsConfig = backup.fontsConfig || null

    let importStats = { templates: 0, snippets: 0, pages: 0, css: 0, navigations: 0, errors: [] }

    // Handle replace strategy for database records
    if (strategy === 'replace') {
      try {
        await prisma.template.deleteMany({})
        await prisma.snippet.deleteMany({})
        await prisma.page.deleteMany({})
      } catch (e) {
        console.warn('Failed to delete existing records in replace mode:', e.message)
      }
    }

    // Import templates
    for (const t of templates) {
      if (!t.name) continue
      try {
        await prisma.template.upsert({
          where: { name: t.name },
          create: { name: t.name, code: t.code || '', type: t.type || 'SITE' },
          update: { code: t.code || '', type: t.type || 'SITE' }
        })
        importStats.templates++
      } catch (e) {
        importStats.errors.push(`Template "${t.name}": ${e.message}`)
      }
    }

    // Import snippets (preserve metadata)
    const snippetKeys = []
    for (const s of snippets) {
      const label = String(s.label || s.key || '').trim()
      if (!label) continue
      try {
        const key = label
        snippetKeys.push(key)
        let value = String(s.snippet || '')
        if (s.type || s.handler || s.key) {
          value = JSON.stringify({
            key: s.key || '',
            snippet: s.snippet || '',
            type: s.type || 'free',
            handler: s.handler || ''
          })
        }
        try { value = sanitizeRecursive(value) } catch (e) {}
        await prisma.snippet.upsert({
          where: { key },
          create: { key, value },
          update: { value }
        })
        importStats.snippets++
      } catch (e) {
        importStats.errors.push(`Snippet "${label}": ${e.message}`)
      }
    }

    // In replace mode, delete snippets not in backup
    if (strategy === 'replace' && snippetKeys.length > 0) {
      try {
        await prisma.snippet.deleteMany({ where: { key: { notIn: snippetKeys } } })
      } catch (e) {
        console.warn('Failed to cleanup snippets in replace mode:', e.message)
      }
    }

    // Import pages (simple upsert by slug)
    for (const p of pages) {
      if (!p.slug) continue
      try {
        const slug = String(p.slug)
        const data = sanitizeRecursive(p.data || {})
        await prisma.page.upsert({
          where: { slug },
          create: {
            slug,
            title: p.title || slug,
            blocks: p.blocks || [],
            data,
            children: p.children || [],
            template: p.template || null,
            status: p.status || 'DRAFT',
            publishAt: p.publishAt ? new Date(p.publishAt) : null,
            isHomepage: p.isHomepage || false
          },
          update: {
            title: p.title || slug,
            blocks: p.blocks || [],
            data,
            children: p.children || [],
            template: p.template,
            status: p.status || 'DRAFT',
            publishAt: p.publishAt ? new Date(p.publishAt) : null,
            isHomepage: p.isHomepage || false
          }
        })
        importStats.pages++
      } catch (e) {
        importStats.errors.push(`Page "${p.slug}": ${e.message}`)
      }
    }

    // Import CSS files
    try {
      await importCSSFiles(css, strategy)
      importStats.css = css.length
    } catch (e) {
      importStats.errors.push(`CSS import failed: ${e.message}`)
    }

    // Import navigations
    try {
      await importNavigations(navigations, strategy)
      importStats.navigations = navigations.length
    } catch (e) {
      importStats.errors.push(`Navigations import failed: ${e.message}`)
    }

    // Restore CSS enabled/disabled config
    if (cssConfig) {
      try {
        importJsonConfig('css-config.json', cssConfig, strategy)
      } catch (e) {
        importStats.errors.push(`CSS-Config import failed: ${e.message}`)
      }
    }

    // Restore Fonts enabled/disabled config
    if (fontsConfig) {
      try {
        importJsonConfig('fonts-config.json', fontsConfig, strategy)
      } catch (e) {
        importStats.errors.push(`Fonts-Config import failed: ${e.message}`)
      }
    }

    return res.status(200).json({
      ok: true,
      strategy,
      importStats,
      message: `Import completed: ${importStats.templates} templates, ${importStats.snippets} snippets, ${importStats.pages} pages, ${importStats.css} CSS files, ${importStats.navigations} navigations${importStats.errors.length > 0 ? ` (${importStats.errors.length} errors)` : ''}`
    })
  } catch (e) {
    console.error('[/api/admin/import] Error:', e.message, e.stack)
    res.status(500).json({ error: 'Import failed', details: e.message })
  }
}
