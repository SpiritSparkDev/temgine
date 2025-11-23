import { prisma } from '../../../lib/prisma'

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).end()

    // Fetch core data
    const [pages, templates, snippets] = await Promise.all([
      prisma.page.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.template.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.snippet.findMany({ orderBy: { createdAt: 'asc' } })
    ])

    // Map snippets to their original JSON shape when possible
    const mappedSnippets = snippets.map(s => {
      const raw = s.value || ''
      try {
        const obj = JSON.parse(raw)
        return { label: s.key, snippet: obj.snippet || '', type: obj.type || 'free', handler: obj.handler || '' }
      } catch (e) {
        return { label: s.key, snippet: raw || '', type: 'free' }
      }
    })

    const out = { pages, templates, snippets: mappedSnippets, exportedAt: new Date().toISOString() }

    const json = JSON.stringify(out, null, 2)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="temphelix-export-${new Date().toISOString()}.json"`)
    res.status(200).send(json)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Export failed' })
  }
}
