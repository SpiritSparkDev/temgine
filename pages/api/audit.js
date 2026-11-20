import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../lib/auth'

export default async function handler(req, res) {
  // Audit-Log enthält Benutzer-IDs, Slugs und Token-Namen – nur für Admins (per Login; ein Token ist nie ADMIN).
  const auth = await requireAuth(req, res, ['ADMIN'])
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

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

    res.status(405).json({ error: 'Methode nicht erlaubt' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server Fehler' })
  }
}
