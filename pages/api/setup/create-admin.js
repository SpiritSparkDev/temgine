import crypto from 'crypto'
import { prisma } from '../../../lib/prisma'

/**
 * POST /api/setup/create-admin
 *
 * One-time endpoint for bootstrapping the first admin account.
 * Only works when:
 *  1. The `user` table is empty (count === 0)
 *  2. The correct SETUP_TOKEN is supplied in the request body
 *
 * Body: { setupToken, name, email, password }
 * Returns: { ok: true } — client redirects to /login
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Reject if no token is configured server-side (prevents accidental exposure)
  const configuredToken = process.env.SETUP_TOKEN
  if (!configuredToken) {
    return res.status(503).json({ error: 'Setup nicht konfiguriert (SETUP_TOKEN fehlt).' })
  }

  // Abort if any user already exists — endpoint is single-use
  const userCount = await prisma.user.count()
  if (userCount > 0) {
    return res.status(403).json({ error: 'Setup bereits abgeschlossen. Es existiert bereits ein Benutzer.' })
  }

  const body = req.body || {}
  const { setupToken, name, email, password } = body

  // Token validation (timing-safe comparison)
  const provided = String(setupToken || '')
  const expected = String(configuredToken)
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return res.status(401).json({ error: 'Ungültiger Setup-Token.' })
  }

  // Input validation
  const cleanName  = String(name  || '').trim()
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanPw    = String(password || '')

  if (!cleanName)  return res.status(400).json({ error: 'Name ist erforderlich.' })
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Gültige E-Mail-Adresse erforderlich.' })
  }
  if (cleanPw.length < 8) {
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' })
  }

  const hashedPassword = crypto.createHash('sha256').update(cleanPw).digest('hex')

  await prisma.user.create({
    data: {
      name: cleanName,
      email: cleanEmail,
      password: hashedPassword,
      role: 'ADMIN',
    },
  })

  console.log(`[setup] Erster Admin-Account erstellt: ${cleanEmail}`)

  return res.status(200).json({ ok: true })
}
