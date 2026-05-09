import { prisma } from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'
import { renderPage, buildNavHtml } from '../../../lib/templateEngine'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')
const FONT_EXTS = new Set(['.ttf', '.woff', '.woff2', '.otf', '.eot'])
const STATIC_EXPORT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.avif', '.mp4', '.webm', '.pdf', '.txt', '.woff', '.woff2', '.ttf', '.otf', '.eot'])

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
  const regex = /(src|href|poster|content)=(['"])([^'"]+)\2/gi
  let match
  while ((match = regex.exec(source))) {
    const value = String(match[3] || '')
    const normalized = normalizeAssetPath(value)
    if (normalized && isStaticAssetCandidate(normalized)) assets.add(`/${normalized}`)
  }

  const cssUrlRegex = /url\((['"]?)([^'")]+)\1\)/gi
  while ((match = cssUrlRegex.exec(source))) {
    const normalized = normalizeAssetPath(String(match[2] || ''))
    if (normalized && isStaticAssetCandidate(normalized)) assets.add(`/${normalized}`)
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

function stripUrlSuffix(value) {
  const input = String(value || '')
  const [pathOnly] = input.split(/[?#]/)
  return pathOnly
}

function normalizeAssetPath(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^data:/i.test(raw) || /^mailto:/i.test(raw) || raw.startsWith('#')) return null

  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw)
      const p = stripUrlSuffix(u.pathname || '').replace(/^\/+/, '')
      return p ? decodeURIComponent(p) : null
    }
  } catch (_e) {}

  if (raw.startsWith('/')) {
    const p = stripUrlSuffix(raw).replace(/^\/+/, '')
    return p ? decodeURIComponent(p) : null
  }

  const p = stripUrlSuffix(raw)
  return p ? decodeURIComponent(p) : null
}

function isStaticAssetCandidate(relPath) {
  const rel = String(relPath || '').replace(/^\/+/, '').trim()
  if (!rel || rel === '&') return false

  const lower = rel.toLowerCase()
  const ext = path.extname(lower)

  if (lower.startsWith('uploads/') || lower.startsWith('assets/') || lower.startsWith('favicon/')) return true
  if (lower.startsWith('extern_css/')) return true

  if (ext === '.html' || ext === '.htm') return false
  if (ext === '.css' || ext === '.js') return false
  if (!ext) return false

  return STATIC_EXPORT_EXTS.has(ext)
}

function isMediaAssetPath(relPath) {
  const lower = String(relPath || '').toLowerCase()
  const ext = path.extname(lower)
  if (!ext) return false
  if (ext === '.html' || ext === '.htm' || ext === '.css' || ext === '.js' || ext === '.json') return false
  return STATIC_EXPORT_EXTS.has(ext)
}

function buildStaticFontsCss(uploadFonts = [], fontsConfig = null) {
  const disabled = new Set(Array.isArray(fontsConfig?.disabled) ? fontsConfig.disabled : [])
  const formatByExt = {
    '.woff2': 'woff2',
    '.woff': 'woff',
    '.ttf': 'truetype',
    '.otf': 'opentype',
    '.eot': 'embedded-opentype',
  }

  const rules = []
  for (const f of uploadFonts || []) {
    const rel = String(f?.path || '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!rel) continue
    const id = `uploads/${rel}`
    if (disabled.has(id)) continue
    const ext = path.extname(rel).toLowerCase()
    const fmt = formatByExt[ext]
    if (!fmt) continue
    const base = path.basename(rel).replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
    rules.push(`@font-face {\n  font-family: "${base}";\n  src: url("uploads/${rel}") format("${fmt}");\n  font-display: swap;\n}`)
  }
  return rules.join('\n\n')
}

function injectCssLinks(html, cssFiles = [], extraCssFiles = []) {
  const links = [...(cssFiles || []), ...(extraCssFiles || [])]
    .map((f) => `<link rel="stylesheet" href="${safeZipPath(f.filename)}">`)
    .join('\n')
  if (!links) return String(html || '')

  const source = String(html || '')
  if (/<\/head>/i.test(source)) {
    return source.replace(/<\/head>/i, `${links}\n</head>`)
  }
  if (/<body[^>]*>/i.test(source)) {
    return source.replace(/<body([^>]*)>/i, `<body$1>${links}`)
  }
  return `${links}\n${source}`
}

function toFlatHtmlFilename(routePath) {
  if (!routePath || routePath === '/') return 'index.html'
  const slug = String(routePath)
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9._-]/g, '-'))
    .join('-')
  return `${slug || 'page'}.html`
}

function rewriteInternalLinksToFlatHtml(html, routeToFileMap) {
  const source = String(html || '')
  return source.replace(/href=(['"])(\/[^'"]*)(\1)/gi, (_m, quote, hrefPath, closingQuote) => {
    const full = String(hrefPath || '')
    const [pathPart, suffix = ''] = full.split(/(?=[?#])/)
    const normalized = pathPart.length > 1 ? pathPart.replace(/\/+$/, '') : pathPart
    const target = routeToFileMap[normalized] || routeToFileMap[pathPart] || (normalized === '/' ? 'index.html' : null)
    if (!target) return `href=${quote}${hrefPath}${closingQuote}`
    return `href=${quote}${target}${suffix}${closingQuote}`
  })
}

function rewriteCssLinksToRoot(html) {
  return String(html || '').replace(/href=(['"])\/extern_css\/([^'"]+)(\1)/gi, (_m, quote, filename, closingQuote) => {
    return `href=${quote}${safeZipPath(filename)}${closingQuote}`
  })
}

function rewriteAbsoluteAssetLinks(html) {
  const source = String(html || '')
  let result = source.replace(/(src|href|poster|content)=(['"])(\/[^'"]+)(\2)/gi, (_m, attr, quote, rawPath, closingQuote) => {
    const full = String(rawPath || '')
    const [pathPart, suffix = ''] = full.split(/(?=[?#])/)
    if (pathPart.startsWith('/api/') || pathPart.startsWith('/_next/')) {
      return `${attr}=${quote}${rawPath}${closingQuote}`
    }
    const relative = pathPart.replace(/^\/+/, '')
    return `${attr}=${quote}${relative}${suffix}${closingQuote}`
  })

  result = result.replace(/(src|href|poster|content)=(['"])(https?:\/\/[^/'"]+\/(?:[^'"]*))(\2)/gi, (_m, attr, quote, rawUrl, closingQuote) => {
    try {
      const u = new URL(rawUrl)
      const p = u.pathname || ''
      if (p.startsWith('/api/') || p.startsWith('/_next/')) return `${attr}=${quote}${rawUrl}${closingQuote}`
      const rel = p.replace(/^\/+/, '')
      const suffix = `${u.search || ''}${u.hash || ''}`
      return `${attr}=${quote}${rel}${suffix}${closingQuote}`
    } catch (_e) {
      return `${attr}=${quote}${rawUrl}${closingQuote}`
    }
  })

  result = result.replace(/srcset=(['"])([^'"]+)(\1)/gi, (_m, quote, rawSrcset, closingQuote) => {
    const converted = String(rawSrcset || '')
      .split(',')
      .map((part) => {
        const trimmed = part.trim()
        if (!trimmed) return trimmed
        const tokens = trimmed.split(/\s+/)
        const src = tokens[0] || ''
        let nextSrc = src
        try {
          if (/^https?:\/\//i.test(src)) {
            const u = new URL(src)
            if (!u.pathname.startsWith('/api/') && !u.pathname.startsWith('/_next/')) {
              nextSrc = `${u.pathname.replace(/^\/+/, '')}${u.search || ''}${u.hash || ''}`
            }
          } else if (src.startsWith('/')) {
            nextSrc = src.replace(/^\/+/, '')
          }
        } catch (_e) {}
        return [nextSrc, ...tokens.slice(1)].join(' ')
      })
      .join(', ')

    return `srcset=${quote}${converted}${closingQuote}`
  })

  result = result.replace(/url\((['"]?)\/(?!\/)([^'")]+)\1\)/gi, (_m, quote, relPath) => {
    const value = String(relPath || '')
    if (value.startsWith('api/') || value.startsWith('_next/')) return `url(${quote}/${value}${quote})`
    return `url(${quote}${value}${quote})`
  })

  return result
}

function rewriteCssAssetUrlsToRelative(cssText) {
  return String(cssText || '').replace(/url\((['"]?)\/(?!\/)([^'")]+)\1\)/gi, (_m, quote, relPath) => {
    const value = String(relPath || '')
    if (value.startsWith('api/') || value.startsWith('_next/')) {
      return `url(${quote}/${value}${quote})`
    }
    return `url(${quote}${value}${quote})`
  })
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
  const allEntries = createRouteEntries(publicTree)
    .filter((entry, index, arr) => arr.findIndex((x) => x.routePath === entry.routePath) === index)
  const homepageEntry = allEntries.find((e) => e.routePath === '/')
  const routeEntries = allEntries.filter((entry) => {
    if (!homepageEntry?.page?.id) return true
    if (entry.routePath === '/') return true
    return entry.page?.id !== homepageEntry.page.id
  })

  const routeToFileMap = {}
  const usedNames = new Set()
  for (const entry of routeEntries) {
    let filename = toFlatHtmlFilename(entry.routePath)
    if (usedNames.has(filename)) {
      const base = filename.replace(/\.html$/i, '')
      let i = 2
      while (usedNames.has(`${base}-${i}.html`)) i++
      filename = `${base}-${i}.html`
    }
    usedNames.add(filename)
    routeToFileMap[entry.routePath] = filename
  }

  routeToFileMap['/'] = routeToFileMap['/'] || 'index.html'
  console.log('[admin/export] static zip phase', {
    phase: 'routes-built',
    routeCount: routeEntries.length,
    publicTreeCount: publicTree.length,
  })

  const copiedAssets = new Set()
  const missingAssets = new Set()
  const generatedFiles = new Set()
  const exportTrace = []
  const pushTrace = (entry) => {
    const line = `[${new Date().toISOString()}] ${entry}`
    exportTrace.push(line)
    if (exportTrace.length > 5000) exportTrace.shift()
  }
  pushTrace('START static export build')

  const addFallbackMediaFromPublicDir = (publicSubDir) => {
    const root = path.join(process.cwd(), 'public', publicSubDir)
    if (!fs.existsSync(root)) {
      pushTrace(`SKIP fallback-dir-missing dir=${publicSubDir}`)
      return
    }

    let added = 0
    const walk = (dir, relBase = '') => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name
        const abs = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(abs, rel)
          continue
        }
        const zipRel = `${publicSubDir}/${rel}`.replace(/\\/g, '/')
        if (!isMediaAssetPath(zipRel)) continue
        if (copiedAssets.has(zipRel)) continue
        try {
          publicFolder.file(zipRel, fs.readFileSync(abs))
          copiedAssets.add(zipRel)
          added += 1
        } catch (_e) {}
      }
    }

    walk(root)
    pushTrace(`FALLBACK dir=${publicSubDir} added=${added}`)
  }
  const copyAssetIfExists = (publicPath, source = 'unknown') => {
    const rel = normalizeAssetPath(publicPath)
    if (!rel) {
      pushTrace(`SKIP invalid-path source=${source} raw=${String(publicPath || '')}`)
      return null
    }
    if (copiedAssets.has(rel)) {
      pushTrace(`SKIP duplicate source=${source} path=${rel}`)
      return null
    }
    if (generatedFiles.has(rel)) {
      pushTrace(`SKIP generated-file source=${source} path=${rel}`)
      return null
    }
    if (!isStaticAssetCandidate(rel)) {
      pushTrace(`SKIP non-asset source=${source} path=${rel}`)
      return null
    }
    const abs = path.join(process.cwd(), 'public', rel)
    if (!abs.startsWith(path.join(process.cwd(), 'public'))) {
      pushTrace(`SKIP unsafe-path source=${source} path=${rel}`)
      return null
    }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      missingAssets.add(rel)
      pushTrace(`MISS source=${source} path=${rel}`)
      return null
    }
    const ext = path.extname(rel).toLowerCase()
    if (!STATIC_EXPORT_EXTS.has(ext) && !rel.startsWith('uploads/') && !rel.startsWith('extern_css/')) {
      pushTrace(`SKIP ext-filter source=${source} path=${rel}`)
      return null
    }
    copiedAssets.add(rel)
    pushTrace(`ADD source=${source} path=${rel}`)
    return { rel, abs }
  }

  for (const cssFile of cssFiles) {
    const normalizedCss = rewriteCssAssetUrlsToRelative(cssFile.content || '')
    const cssFilename = safeZipPath(cssFile.filename)
    generatedFiles.add(cssFilename)
    publicFolder.file(cssFilename, normalizedCss)
    for (const assetPath of collectReferencedAssetsFromCss(cssFile.content)) {
      const rel = normalizeAssetPath(assetPath)
      const asset = copyAssetIfExists(rel, `css:${cssFile.filename}`)
      if (!asset) continue
      try {
        const content = fs.readFileSync(asset.abs)
        publicFolder.file(asset.rel, content)
        if (copiedAssets.size % 25 === 0) {
          console.log('[admin/export] static asset progress', { copied: copiedAssets.size, missing: missingAssets.size, last: asset.rel })
        }
      } catch (_e) {}
    }
  }
  pushTrace(`CSS phase done files=${cssFiles.length}`)

  for (const font of uploadFonts) {
    const rel = safeZipPath(font.path || '')
    if (!rel) continue
    publicFolder.file(`uploads/${rel}`, Buffer.from(String(font.content || ''), 'base64'))
  }

  const fontsCss = buildStaticFontsCss(uploadFonts, fontsConfig)
  const extraCssFiles = []
  if (fontsCss) {
    generatedFiles.add('temgine-fonts.css')
    publicFolder.file('temgine-fonts.css', fontsCss)
    extraCssFiles.push({ filename: 'temgine-fonts.css' })
    for (const assetPath of collectReferencedAssetsFromCss(fontsCss)) {
      const rel = normalizeAssetPath(assetPath)
      const asset = copyAssetIfExists(rel, 'fonts-css')
      if (!asset) continue
      try {
        const content = fs.readFileSync(asset.abs)
        publicFolder.file(asset.rel, content)
        if (copiedAssets.size % 25 === 0) {
          console.log('[admin/export] static asset progress', { copied: copiedAssets.size, missing: missingAssets.size, last: asset.rel })
        }
      } catch (_e) {}
    }
  }
  pushTrace(`Fonts phase done hasFontsCss=${fontsCss ? 'yes' : 'no'} uploadFonts=${uploadFonts.length}`)

  for (const rootAsset of ['favicon.ico', 'robots.txt', 'manifest.json']) {
    const abs = path.join(process.cwd(), 'public', rootAsset)
    if (fs.existsSync(abs)) {
      try {
        publicFolder.file(rootAsset, fs.readFileSync(abs))
      } catch (_e) {}
    }
  }

  // Deterministic fallback so images are present even if no direct references were detected.
  addFallbackMediaFromPublicDir('uploads')
  addFallbackMediaFromPublicDir('assets')

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
      let html = renderPage(entry.page, blockTemplates, { isChild: entry.segments.length > 1 }, navigationsForPage)
      html = rewriteCssLinksToRoot(html)
      html = injectCssLinks(html, cssFiles, extraCssFiles)
      html = rewriteInternalLinksToFlatHtml(html, routeToFileMap)
      html = rewriteAbsoluteAssetLinks(html)
      const htmlFilename = routeToFileMap[entry.routePath] || 'index.html'
      generatedFiles.add(htmlFilename)
      publicFolder.file(htmlFilename, String(html || ''))

      for (const assetPath of collectReferencedAssetsFromHtml(html)) {
        const rel = normalizeAssetPath(assetPath)
        const asset = copyAssetIfExists(rel, `html:${entry.routePath}`)
        if (!asset) continue
        try {
          const content = fs.readFileSync(asset.abs)
          publicFolder.file(asset.rel, content)
          if (copiedAssets.size % 25 === 0) {
            console.log('[admin/export] static asset progress', { copied: copiedAssets.size, missing: missingAssets.size, last: asset.rel })
          }
        } catch (_e) {}
      }
    } catch (e) {
      console.warn('[export] static route skipped', {
        routePath: entry.routePath,
        error: e?.message || String(e)
      })
    }
  }
  pushTrace(`HTML phase done routes=${routeEntries.length}`)

  publicFolder.file('404.html', '<!doctype html><html><head><meta charset="utf-8"><title>404</title></head><body><h1>Seite nicht gefunden</h1></body></html>')
  publicFolder.file('__export.json', JSON.stringify(meta, null, 2))
  publicFolder.file('asset-manifest.json', JSON.stringify({
    copiedAssets: Array.from(copiedAssets).sort(),
    missingAssets: Array.from(missingAssets).sort(),
    copiedCount: copiedAssets.size,
    missingCount: missingAssets.size,
  }, null, 2))
  pushTrace(`SUMMARY copied=${copiedAssets.size} missing=${missingAssets.size}`)
  publicFolder.file('export-trace.log', exportTrace.join('\n'))
  console.log('[admin/export] static zip phase', {
    phase: 'metadata-written',
    assetsCopied: copiedAssets.size,
    assetsMissing: missingAssets.size,
    traceLines: exportTrace.length,
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
    const shouldBuildStaticSite = wantStaticSite
    const uploadFonts = (shouldBuildProjectTransfer || shouldBuildStaticSite) ? loadUploadFonts() : []
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
      console.log('[admin/export] static zip stream start', { baseName })
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}-static-site.zip"`)

      const zipStream = zip.generateNodeStream({
        streamFiles: true,
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      })

      let streamedBytes = 0
      let lastLoggedMb = 0

      zipStream.on('data', (chunk) => {
        streamedBytes += chunk.length
        const mb = Math.floor(streamedBytes / (1024 * 1024))
        if (mb >= lastLoggedMb + 25) {
          lastLoggedMb = mb
          console.log('[admin/export] static zip stream progress', {
            baseName,
            streamedMB: mb,
          })
        }
      })

      return await new Promise((resolve, reject) => {
        zipStream.on('error', (err) => {
          console.error('[admin/export] static zip stream error', {
            baseName,
            error: err?.message || String(err),
          })
          if (!res.headersSent) {
            res.status(500).json({ error: 'Static ZIP stream failed', details: err?.message || String(err) })
          }
          reject(err)
        })

        res.on('close', () => {
          console.log('[admin/export] static zip stream closed', {
            baseName,
            streamedBytes,
          })
          resolve()
        })

        zipStream.on('end', () => {
          console.log('[admin/export] static zip stream complete', {
            baseName,
            streamedBytes,
          })
          resolve()
        })

        zipStream.pipe(res)
      })
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
