import { prisma } from '../../../lib/prisma'
import { sanitizeRecursive } from '../../../lib/htmlSanitize'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).end()

    const body = req.body || {}
    const pages = Array.isArray(body.pages) ? body.pages : []
    const templates = Array.isArray(body.templates) ? body.templates : []
    const snippets = Array.isArray(body.snippets) ? body.snippets : []

    // Import templates
    for (const t of templates) {
      if (!t.name) continue
      await prisma.template.upsert({ where: { name: t.name }, create: { name: t.name, code: t.code || '' }, update: { code: t.code || '' } })
    }

    // Import snippets (preserve metadata)
    const keys = []
    for (const s of snippets) {
      const label = String(s.label || s.key || '').trim()
      if (!label) continue
      const key = label
      keys.push(key)
      let value = String(s.snippet || '')
      if (s.type || s.handler || s.key) {
        value = JSON.stringify({ key: s.key || '', snippet: s.snippet || '', type: s.type || 'free', handler: s.handler || '' })
      }
      try { value = sanitizeRecursive(value) } catch (e) {}
      await prisma.snippet.upsert({ where: { key }, create: { key, value }, update: { value } })
    }

    // Import pages (simple upsert by slug)
    for (const p of pages) {
      if (!p.slug) continue
      const slug = String(p.slug)
      const data = sanitizeRecursive(p.data || {})
      await prisma.page.upsert({ where: { slug }, create: { slug, title: p.title || slug, blocks: p.blocks || [], data, children: p.children || [] }, update: { title: p.title || slug, blocks: p.blocks || [], data, children: p.children || [] } })
    }

    // Optionally: delete missing snippets? For now, do not remove existing DB entries unless explicitly requested.

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('Import failed', e)
    return res.status(500).json({ error: 'Import failed' })
  }
}
