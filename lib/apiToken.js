import crypto from 'crypto'
import { prisma } from './prisma'

// Zugangs-Token ("tmg_…") für externe Werkzeuge. Gespeichert wird nur der SHA-256-Hash;
// das Token selbst ist 32 zufällige Bytes, ein langsamer Hash ist daher nicht nötig.
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex')

export function generateToken() {
  const token = `tmg_${crypto.randomBytes(32).toString('base64url')}`
  return { token, tokenHash: hashToken(token), prefix: token.slice(0, 8) }
}

// Gültiges Token aus dem Authorization-Header → Token-Zeile, sonst null.
export async function findValidToken(req) {
  const m = /^Bearer (tmg_\S+)$/.exec(req.headers?.authorization || '')
  if (!m) return null
  const row = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(m[1]) } })
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) return null
  prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return row
}
