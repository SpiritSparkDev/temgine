import { prisma } from '../../../lib/prisma'
import { sanitizeRecursive } from '../../../lib/htmlSanitize'
import { requireAuth } from '../../../lib/auth'
import fs from 'fs'
import path from 'path'

const VALID_NAV_TYPES = new Set(['MAIN', 'PAGE'])
const FONT_EXTS = new Set(['.ttf', '.woff', '.woff2', '.otf', '.eot'])

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}

function normalizeCssFilename(input, fallback = 'style.css') {
  const raw = String(input || '').trim();
  const base = path.basename(raw || fallback).replace(/[^A-Za-z0-9._-]/g, '_');
  const withExt = base.toLowerCase().endsWith('.css') ? base : `${base}.css`;
  const finalName = withExt === '.css' ? fallback : withExt;
  return finalName;
}

async function importCSSFiles(cssFiles = [], strategy = 'merge') {
  const cssDir = path.join(process.cwd(), 'public', 'extern_css')
  if (!fs.existsSync(cssDir)) fs.mkdirSync(cssDir, { recursive: true })

  const result = {
    imported: 0,
    errors: [],
    writtenFiles: []
  }

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
      result.errors.push(`Vorhandene CSS-Dateien konnten nicht vollständig gelöscht werden: ${e.message}`)
    }
  }

  // Write new CSS files
  const newFilenames = []
  const usedNames = new Set()
  for (const file of cssFiles) {
    const rawName = file?.filename || file?.name || file?.file || ''
    let filename = normalizeCssFilename(rawName, 'style.css')
    if (usedNames.has(filename)) {
      const stem = filename.replace(/\.css$/i, '')
      let i = 2
      while (usedNames.has(`${stem}-${i}.css`)) i++
      filename = `${stem}-${i}.css`
    }
    usedNames.add(filename)
    const content = file.content || ''
    const filePath = path.join(cssDir, filename)
    if (!path.resolve(filePath).startsWith(path.resolve(cssDir))) {
      result.errors.push(`Ungültiger CSS-Dateiname übersprungen: ${rawName || '(leer)'}`)
      continue
    }
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      newFilenames.push(filename)
      result.imported++
      result.writtenFiles.push(filename)
    } catch (e) {
      console.warn(`Failed to write CSS file ${filename}:`, e.message)
      result.errors.push(`CSS-Datei "${filename}" konnte nicht geschrieben werden: ${e.message}`)
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
      result.errors.push(`CSS-Reihenfolge (.order.json) konnte nicht aktualisiert werden: ${e.message}`)
    }
  }

  return result
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
  const result = { imported: 0, errors: [], activeMainId: null }

  if (strategy === 'replace') {
    try {
      await prisma.navigation.deleteMany({})
    } catch (e) {
      result.errors.push(`Vorhandene Navigationen konnten nicht gelöscht werden: ${e.message}`)
    }
  }

  for (const nav of navigations) {
    const name = String(nav?.name || '').trim() || 'Navigation'
    const rawType = String(nav?.type || 'MAIN').toUpperCase()
    const type = VALID_NAV_TYPES.has(rawType) ? rawType : 'MAIN'
    const code = String(nav?.code || '')
    const isActive = Boolean(nav?.isActive)

    try {
      let saved = null
      if (nav?.id) {
        // Preserve IDs from backup when available so page.data.pageNav remains valid.
        saved = await prisma.navigation.upsert({
          where: { id: String(nav.id) },
          create: { id: String(nav.id), name, type, code, isActive },
          update: { name, type, code, isActive }
        })
      } else {
        // Legacy backups without nav ID: best-effort match by type+name.
        const existing = await prisma.navigation.findFirst({ where: { type, name } })
        if (existing) {
          saved = await prisma.navigation.update({
            where: { id: existing.id },
            data: { code, isActive }
          })
        } else {
          saved = await prisma.navigation.create({ data: { name, type, code, isActive } })
        }
      }

      if (saved?.type === 'MAIN' && saved?.isActive) {
        result.activeMainId = saved.id
      }
      result.imported++
    } catch (e) {
      result.errors.push(`Navigation "${name}" konnte nicht importiert werden: ${e.message}`)
    }
  }

  // Ensure only one active navigation per type.
  for (const type of VALID_NAV_TYPES) {
    try {
      const actives = await prisma.navigation.findMany({
        where: { type, isActive: true },
        orderBy: { updatedAt: 'desc' },
        select: { id: true }
      })
      if (actives.length > 1) {
        const keepId = actives[0].id
        await prisma.navigation.updateMany({
          where: { type, isActive: true, id: { not: keepId } },
          data: { isActive: false }
        })
      }
      if (type === 'MAIN' && !result.activeMainId && actives[0]?.id) {
        result.activeMainId = actives[0].id
      }
    } catch (e) {
      result.errors.push(`Aktive Navigationen für Typ ${type} konnten nicht bereinigt werden: ${e.message}`)
    }
  }

  return result
}

async function reconcilePageNavReferences(fallbackMainId = null) {
  const result = { fixed: 0, errors: [] }
  try {
    const navs = await prisma.navigation.findMany({
      where: { type: { in: ['MAIN', 'PAGE'] } },
      select: { id: true, type: true, isActive: true }
    })
    const validIds = new Set(navs.map(n => n.id))
    const activeMainId = fallbackMainId || (navs.find(n => n.type === 'MAIN' && n.isActive)?.id || null)

    const pages = await prisma.page.findMany({ select: { id: true, data: true } })
    for (const p of pages) {
      const data = (p.data && typeof p.data === 'object' && !Array.isArray(p.data)) ? { ...p.data } : {}
      if (!data.pageNav) continue
      const pageNav = String(data.pageNav)
      if (validIds.has(pageNav)) continue

      if (activeMainId) data.pageNav = activeMainId
      else delete data.pageNav

      await prisma.page.update({ where: { id: p.id }, data: { data } })
      result.fixed++
    }
  } catch (e) {
    result.errors.push(`Seiten-Navigationsreferenzen konnten nicht bereinigt werden: ${e.message}`)
  }
  return result
}

function sanitizeUploadRelativePath(input) {
  const norm = String(input || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!norm || norm.includes('..')) return null
  return norm.split('/').map(seg => seg.replace(/[^A-Za-z0-9._-]/g, '_')).join('/')
}

function importUploadFonts(uploadFonts = [], strategy = 'merge') {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
  const result = { imported: 0, errors: [] }
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

  // Replace strategy: remove existing font files under uploads recursively.
  if (strategy === 'replace') {
    const walkDeleteFonts = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const e of entries) {
          const abs = path.join(dir, e.name)
          if (e.isDirectory()) walkDeleteFonts(abs)
          else if (FONT_EXTS.has(path.extname(e.name).toLowerCase())) fs.unlinkSync(abs)
        }
      } catch (e) {
        result.errors.push(`Vorhandene Upload-Fonts konnten nicht vollständig gelöscht werden: ${e.message}`)
      }
    }
    walkDeleteFonts(uploadsDir)
  }

  for (const item of uploadFonts) {
    const rel = sanitizeUploadRelativePath(item?.path)
    if (!rel) {
      result.errors.push('Ungültiger Upload-Font-Pfad übersprungen')
      continue
    }
    const ext = path.extname(rel).toLowerCase()
    if (!FONT_EXTS.has(ext)) continue

    const abs = path.join(uploadsDir, rel)
    if (!path.resolve(abs).startsWith(path.resolve(uploadsDir))) {
      result.errors.push(`Unsicherer Upload-Font-Pfad übersprungen: ${rel}`)
      continue
    }

    try {
      const dir = path.dirname(abs)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const raw = item?.encoding === 'base64'
        ? Buffer.from(String(item.content || ''), 'base64')
        : Buffer.from(String(item.content || ''), 'utf-8')
      fs.writeFileSync(abs, raw)
      result.imported++
    } catch (e) {
      result.errors.push(`Upload-Font "${rel}" konnte nicht geschrieben werden: ${e.message}`)
    }
  }

  return result
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end()

    const auth = await requireAuth(req, res, ['ADMIN'])
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

    const strategy = (req.query.strategy || 'merge').toLowerCase()
    if (!['merge', 'replace'].includes(strategy)) {
      return res.status(400).json({ error: 'Invalid strategy. Use "merge" or "replace"' })
    }

    const body = req.body || {}
    const backup = body.metadata ? body : { templates: body.templates || [], snippets: body.snippets || [], pages: body.pages || [], css: body.css || [], navigations: body.navigations || [], uploadFonts: body.uploadFonts || [] }
    
    const templates = Array.isArray(backup.templates) ? backup.templates : []
    const snippets = Array.isArray(backup.snippets) ? backup.snippets : []
    const pages = Array.isArray(backup.pages) ? backup.pages : []
    const css = Array.isArray(backup.css) ? backup.css : []
    const navigations = Array.isArray(backup.navigations) ? backup.navigations : []
    const uploadFonts = Array.isArray(backup.uploadFonts) ? backup.uploadFonts : []
    const cssConfig = backup.cssConfig || null
    const fontsConfig = backup.fontsConfig || null

    let importStats = { templates: 0, snippets: 0, pages: 0, css: 0, navigations: 0, uploadFonts: 0, fixedPageNavRefs: 0, errors: [] }

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
      const cssResult = await importCSSFiles(css, strategy)
      importStats.css = cssResult.imported
      if (cssResult.errors.length > 0) {
        importStats.errors.push(...cssResult.errors)
      }
    } catch (e) {
      importStats.errors.push(`CSS import failed: ${e.message}`)
    }

    // Import navigations
    try {
      const navResult = await importNavigations(navigations, strategy)
      importStats.navigations = navResult.imported
      if (navResult.errors.length > 0) importStats.errors.push(...navResult.errors)

      const reconcileResult = await reconcilePageNavReferences(navResult.activeMainId)
      importStats.fixedPageNavRefs = reconcileResult.fixed
      if (reconcileResult.errors.length > 0) importStats.errors.push(...reconcileResult.errors)
    } catch (e) {
      importStats.errors.push(`Navigations import failed: ${e.message}`)
    }

    // Restore uploaded font files so @font-face URLs keep working after restore
    try {
      const uploadFontResult = importUploadFonts(uploadFonts, strategy)
      importStats.uploadFonts = uploadFontResult.imported
      if (uploadFontResult.errors.length > 0) importStats.errors.push(...uploadFontResult.errors)
    } catch (e) {
      importStats.errors.push(`Upload-Fonts import failed: ${e.message}`)
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
      message: `Import completed: ${importStats.templates} templates, ${importStats.snippets} snippets, ${importStats.pages} pages, ${importStats.css} CSS files, ${importStats.navigations} navigations, ${importStats.uploadFonts} upload fonts${importStats.fixedPageNavRefs > 0 ? `, ${importStats.fixedPageNavRefs} fixed page navigation refs` : ''}${importStats.errors.length > 0 ? ` (${importStats.errors.length} errors)` : ''}`
    })
  } catch (e) {
    console.error('[/api/admin/import] Error:', e.message, e.stack)
    res.status(500).json({ error: 'Import failed', details: e.message })
  }
}
