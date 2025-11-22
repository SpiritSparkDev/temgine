import { prisma } from '../../lib/prisma'

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const name = req.query && req.query.name
      if (name) {
        const t = await prisma.template.findUnique({ where: { name: String(name) } })
        if (!t) return res.status(404).json({ error: 'Template nicht gefunden' })
        return res.status(200).json({ name: t.name, code: t.code })
      }

      // List template names. If you need ordering, you can implement an Order model later.
      const templates = await prisma.template.findMany({ orderBy: { createdAt: 'asc' } })
      const names = templates.map(t => t.name)
      return res.status(200).json(names)
    }

    if (req.method === 'POST') {
      const { name, code } = req.body || {}
      if (!name || !code) return res.status(400).json({ error: 'Name und Code erforderlich' })
      const up = await prisma.template.upsert({
        where: { name: String(name) },
        create: { name: String(name), code: String(code) },
        update: { code: String(code) }
      })
      return res.status(200).json({ ok: true, id: up.id })
    }

    if (req.method === 'DELETE') {
      const { name } = req.body || {}
      if (!name) return res.status(400).json({ error: 'Name erforderlich' })
      await prisma.template.delete({ where: { name: String(name) } })
      return res.status(200).json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Fehler' })
  }
}
