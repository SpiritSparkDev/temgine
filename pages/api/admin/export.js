import { prisma } from '../../../lib/prisma'
import fs from 'fs'
import path from 'path'

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
  const navDir = path.join(process.cwd(), 'data', 'navigations')
  const navigations = []
  
  if (!fs.existsSync(navDir)) return navigations
  
  try {
    const files = fs.readdirSync(navDir).filter(f => f.endsWith('.html'))
    for (const filename of files) {
      const filePath = path.join(navDir, filename)
      try {
        const code = fs.readFileSync(filePath, 'utf-8')
        const name = filename.replace('.html', '')
        navigations.push({ name, filename, code })
      } catch (e) {
        console.warn(`Failed to read navigation file ${filename}:`, e.message)
      }
    }
  } catch (e) {
    console.warn('Failed to load navigations:', e.message)
  }
  
  return navigations
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).end()

    // Fetch all data in parallel
    const [pages, templates, snippets, css, navigations] = await Promise.all([
      prisma.page.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.template.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.snippet.findMany({ orderBy: { createdAt: 'asc' } }),
      loadCSSFiles(),
      loadNavigations()
    ])

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

    const now = new Date()
    const backupMetadata = {
      version: '1.1',
      exportedAt: now.toISOString(),
      exportedDate: now.toLocaleDateString('de-DE'),
      exportedTime: now.toLocaleTimeString('de-DE'),
      filesIncluded: ['templates', 'snippets', 'pages', 'css', 'navigations', 'cssConfig', 'fontsConfig'],
      itemCounts: {
        templates: templates.length,
        snippets: mappedSnippets.length,
        pages: pages.length,
        cssFiles: css.length,
        navigations: navigations.length,
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
      cssConfig: cssConfig || null,
      fontsConfig: fontsConfig || null
    }

    const json = JSON.stringify(backup, null, 2)
    const fileSize = Buffer.byteLength(json, 'utf-8')
    
    // Generate filename with timestamp
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="temgine-backup-${dateStr}-${timeStr}.json"`)
    res.setHeader('X-Backup-Size', fileSize)
    res.status(200).send(json)
  } catch (e) {
    console.error('[/api/admin/export] Error:', e.message, e.stack)
    res.status(500).json({ error: 'Export failed', details: e.message })
  }
}
