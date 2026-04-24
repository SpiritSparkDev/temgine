import { prisma } from '../../lib/prisma'

export default async function handler(req, res) {
  try {
    // GET: alle Settings als { key: value }-Map zurückgeben
    if (req.method === 'GET') {
      const settings = await prisma.setting.findMany()
      const map = {}
      for (const s of settings) {
        map[s.key] = s.value
      }
      return res.status(200).json(map)
    }

    // PUT: einzelne Einstellung speichern { key, value }
    if (req.method === 'PUT') {
      const { key, value } = req.body || {}
      if (!key) return res.status(400).json({ error: 'key erforderlich' })
      if (value === undefined || value === null) return res.status(400).json({ error: 'value erforderlich' })

      const setting = await prisma.setting.upsert({
        where: { key: String(key) },
        update: { value: String(value) },
        create: { key: String(key), value: String(value) },
      })
      return res.status(200).json(setting)
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Fehler' })
  }
}
