const sanitizeHtml = require('sanitize-html')

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
          return { label: s.key, snippet: obj.snippet || '', type: obj.type || 'free', handler: obj.handler || '' }
        } catch (e) {
          return { label: s.key, snippet: raw || '', type: 'free' }
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
          let value = String(item.snippet || '')
          try { value = sanitizeHtmlString(value) } catch (e) { console.warn('Failed to sanitize snippet', e) }
          if (item.type || item.handler) {
            value = JSON.stringify({ snippet: item.snippet || '', type: item.type || 'free', handler: item.handler || '' })
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
      let value = body.snippet || body.value || ''
      try { value = sanitizeHtmlString(String(value)) } catch (e) { console.warn('Failed to sanitize snippet single', e) }
      if (body.type || body.handler) {
        value = JSON.stringify({ snippet: body.snippet || '', type: body.type || 'free', handler: body.handler || '' })
      }
      const up = await prisma.snippet.upsert({ where: { key }, create: { key, value }, update: { value } })
      return res.status(200).json(up)
    }

    if (req.method === 'DELETE') {
      const { label, key } = req.body || {}
      const k = label || key
      if (!k) return res.status(400).json({ error: 'Label/Key erforderlich' })
      await prisma.snippet.delete({ where: { key: String(k) } })
      return res.status(200).json({ ok: true })
    }

    res.status(405).end()
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Fehler' })
  }
}
