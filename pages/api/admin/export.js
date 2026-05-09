import { prisma } from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'
import { renderPage, buildNavHtml } from '../../../lib/templateEngine'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')
const FONT_EXTS = new Set(['.ttf', '.woff', '.woff2', '.otf', '.eot'])
const STATIC_EXPORT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.avif', '.mp4', '.webm', '.pdf', '.txt'])

function safeZipPath(input) {
  return String(input || '').replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter(Boolean).map(part => part.replace(/[^A-Za-z0-9._-]/g, '_')).join('/')
}

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

function normalizePageNode(node) {
  if (!node || typeof node !== 'object') return null
  const next = { ...node }
  next.children = Array.isArray(node.children) ? node.children.map(normalizePageNode).filter(Boolean) : []
  return next
}

function isPublicPage(node) {
  if (!node || typeof node !== 'object') return false
  if (!(node.status === 'PUBLISHED' || node.isHomepage === true)) return false
  const accessGroups = Array.isArray(node.accessGroups) ? node.accessGroups : []
  return accessGroups.length === 0
}

function buildPublicTree(nodes) {
  const out = []
  for (const raw of Array.isArray(nodes) ? nodes : []) {
    const node = normalizePageNode(raw)
    if (!node) continue
    node.children = buildPublicTree(node.children || [])
    if (isPublicPage(node)) out.push(node)
  }
  return out
}

function createRouteEntries(nodes, parentSegments = [], out = []) {
  for (const node of nodes || []) {
    const slug = String(node.slug || '').trim()
    const nextSegments = slug ? [...parentSegments, slug] : [...parentSegments]
    const routePath = nextSegments.length === 0 ? '/' : `/${nextSegments.join('/')}`
    out.push({ routePath, page: node, segments: nextSegments })
    if (node.isHomepage === true && routePath !== '/') {
      out.push({ routePath: '/', page: node, segments: [] })
    }
    createRouteEntries(node.children || [], nextSegments, out)
  }
  return out
}

function collectTemplateNames(blocks, bucket) {
  if (!Array.isArray(blocks)) return
  for (const block of blocks) {
    const tname = block && (block.template || block.type)
    if (tname) bucket.add(String(tname))
    if (block && Array.isArray(block.children)) collectTemplateNames(block.children, bucket)
  }
}

function buildNestedPages(nodes, parentPath = '') {
  return (nodes || [])
    .map((n) => {
      const slug = parentPath ? `${parentPath}/${n.slug}` : String(n.slug || '')
      const children = buildNestedPages(n.children || [], slug)
      return { slug, title: n.title, hasChildren: children.length > 0, children }
    })
}

function buildNavigationsForPage(page, allPagesTree, activeNavigations, allNavigationsById, currentPath) {
  const nestedPages = buildNestedPages(allPagesTree)
  const anchors = Array.isArray(page?.data?.anchors) ? page.data.anchors : []
  const navigations = {}

  for (const nav of activeNavigations) {
    const key = String(nav.type || '').toLowerCase()
    const data = key === 'page' ? { anchors } : { pages: nestedPages }
    navigations[key] = { code: nav.code, data }
  }

  if (page?.data?.pageNav && allNavigationsById[page.data.pageNav]?.code) {
    navigations.main = {
      code: allNavigationsById[page.data.pageNav].code,
      data: { pages: nestedPages }
    }
  }

  navigations.auto = { code: buildNavHtml(allPagesTree, currentPath), data: {} }
  return navigations
}

function collectReferencedAssetsFromHtml(html) {
  const assets = new Set()
  const source = String(html || '')
  const regex = /(src|href)=(["'])([^"']+)\2/gi
  let match
  while ((match = regex.exec(source))) {
    const value = String(match[3] || '')
    if (!value || /^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('#')) continue
    if (value.startsWith('/')) assets.add(value)
  }
  return Array.from(assets)
}

function collectReferencedAssetsFromCss(cssText) {
  const assets = new Set()
  const source = String(cssText || '')
  const regex = /url\((['"]?)([^'")]+)\1\)/gi
  let match
  while ((match = regex.exec(source))) {
    const value = String(match[2] || '')
    if (!value || /^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('mailto:') || value.startsWith('#')) continue
    if (value.startsWith('/')) assets.add(value)
  }
  return Array.from(assets)
}

async function buildStaticExportZip({ pages, templates, navigations, cssFiles, uploadFonts, cssConfig, fontsConfig, meta }) {
  const zip = new JSZip()
  const publicFolder = zip.folder('site')
  console.log('[admin/export] static zip phase', {
    phase: 'prepare',
    pageCount: Array.isArray(pages) ? pages.length : 0,
    templateCount: Array.isArray(templates) ? templates.length : 0,
    cssCount: Array.isArray(cssFiles) ? cssFiles.length : 0,
  })

  const templateMap = {}
  for (const tpl of templates) {
    if (tpl?.name) templateMap[String(tpl.name)] = String(tpl.code || '')
  }

  const allNavigationsById = {}
  for (const nav of navigations) allNavigationsById[nav.id] = nav
  const activeNavigations = navigations.filter((n) => n.isActive === true)
  const publicTree = buildPublicTree(pages)
  const routeEntries = createRouteEntries(publicTree)
    .filter((entry, index, arr) => arr.findIndex((x) => x.routePath === entry.routePath) === index)
  console.log('[admin/export] static zip phase', {
    phase: 'routes-built',
    routeCount: routeEntries.length,
    publicTreeCount: publicTree.length,
  })

  const copiedAssets = new Set()
  const copyAssetIfExists = (publicPath) => {
    const rel = String(publicPath || '').replace(/^\/+/, '')
    if (!rel || copiedAssets.has(rel)) return null
    const abs = path.join(process.cwd(), 'public', rel)
    if (!abs.startsWith(path.join(process.cwd(), 'public'))) return null
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return null
    const ext = path.extname(rel).toLowerCase()
    if (!STATIC_EXPORT_EXTS.has(ext) && !rel.startsWith('uploads/') && !rel.startsWith('extern_css/')) return null
    copiedAssets.add(rel)
    return { rel, abs }
  }

  for (const cssFile of cssFiles) {
    publicFolder.file(`extern_css/${safeZipPath(cssFile.filename)}`, cssFile.content || '')
    for (const assetPath of collectReferencedAssetsFromCss(cssFile.content)) {
      const rel = assetPath.replace(/^\/+/, '')
      const asset = copyAssetIfExists(rel)
      if (!asset) continue
      try {
        const content = fs.readFileSync(asset.abs)
        publicFolder.file(asset.rel, content)
      } catch (_e) {}
    }
  }

  for (const font of uploadFonts) {
    const rel = safeZipPath(font.path || '')
    if (!rel) continue
    publicFolder.file(rel, Buffer.from(String(font.content || ''), 'base64'))
  }

  for (const rootAsset of ['favicon.ico', 'robots.txt', 'manifest.json']) {
    const abs = path.join(process.cwd(), 'public', rootAsset)
    if (fs.existsSync(abs)) {
      try {
        publicFolder.file(rootAsset, fs.readFileSync(abs))
      } catch (_e) {}
    }
  }

  for (const entry of routeEntries) {
    try {
      console.log('[admin/export] static zip route', {
        routePath: entry.routePath,
        pageId: entry.page?.id || null,
      })
      const names = new Set()
      collectTemplateNames(entry.page.blocks, names)
      if (entry.page.template) names.add(String(entry.page.template))

      const blockTemplates = {}
      for (const name of names) {
        if (templateMap[name] !== undefined) blockTemplates[name] = templateMap[name]
      }

      const navigationsForPage = buildNavigationsForPage(entry.page, publicTree, activeNavigations, allNavigationsById, entry.segments.join('/'))
      const html = renderPage(entry.page, blockTemplates, { isChild: entry.segments.length > 1 }, navigationsForPage)
      const routeFolder = entry.routePath === '/' ? publicFolder : publicFolder.folder(safeZipPath(entry.routePath))
      routeFolder.file('index.html', String(html || ''))

      for (const assetPath of collectReferencedAssetsFromHtml(html)) {
        const rel = assetPath.replace(/^\/+/, '')
        const asset = copyAssetIfExists(rel)
        if (!asset) continue
        try {
          const content = fs.readFileSync(asset.abs)
          publicFolder.file(asset.rel, content)
        } catch (_e) {}
      }
    } catch (e) {
      console.warn('[export] static route skipped', {
        routePath: entry.routePath,
        error: e?.message || String(e)
      })
    }
  }

  publicFolder.file('404.html', '<!doctype html><html><head><meta charset="utf-8"><title>404</title></head><body><h1>Seite nicht gefunden</h1></body></html>')
  publicFolder.file('__export.json', JSON.stringify(meta, null, 2))
  console.log('[admin/export] static zip phase', {
    phase: 'metadata-written',
    assetsCopied: copiedAssets.size,
  })

  if (cssConfig) publicFolder.file('css-config.json', JSON.stringify(cssConfig, null, 2))
  if (fontsConfig) publicFolder.file('fonts-config.json', JSON.stringify(fontsConfig, null, 2))

  return zip
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

function loadUploadFiles() {
  const files = []
  if (!fs.existsSync(UPLOADS_DIR)) return files

  const walk = (dir, relBase = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(abs, rel)
        continue
      }
      try {
        const content = fs.readFileSync(abs)
        files.push({
          path: rel,
          encoding: 'base64',
          content: content.toString('base64')
        })
      } catch (e) {
        console.warn(`Failed to read upload file ${rel}:`, e.message)
      }
    }
  }

  walk(UPLOADS_DIR)
  return files
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).end()

    const auth = await requireAuth(req, res, ['ADMIN'])
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

    const wantZip = req.query.format === 'zip'
    const wantTransferZip = req.query.format === 'transfer-zip' || req.query.format === 'project-zip'
    const wantStaticSite = req.query.format === 'static-site'
    const wantCss = req.query.format === 'css'

    console.log('[admin/export] request', {
      format: req.query.format || 'json',
      wantZip,
      wantTransferZip,
      wantStaticSite,
      wantCss,
      userId: auth?.user?.id || null,
    })

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

    const shouldBuildProjectTransfer = wantTransferZip || wantZip
    const uploadFonts = shouldBuildProjectTransfer ? loadUploadFonts() : []
    const uploadedFiles = shouldBuildProjectTransfer ? loadUploadFiles() : []

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

    const exportMetadata = {
      version: '1.2',
      exportedAt: now.toISOString(),
      exportedDate: now.toLocaleDateString('de-DE'),
      exportedTime: now.toLocaleTimeString('de-DE'),
      exportType: wantStaticSite ? 'static-site' : (wantTransferZip || wantZip ? 'project-transfer' : 'json'),
      filesIncluded: ['templates', 'snippets', 'pages', 'css', 'navigations', 'uploadFonts', 'uploadedFiles', 'cssConfig', 'fontsConfig'],
      itemCounts: {
        templates: templates.length,
        snippets: mappedSnippets.length,
        pages: pages.length,
        cssFiles: css.length,
        navigations: navigations.length,
        uploadFonts: uploadFonts.length,
        uploadedFiles: uploadedFiles.length,
        cssConfig: cssConfig ? 1 : 0,
        fontsConfig: fontsConfig ? 1 : 0
      }
    }

    if (wantTransferZip || wantZip) {
      const zip = new JSZip()
      const backup = {
        metadata: exportMetadata,
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

      // Full JSON backup as manifest of the transfer package
      zip.file(`manifest/${baseName}.json`, json)

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

      const uploadFilesFolder = zip.folder('uploads')
      for (const f of uploadedFiles) {
        const safePath = safeZipPath(f.path || '')
        if (!safePath) continue
        try {
          const buf = Buffer.from(String(f.content || ''), 'base64')
          uploadFilesFolder.file(safePath, buf)
        } catch (e) {
          console.warn(`Failed to add upload file ${safePath} to zip:`, e.message)
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

      zip.file('README.txt', 'Temgine project transfer package\n\nContains the data needed to move a project between Temgine instances.')
      console.log('[admin/export] building transfer zip', {
        baseName,
        templateCount: templates.length,
        snippetCount: snippets.length,
        pageCount: pages.length,
        cssCount: css.length,
        navigationCount: navigations.length,
        uploadFontCount: uploadFonts.length,
        uploadedFileCount: uploadedFiles.length,
      })
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
      console.log('[admin/export] transfer zip ready', {
        baseName,
        bytes: zipBuffer.length,
      })
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}-project-transfer.zip"`)
      res.setHeader('Content-Length', zipBuffer.length)
      return res.status(200).send(zipBuffer)
    }

    if (wantStaticSite) {
      console.log('[admin/export] building static site zip', {
        baseName,
        pageCount: pages.length,
        templateCount: templates.length,
        cssCount: css.length,
        navigationCount: navigations.length,
        uploadFontCount: uploadFonts.length,
        uploadedFileCount: uploadedFiles.length,
      })
      const zip = await buildStaticExportZip({
        pages,
        templates,
        navigations,
        cssFiles: css,
        uploadFonts,
        cssConfig,
        fontsConfig,
        meta: exportMetadata,
      })
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
      console.log('[admin/export] static site zip ready', {
        baseName,
        bytes: zipBuffer.length,
      })
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}-static-site.zip"`)
      res.setHeader('Content-Length', zipBuffer.length)
      return res.status(200).send(zipBuffer)
    }

    const backup = {
      metadata: exportMetadata,
      templates,
      snippets: mappedSnippets,
      pages,
      css,
      navigations,
      uploadFonts,
      uploadedFiles,
      cssConfig: cssConfig || null,
      fontsConfig: fontsConfig || null
    }

    const json = JSON.stringify(backup, null, 2)
    const fileSize = Buffer.byteLength(json, 'utf-8')

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.json"`)
    res.setHeader('X-Backup-Size', fileSize)
    res.status(200).send(json)
  } catch (e) {
    console.error('[/api/admin/export] Error:', e.message, e.stack)
    res.status(500).json({ error: 'Export failed', details: e.message })
  }
}
