/**
 * IP für Rate-Limits. X-Forwarded-For ist vom Client fälschbar: nur mit TRUST_PROXY=true (vertrauenswürdiger Proxy davor)
 * zählt das LETZTE Element (vom Proxy angehängt). Sonst die Socket-Adresse, zuletzt 'unknown'.
 */
export function clientIp(req) {
  if (process.env.TRUST_PROXY === 'true') {
    const xff = req?.headers?.['x-forwarded-for']
    const last = String(Array.isArray(xff) ? xff.join(',') : xff || '').split(',').pop().trim()
    if (last) return last
  }
  return req?.socket?.remoteAddress || 'unknown'
}
