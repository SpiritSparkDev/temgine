import { getServerSession } from 'next-auth/next'
import { prisma } from '../prisma'
import { authOptions } from '../../pages/api/auth/[...nextauth]'

/** Eingeloggtes, existierendes, nicht gesperrtes Mitglied -> { id, email } sonst null (Admin-Sessions zählen nicht). */
export async function getMemberFromRequest(req, res) {
  try {
    const session = await getServerSession(req, res, authOptions)
    if (session?.user?.accountType !== 'member' || !session.user.id) return null
    const member = await prisma.member.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, blocked: true } })
    if (!member || member.blocked) return null
    return { id: member.id, email: member.email }
  } catch {
    return null
  }
}

export const PAID_STATES = ['PAID', 'SHIPPED']

/** Sendungsdaten nur bei SHIPPED, sonst null. */
export function trackingOf(o) {
  if (o.status !== 'SHIPPED') return null
  if (!o.trackingNumber && !o.trackingCarrier && !o.trackingUrl) return null
  return { carrier: o.trackingCarrier || null, number: o.trackingNumber || null, url: o.trackingUrl || null }
}

export function loginRequired(res) {
  return res.status(401).json({ error: 'Bitte anmelden', code: 'LOGIN_REQUIRED' })
}
