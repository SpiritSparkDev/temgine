import { prisma } from '../../../lib/prisma'
import { sanitizeRecursive } from '../../../lib/htmlSanitize'
import { requireAuth } from '../../../lib/auth'
import { listTemplates, saveTemplate, deleteTemplateByName } from '../../../lib/templateStore'
import { listNavigations, saveNavigation, deleteNavigation } from '../../../lib/navigationStore'
import { listFooters, saveFooter, deleteFooter } from '../../../lib/footerStore'
import { MAINTENANCE_PAGES, saveMaintenanceField } from '../../../lib/maintenanceStore'
import fs from 'fs'
import path from 'path'

const VALID_NAV_TYPES = new Set(['MAIN', 'PAGE'])
const FONT_EXTS = new Set(['.ttf', '.woff', '.woff2', '.otf', '.eot'])

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '500mb',
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
      for (const n of listNavigations()) deleteNavigation(n.id)
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
        // Preserve IDs from backup when available so page.data.pageNav remains valid
        // — saveNavigation creates a navigation under this exact id if it doesn't
        // exist yet, or updates it in place if it does.
        saved = saveNavigation({ id: String(nav.id), name, type, code, isActive })
      } else {
        // Legacy backups without nav ID: best-effort match by type+name.
        const existing = listNavigations().find((n) => n.type === type && n.name === name)
        saved = existing
          ? saveNavigation({ id: existing.id, name, type, code, isActive })
          : saveNavigation({ name, type, code, isActive })
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
      const actives = listNavigations()
        .filter((n) => n.type === type && n.isActive)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      if (actives.length > 1) {
        for (const extra of actives.slice(1)) {
          saveNavigation({ id: extra.id, isActive: false })
        }
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

async function importGlobalVariables(globalVariables = [], strategy = 'merge') {
  const result = { imported: 0, errors: [] }

  if (strategy === 'replace') {
    try {
      await prisma.globalVariable.deleteMany({})
    } catch (e) {
      result.errors.push(`Vorhandene globale Variablen konnten nicht gelöscht werden: ${e.message}`)
    }
  }

  for (const gv of globalVariables) {
    const key = String(gv?.key || '').trim()
    if (!key) continue
    try {
      await prisma.globalVariable.upsert({
        where: { key },
        create: {
          key,
          label: String(gv.label || key),
          type: gv.type || 'STRING',
          value: String(gv.value || ''),
          fallback: gv.fallback == null ? null : String(gv.fallback),
          isActive: gv.isActive !== false,
          sortOrder: Number(gv.sortOrder) || 0
        },
        update: {
          label: String(gv.label || key),
          type: gv.type || 'STRING',
          value: String(gv.value || ''),
          fallback: gv.fallback == null ? null : String(gv.fallback),
          isActive: gv.isActive !== false,
          sortOrder: Number(gv.sortOrder) || 0
        }
      })
      result.imported++
    } catch (e) {
      result.errors.push(`Globale Variable "${key}" konnte nicht importiert werden: ${e.message}`)
    }
  }

  return result
}

async function importFooters(footers = [], strategy = 'merge') {
  const result = { imported: 0, errors: [] }

  if (strategy === 'replace') {
    try {
      for (const f of listFooters()) deleteFooter(f.id)
    } catch (e) {
      result.errors.push(`Vorhandene Footer konnten nicht gelöscht werden: ${e.message}`)
    }
  }

  for (const f of footers) {
    const name = String(f?.name || '').trim() || 'Footer'
    const code = String(f?.code || '')
    const isActive = Boolean(f?.isActive)
    try {
      if (f?.id) {
        // Preserve IDs from backup when available so page.data.pageFooter remains valid.
        saveFooter({ id: String(f.id), name, code, isActive })
      } else {
        const existing = listFooters().find((x) => x.name === name)
        existing ? saveFooter({ id: existing.id, name, code, isActive }) : saveFooter({ name, code, isActive })
      }
      result.imported++
    } catch (e) {
      result.errors.push(`Footer "${name}" konnte nicht importiert werden: ${e.message}`)
    }
  }

  // Ensure only one active footer.
  try {
    const actives = listFooters()
      .filter((f) => f.isActive)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    if (actives.length > 1) {
      for (const extra of actives.slice(1)) saveFooter({ id: extra.id, isActive: false })
    }
  } catch (e) {
    result.errors.push(`Aktive Footer konnten nicht bereinigt werden: ${e.message}`)
  }

  return result
}

// Importiert Blog-Channels und -Beiträge. Channels werden per slug upserted
// (stabiler Anker für Hand-Imports ohne id); Beiträge referenzieren ihren
// Channel innerhalb des Backups per channelId — da Channels und Beiträge aus
// demselben Export stammen, zeigt post.channelId hier immer auf eine id, die
// auch tatsächlich unter blogChannels auftaucht.
async function importBlog(blogChannels = [], blogPosts = [], strategy = 'merge') {
  const result = { importedChannels: 0, importedPosts: 0, errors: [] }

  if (strategy === 'replace') {
    try {
      await prisma.blogPost.deleteMany({})
      await prisma.blogChannel.deleteMany({})
    } catch (e) {
      result.errors.push(`Vorhandene Blog-Daten konnten nicht gelöscht werden: ${e.message}`)
    }
  }

  const channelIdMap = new Map()
  for (const ch of blogChannels) {
    const slug = String(ch?.slug || '').trim()
    if (!slug) continue
    try {
      const saved = await prisma.blogChannel.upsert({
        where: { slug },
        create: {
          slug,
          name: ch.name || slug,
          description: ch.description || null,
          templateDetailPreview: ch.templateDetailPreview || null,
          templateSimplePreview: ch.templateSimplePreview || null,
          templateArchiveEntry: ch.templateArchiveEntry || null,
          templateReading: ch.templateReading || null,
        },
        update: {
          name: ch.name || slug,
          description: ch.description || null,
          templateDetailPreview: ch.templateDetailPreview || null,
          templateSimplePreview: ch.templateSimplePreview || null,
          templateArchiveEntry: ch.templateArchiveEntry || null,
          templateReading: ch.templateReading || null,
        },
      })
      if (ch.id) channelIdMap.set(String(ch.id), saved.id)
      result.importedChannels++
    } catch (e) {
      result.errors.push(`Blog-Channel "${slug}": ${e.message}`)
    }
  }

  for (const post of blogPosts) {
    const slug = String(post?.slug || '').trim()
    if (!slug) continue
    const channelId = channelIdMap.get(String(post?.channelId))
    if (!channelId) {
      result.errors.push(`Blog-Beitrag "${slug}" übersprungen: zugehöriger Channel nicht im Backup gefunden`)
      continue
    }
    try {
      await prisma.blogPost.upsert({
        where: { channelId_slug: { channelId, slug } },
        create: {
          channelId,
          slug,
          title: post.title || slug,
          excerpt: post.excerpt || null,
          body: post.body || null,
          coverImage: post.coverImage || null,
          author: post.author || null,
          status: post.status || 'DRAFT',
          publishAt: post.publishAt ? new Date(post.publishAt) : null,
          publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
          templateData: post.templateData || null,
        },
        update: {
          title: post.title || slug,
          excerpt: post.excerpt || null,
          body: post.body || null,
          coverImage: post.coverImage || null,
          author: post.author || null,
          status: post.status || 'DRAFT',
          publishAt: post.publishAt ? new Date(post.publishAt) : null,
          publishedAt: post.publishedAt ? new Date(post.publishedAt) : null,
          templateData: post.templateData || null,
        },
      })
      result.importedPosts++
    } catch (e) {
      result.errors.push(`Blog-Beitrag "${slug}": ${e.message}`)
    }
  }

  return result
}

async function importMaintenance(maintenance = {}) {
  const result = { imported: 0, errors: [] }
  for (const [key, value] of Object.entries(maintenance || {})) {
    const match = key.match(/^(maintenance_(?:404|503|no_homepage|loading))_(html|css|js)$/)
    if (!match) continue
    const page = Object.keys(MAINTENANCE_PAGES).find((p) => MAINTENANCE_PAGES[p] === match[1])
    if (!page) continue
    try {
      saveMaintenanceField(page, match[2], value)
      result.imported++
    } catch (e) {
      result.errors.push(`Maintenance-Seite "${key}" konnte nicht importiert werden: ${e.message}`)
    }
  }
  return result
}

async function reconcilePageNavReferences(fallbackMainId = null) {
  const result = { fixed: 0, errors: [] }
  try {
    const navs = listNavigations().filter((n) => n.type === 'MAIN' || n.type === 'PAGE')
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

function importUploadedFiles(uploadedFiles = [], strategy = 'merge') {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
  const result = { imported: 0, errors: [] }
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

  if (strategy === 'replace') {
    const walkDelete = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const e of entries) {
          const abs = path.join(dir, e.name)
          if (e.isDirectory()) walkDelete(abs)
          else fs.unlinkSync(abs)
        }
      } catch (e) {
        result.errors.push(`Vorhandene Uploads konnten nicht vollständig gelöscht werden: ${e.message}`)
      }
    }
    walkDelete(uploadsDir)
  }

  for (const item of uploadedFiles) {
    const rel = sanitizeUploadRelativePath(item?.path)
    if (!rel) {
      result.errors.push('Ungültiger Upload-Dateipfad übersprungen')
      continue
    }

    const abs = path.join(uploadsDir, rel)
    if (!path.resolve(abs).startsWith(path.resolve(uploadsDir))) {
      result.errors.push(`Unsicherer Upload-Dateipfad übersprungen: ${rel}`)
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
      result.errors.push(`Upload-Datei "${rel}" konnte nicht geschrieben werden: ${e.message}`)
    }
  }

  return result
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
    const backup = body.metadata ? body : { templates: body.templates || [], snippets: body.snippets || [], pages: body.pages || [], blogChannels: body.blogChannels || [], blogPosts: body.blogPosts || [], css: body.css || [], navigations: body.navigations || [], globalVariables: body.globalVariables || [], footers: body.footers || [], maintenance: body.maintenance || {}, uploadFonts: body.uploadFonts || [], uploadedFiles: body.uploadedFiles || [] }

    const templates = Array.isArray(backup.templates) ? backup.templates : []
    const snippets = Array.isArray(backup.snippets) ? backup.snippets : []
    const pages = Array.isArray(backup.pages) ? backup.pages : []
    const blogChannels = Array.isArray(backup.blogChannels) ? backup.blogChannels : []
    const blogPosts = Array.isArray(backup.blogPosts) ? backup.blogPosts : []
    const css = Array.isArray(backup.css) ? backup.css : []
    const navigations = Array.isArray(backup.navigations) ? backup.navigations : []
    const globalVariables = Array.isArray(backup.globalVariables) ? backup.globalVariables : []
    const footers = Array.isArray(backup.footers) ? backup.footers : []
    const maintenance = (backup.maintenance && typeof backup.maintenance === 'object') ? backup.maintenance : {}
    const uploadFonts = Array.isArray(backup.uploadFonts) ? backup.uploadFonts : []
    const uploadedFiles = Array.isArray(backup.uploadedFiles) ? backup.uploadedFiles : []
    const cssConfig = backup.cssConfig || null
    const fontsConfig = backup.fontsConfig || null

    // Backups now let the admin pick exactly which categories to include (see
    // lib/backupCategories.js) — e.g. a backup with "Seiten" unchecked has
    // pages: []. Without this, a "replace" restore from that file would read
    // "no pages in the backup" as "delete every existing page", silently
    // destroying data the backup never claimed to touch. `filesIncluded` is
    // the export's own truthful list of what it actually bundled; a category
    // missing from it is forced to "merge" (i.e. a no-op against an empty
    // array) regardless of the strategy the user picked. Old exports/
    // hand-built JSON without this field fall back to today's behavior
    // (every category follows `strategy`).
    const filesIncluded = Array.isArray(backup?.metadata?.filesIncluded) ? new Set(backup.metadata.filesIncluded) : null
    const strategyFor = (category) => (!filesIncluded || filesIncluded.has(category)) ? strategy : 'merge'
    const templatesStrategy = strategyFor('templates')
    const pagesStrategy = strategyFor('pages')
    const snippetsStrategy = strategyFor('snippets')
    const blogStrategy = strategyFor('blog')

    let importStats = { templates: 0, snippets: 0, pages: 0, blogChannels: 0, blogPosts: 0, css: 0, navigations: 0, globalVariables: 0, footers: 0, maintenance: 0, uploadFonts: 0, uploadedFiles: 0, fixedPageNavRefs: 0, errors: [] }

    // Handle replace strategy for database records
    if (strategy === 'replace') {
      try {
        if (templatesStrategy === 'replace') {
          for (const t of listTemplates()) deleteTemplateByName(t.name)
        }
        if (snippetsStrategy === 'replace') {
          await prisma.snippet.deleteMany({})
        }
        if (pagesStrategy === 'replace') {
          await prisma.page.deleteMany({})
        }
      } catch (e) {
        console.warn('Failed to delete existing records in replace mode:', e.message)
      }
    }

    // Import templates (file-based, not DB rows — see lib/templateStore.js)
    for (const t of templates) {
      if (!t.name) continue
      try {
        saveTemplate({
          name: t.name,
          code: t.code || '',
          type: t.type || 'BLOCK',
          blogRole: t.blogRole || null,
          masterTemplateName: t.masterTemplateName || null,
          category: t.category || null
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

    // Import blog channels & posts
    try {
      const blogResult = await importBlog(blogChannels, blogPosts, blogStrategy)
      importStats.blogChannels = blogResult.importedChannels
      importStats.blogPosts = blogResult.importedPosts
      if (blogResult.errors.length > 0) importStats.errors.push(...blogResult.errors)
    } catch (e) {
      importStats.errors.push(`Blog-Import fehlgeschlagen: ${e.message}`)
    }

    // Import CSS files
    try {
      const cssResult = await importCSSFiles(css, strategyFor('css'))
      importStats.css = cssResult.imported
      if (cssResult.errors.length > 0) {
        importStats.errors.push(...cssResult.errors)
      }
    } catch (e) {
      importStats.errors.push(`CSS import failed: ${e.message}`)
    }

    // Import navigations
    try {
      const navResult = await importNavigations(navigations, strategyFor('navigations'))
      importStats.navigations = navResult.imported
      if (navResult.errors.length > 0) importStats.errors.push(...navResult.errors)

      const reconcileResult = await reconcilePageNavReferences(navResult.activeMainId)
      importStats.fixedPageNavRefs = reconcileResult.fixed
      if (reconcileResult.errors.length > 0) importStats.errors.push(...reconcileResult.errors)
    } catch (e) {
      importStats.errors.push(`Navigations import failed: ${e.message}`)
    }

    // Import global variables
    try {
      const globalVarResult = await importGlobalVariables(globalVariables, strategyFor('globalVariables'))
      importStats.globalVariables = globalVarResult.imported
      if (globalVarResult.errors.length > 0) importStats.errors.push(...globalVarResult.errors)
    } catch (e) {
      importStats.errors.push(`Globale Variablen import failed: ${e.message}`)
    }

    // Import footers
    try {
      const footerResult = await importFooters(footers, strategyFor('footers'))
      importStats.footers = footerResult.imported
      if (footerResult.errors.length > 0) importStats.errors.push(...footerResult.errors)
    } catch (e) {
      importStats.errors.push(`Footer import failed: ${e.message}`)
    }

    // Import maintenance pages (404/503/no-homepage/loading)
    try {
      const maintenanceResult = await importMaintenance(maintenance)
      importStats.maintenance = maintenanceResult.imported
      if (maintenanceResult.errors.length > 0) importStats.errors.push(...maintenanceResult.errors)
    } catch (e) {
      importStats.errors.push(`Maintenance import failed: ${e.message}`)
    }

    // Restore uploaded font files so @font-face URLs keep working after restore
    try {
      const uploadFontResult = importUploadFonts(uploadFonts, strategyFor('uploadFonts'))
      importStats.uploadFonts = uploadFontResult.imported
      if (uploadFontResult.errors.length > 0) importStats.errors.push(...uploadFontResult.errors)
    } catch (e) {
      importStats.errors.push(`Upload-Fonts import failed: ${e.message}`)
    }

    try {
      const uploadFilesResult = importUploadedFiles(uploadedFiles, strategyFor('uploadedFiles'))
      importStats.uploadedFiles = uploadFilesResult.imported
      if (uploadFilesResult.errors.length > 0) importStats.errors.push(...uploadFilesResult.errors)
    } catch (e) {
      importStats.errors.push(`Upload-Dateien import failed: ${e.message}`)
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
      message: `Import completed: ${importStats.templates} templates, ${importStats.snippets} snippets, ${importStats.pages} pages, ${importStats.blogChannels} blog channels, ${importStats.blogPosts} blog posts, ${importStats.css} CSS files, ${importStats.navigations} navigations, ${importStats.globalVariables} global variables, ${importStats.footers} footers, ${importStats.maintenance} maintenance pages, ${importStats.uploadFonts} upload fonts, ${importStats.uploadedFiles} upload files${importStats.fixedPageNavRefs > 0 ? `, ${importStats.fixedPageNavRefs} fixed page navigation refs` : ''}${importStats.errors.length > 0 ? ` (${importStats.errors.length} errors)` : ''}`
    })
  } catch (e) {
    console.error('[/api/admin/import] Error:', e.message, e.stack)
    res.status(500).json({ error: 'Import failed', details: e.message })
  }
}
