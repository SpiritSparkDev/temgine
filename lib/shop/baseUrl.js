import { resolveBaseUrl } from '../seo'

/**
 * Absolute Basis-URL der Website für Links in Mails, Rückkehr- und Webhook-URLs.
 * NEXTAUTH_URL (absolut, http/https, ohne Pfad) hat Vorrang vor dem Host-Header, den Dritte setzen können.
 */
export function getBaseUrl(req) {
  try {
    const u = new URL(process.env.NEXTAUTH_URL || '')
    if ((u.protocol === 'https:' || u.protocol === 'http:') && u.pathname === '/' && !u.search && !u.hash) return u.origin
  } catch {}
  return resolveBaseUrl(req)
}
