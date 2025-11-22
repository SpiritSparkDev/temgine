import { prisma } from '../../lib/prisma'

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const snippets = await prisma.snippet.findMany({ orderBy: { createdAt: 'asc' } })
      // Map DB shape (key/value) to previous JSON shape (label/snippet)
      const out = snippets.map(s => ({ label: s.key, snippet: s.value }))
      return res.status(200).json(out)
    }

    if (req.method === 'POST') {
      const body = req.body
      // Accept array or single
      if (Array.isArray(body)) {
        const results = []
        const keys = []
        for (const item of body) {
          if (!item.label) continue
          const key = String(item.label)
          keys.push(key)
          const value = String(item.snippet || '')
          const up = await prisma.snippet.upsert({
            where: { key },
            create: { key, value },
            update: { value }
          })
          results.push(up)
        }
        // remove any snippets not present in the submitted array
        if (keys.length > 0) {
          try { await prisma.snippet.deleteMany({ where: { key: { notIn: keys } } }) } catch (e) {}
        }
        return res.status(200).json(results)
      }

      // Single
      const label = body.label || body.key
      const value = body.snippet || body.value || ''
      if (!label) return res.status(400).json({ error: 'Label/Key erforderlich' })
      const key = String(label)
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
