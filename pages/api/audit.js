import { prisma } from '../../lib/prisma'

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { resource, resourceId, limit = 100 } = req.query || {}
      const where = {}
      if (resource) where.resource = String(resource)
      if (resourceId) where.resourceId = String(resourceId)

      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit)
      })
      return res.status(200).json(logs)
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Fehler' })
  }
}
