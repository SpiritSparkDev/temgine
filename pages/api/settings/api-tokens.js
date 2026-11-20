import { requireAuth } from '../../../lib/auth'
import { prisma } from '../../../lib/prisma'
import { generateToken } from '../../../lib/apiToken'
import { logAudit } from '../../../lib/audit'

// Zugangs-Token verwalten (nur ADMIN per Login – ein Token selbst ist MODERATOR und kommt hier nicht rein).
// GET → Liste · POST {name, days} → neues Token (Klartext nur in dieser Antwort) · DELETE ?id= → widerrufen
export default async function handler(req, res) {
  const auth = await requireAuth(req, res, ['ADMIN'])
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })

  if (req.method === 'GET') {
    const tokens = await prisma.apiToken.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, expiresAt: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    })
    return res.status(200).json({ tokens })
  }

  if (req.method === 'POST') {
    const name = String(req.body?.name || '').trim().slice(0, 80)
    if (!name) return res.status(400).json({ error: 'Name ist erforderlich' })
    const days = Number(req.body?.days)
    const expiresAt = days > 0 ? new Date(Date.now() + Math.min(days, 365) * 864e5) : null
    const { token, tokenHash, prefix } = generateToken()
    const row = await prisma.apiToken.create({ data: { name, tokenHash, prefix, expiresAt, createdBy: auth.user.id } })
    await logAudit({ action: 'API_TOKEN_CREATE', resource: 'ApiToken', resourceId: row.id, userId: auth.user.id, details: { name, expiresAt } })
    return res.status(201).json({ token, id: row.id })
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '')
    const r = await prisma.apiToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } })
    if (!r.count) return res.status(404).json({ error: 'Token nicht gefunden' })
    await logAudit({ action: 'API_TOKEN_REVOKE', resource: 'ApiToken', resourceId: id, userId: auth.user.id })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST, DELETE')
  res.status(405).json({ error: 'Methode nicht erlaubt' })
}
