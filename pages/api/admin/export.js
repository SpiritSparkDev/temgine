import { prisma } from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')
const FONT_EXTS = new Set(['.ttf', '.woff', '.woff2', '.otf', '.eot'])

async function loadCSSFiles() {
  const cssDir = path.join(process.cwd(), 'public', 'extern_css')
  const files = []
  
  if (!fs.existsSync(cssDir)) return files
  
  try {
    // Load .order.json for priority
    const orderPath = path.join(cssDir, '.order.json')
    let order = []
    if (fs.existsSync(orderPath)) {
      try {
        const orderData = JSON.parse(fs.readFileSync(orderPath, 'utf-8'))
        order = orderData.order || []
      } catch (e) {}
    }
    
    // Load all CSS files (excluding .order.json)
    const allFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'))
    const orderedFiles = order.filter(f => allFiles.includes(f))
    const unorderedFiles = allFiles.filter(f => !order.includes(f))
    const sortedFiles = [...orderedFiles, ...unorderedFiles]
    
    for (const filename of sortedFiles) {
      const filePath = path.join(cssDir, filename)
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        files.push({ filename, content })
      } catch (e) {
        console.warn(`Failed to read CSS file ${filename}:`, e.message)
      }
    }
  } catch (e) {
    console.warn('Failed to load CSS files:', e.message)
  }
  
  return files
}

function loadJsonConfig(filename) {
  const filePath = path.join(process.cwd(), 'data', filename)
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (e) {
    console.warn(`Failed to read ${filename}:`, e.message)
  }
  return null
}

async function loadNavigations() {
  try {
    return await prisma.navigation.findMany({
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, type: true, code: true, isActive: true }
    })
  } catch (e) {
    console.warn('Failed to load navigations from database:', e.message)
    return []
  }
}

function scanUploadFonts(dir, relBase = '', out = []) {
  if (!fs.existsSync(dir)) return out
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        scanUploadFonts(abs, rel, out)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (!FONT_EXTS.has(ext)) continue
      out.push({ relPath: rel, absPath: abs })
    }
  } catch (e) {
    console.warn('Failed to scan upload fonts:', e.message)
  }
  return out
}

function loadUploadFonts() {
  const files = []
  if (!fs.existsSync(UPLOADS_DIR)) return files
  const found = scanUploadFonts(UPLOADS_DIR, '', [])
  for (const file of found) {
    try {
      const content = fs.readFileSync(file.absPath)
      files.push({
        path: file.relPath,
        encoding: 'base64',
        content: content.toString('base64')
      })
    } catch (e) {
      console.warn(`Failed to read upload font ${file.relPath}:`, e.message)
    }
  }
  return files
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).end()

    const auth = await requireAuth(req, res, ['ADMIN'])
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

    const wantZip = req.query.format === 'zip'
    const wantCss = req.query.format === 'css'

    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    const baseName = `temgine-backup-${dateStr}-${timeStr}`

    // CSS-only export: merged file of all enabled CSS
    if (wantCss) {
      const css = await loadCSSFiles()
      if (css.length === 0) {
        return res.status(404).json({ error: 'Keine CSS-Dateien vorhanden' })
      }
      const merged = css
        .map(f => `/* ==============================\n   ${f.filename}\n   ============================== */\n\n${f.content || ''}`)
        .join('\n\n')
      res.setHeader('Content-Type', 'text/css; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="temgine-styles-${dateStr}.css"`)
      return res.status(200).send(merged)
    }

    // Fetch all data in parallel
    const [pages, templates, snippets, css, navigations] = await Promise.all([
      prisma.page.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.template.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.snippet.findMany({ orderBy: { createdAt: 'asc' } }),
      loadCSSFiles(),
      loadNavigations()
    ])

    const uploadFonts = loadUploadFonts()

    const cssConfig = loadJsonConfig('css-config.json')
    const fontsConfig = loadJsonConfig('fonts-config.json')

    // Map snippets to their original JSON shape when possible
    const mappedSnippets = snippets.map(s => {
      const raw = s.value || ''
      try {
        const obj = JSON.parse(raw)
        return { label: s.key, key: obj.key || '', snippet: obj.snippet || '', type: obj.type || 'free', handler: obj.handler || '' }
      } catch (e) {
        return { label: s.key, key: '', snippet: raw || '', type: 'free' }
      }
    })

    const backupMetadata = {
      version: '1.2',
      exportedAt: now.toISOString(),
      exportedDate: now.toLocaleDateString('de-DE'),
      exportedTime: now.toLocaleTimeString('de-DE'),
      filesIncluded: ['templates', 'snippets', 'pages', 'css', 'navigations', 'uploadFonts', 'cssConfig', 'fontsConfig'],
      itemCounts: {
        templates: templates.length,
        snippets: mappedSnippets.length,
        pages: pages.length,
        cssFiles: css.length,
        navigations: navigations.length,
        uploadFonts: uploadFonts.length,
        cssConfig: cssConfig ? 1 : 0,
        fontsConfig: fontsConfig ? 1 : 0
      }
    }

    const backup = {
      metadata: backupMetadata,
      templates,
      snippets: mappedSnippets,
      pages,
      css,
      navigations,
      uploadFonts,
      cssConfig: cssConfig || null,
      fontsConfig: fontsConfig || null
    }

    const json = JSON.stringify(backup, null, 2)
    const fileSize = Buffer.byteLength(json, 'utf-8')

    if (wantZip) {
      const zip = new JSZip()

      // Full JSON backup
      zip.file(`${baseName}.json`, json)

      // Templates as individual HTML files
      const tplFolder = zip.folder('templates')
      for (const tpl of templates) {
        const safeName = (tpl.name || `template-${tpl.id}`).replace(/[^\w.-]/g, '_')
        tplFolder.file(`${safeName}.html`, tpl.code || '')
      }

      // Navigations as individual HTML files
      const navFolder = zip.folder('navigations')
      for (const nav of navigations) {
        const safeName = (nav.name || nav.id || 'navigation').replace(/[^\w.-]/g, '_')
        navFolder.file(`${safeName}.json`, JSON.stringify(nav, null, 2))
      }

      // Uploaded fonts (binary) to keep @font-face sources valid after restore
      const uploadFontsFolder = zip.folder('uploads-fonts')
      for (const f of uploadFonts) {
        const safePath = String(f.path || '').replace(/\\/g, '/').replace(/^\/+/, '')
        if (!safePath) continue
        try {
          const buf = Buffer.from(String(f.content || ''), 'base64')
          uploadFontsFolder.file(safePath, buf)
        } catch (e) {
          console.warn(`Failed to add font ${safePath} to zip:`, e.message)
        }
      }

      // CSS files individually + merged
      const cssFolder = zip.folder('css')
      const mergedParts = []
      for (const cssFile of css) {
        cssFolder.file(cssFile.filename, cssFile.content || '')
        mergedParts.push(`/* === ${cssFile.filename} === */\n${cssFile.content || ''}`)
      }
      if (mergedParts.length > 0) {
        cssFolder.file('merged.css', mergedParts.join('\n\n'))
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.zip"`)
      res.setHeader('Content-Length', zipBuffer.length)
      return res.status(200).send(zipBuffer)
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.json"`)
    res.setHeader('X-Backup-Size', fileSize)
    res.status(200).send(json)
  } catch (e) {
    console.error('[/api/admin/export] Error:', e.message, e.stack)
    res.status(500).json({ error: 'Export failed', details: e.message })
  }
}
