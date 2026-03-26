const sanitizeHtml = require('sanitize-html')

/** Generate a stable machine key from a human label.
 *  e.g. "Heading H1" -> "heading-h1", "Blocks" -> "blocks"
 */
function generateKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'snippet'
}

/** System (protected) snippet keys — cannot be deleted */
const SYSTEM_KEYS = new Set(['blocks'])

const SYSTEM_LABELS = new Set(['blocks', 'titel', 'title', 'slug', 'page title', 'page slug', 'author', 'page header', 'header', 'is child'])

function sanitizeHtmlString(html) {
  if (!html || typeof html !== 'string') return ''
  try {
    return sanitizeHtml(String(html), {
      allowedTags: ['p','br','strong','b','em','i','u','a','ul','ol','li','h1','h2','h3','h4','h5','blockquote','pre','code','img','table','thead','tbody','tr','th','td'],
      allowedAttributes: { a: ['href','target','rel'], img: ['src','alt'] },
      allowedSchemes: ['http','https','mailto','data'],
      allowProtocolRelative: false,
      transformTags: {
        'a': (tagName, attribs) => {
          const out = { ...attribs }
          if (!out.rel) out.rel = 'noopener noreferrer'
          return { tagName: 'a', attribs: out }
        }
      }
    })
  } catch (e) {
    console.error('sanitizeHtmlString failed', e)
    return ''
  }
}

module.exports = async function snippetsHandler(req, res, prisma) {
  try {
    if (req.method === 'GET') {
      const snippets = await prisma.snippet.findMany({ orderBy: { createdAt: 'asc' } })
      const out = snippets.map(s => {
        const raw = s.value || ''
        try {
          const obj = JSON.parse(raw)
          const key = obj.key || generateKey(s.key)
          return { label: s.key, key, snippet: obj.snippet || '', type: obj.type || 'free', handler: obj.handler || '' }
        } catch (e) {
          const key = generateKey(s.key)
          return { label: s.key, key, snippet: raw || '', type: 'free' }
        }
      })
      return res.status(200).json(out)
    }

    if (req.method === 'POST') {
      const body = req.body
      if (Array.isArray(body)) {
        const results = []
        const keys = []
        for (const item of body) {
          if (!item.label) continue
          const key = String(item.label)
          keys.push(key)
          const snippetKey = item.key || generateKey(item.label)
          let value = String(item.snippet || '')
          try { value = sanitizeHtmlString(value) } catch (e) { console.warn('Failed to sanitize snippet', e) }
          if (item.type || item.handler || item.key) {
            value = JSON.stringify({ key: snippetKey, snippet: item.snippet || '', type: item.type || 'free', handler: item.handler || '' })
          }
          const up = await prisma.snippet.upsert({ where: { key }, create: { key, value }, update: { value } })
          results.push(up)
        }
        if (keys.length > 0) {
          try { await prisma.snippet.deleteMany({ where: { key: { notIn: keys } } }) } catch (e) {}
        }
        return res.status(200).json(results)
      }

      const label = body.label || body.key
      if (!label) return res.status(400).json({ error: 'Label/Key erforderlich' })
      const key = String(label)
      const snippetKey = body.snippetKey || body.key || generateKey(label)
      const previousLabel = body.previousLabel ? String(body.previousLabel) : ''
      let value = body.snippet || body.value || ''
      try { value = sanitizeHtmlString(String(value)) } catch (e) { console.warn('Failed to sanitize snippet single', e) }
      if (body.type || body.handler || snippetKey) {
        value = JSON.stringify({ key: snippetKey, snippet: body.snippet || '', type: body.type || 'free', handler: body.handler || '' })
      }
      const up = await prisma.snippet.upsert({ where: { key }, create: { key, value }, update: { value } })
      if (previousLabel && previousLabel !== key && !SYSTEM_LABELS.has(previousLabel.trim().toLowerCase())) {
        try { await prisma.snippet.delete({ where: { key: previousLabel } }) } catch (e) {}
      }
      return res.status(200).json(up)
    }

    if (req.method === 'DELETE') {
      const { label, key } = req.body || {}
      const k = label || key
      if (!k) return res.status(400).json({ error: 'Label/Key erforderlich' })
      // Look up the stored snippet to get its system key before deleting
      try {
        const existing = await prisma.snippet.findUnique({ where: { key: String(k) } })
        if (existing) {
          let snippetKey = generateKey(String(k))
          try { const obj = JSON.parse(existing.value || '{}'); if (obj.key) snippetKey = obj.key } catch (e) {}
          if (SYSTEM_KEYS.has(snippetKey)) {
            return res.status(403).json({ error: `System-Snippet "${snippetKey}" kann nicht gelöscht werden.` })
          }
        }
      } catch (e) {}
      await prisma.snippet.delete({ where: { key: String(k) } })
      return res.status(200).json({ ok: true })
    }

    res.status(405).end()
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Fehler' })
  }
}
