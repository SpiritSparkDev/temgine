import crypto from 'crypto'

/** Zufälliger geheimer Token (hex), z. B. für Zugriff auf Bestellstatus, Downloads, Bestätigungslinks. */
export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex')
}

/** Konstantzeitiger Stringvergleich (false bei unterschiedlicher Länge oder Nicht-Strings). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}
