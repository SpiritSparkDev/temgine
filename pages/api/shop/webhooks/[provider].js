import { isShopEnabled, loadShopSettings } from '../../../../lib/shop/config'
import { getProvider } from '../../../../lib/shop/providers'
import { rateLimit } from '../../../../lib/rateLimit'
import { syncPayment } from '../../../../lib/shop/payments'

// Rohbody wird selbst gelesen (Signaturprüfung braucht die unveränderten Bytes)
export const config = { api: { bodyParser: false } }

export const MAX_BODY_BYTES = 256 * 1024

const limiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  keyFn: (req) => `shop-webhook:${req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'}`,
})

class TooLarge extends Error {}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let done = false
    req.on('data', (c) => {
      if (done) return
      size += c.length
      if (size > MAX_BODY_BYTES) {
        done = true
        reject(new TooLarge('too large'))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks).toString('utf8')) } })
    req.on('error', (e) => { if (!done) { done = true; reject(e) } })
  })
}

/** Öffentlich: POST /api/shop/webhooks/<anbieter>. Der Inhalt ist nur ein Anstoß; bezahlt ist, was der Anbieter per API bestätigt. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    const providerId = typeof req.query?.provider === 'string' ? req.query.provider : ''
    const driver = getProvider(providerId)
    if (!driver) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })

    const { ok, retryAfter } = limiter.check(req)
    if (!ok) {
      res.setHeader('Retry-After', retryAfter)
      return res.status(429).json({ error: 'Zu viele Anfragen', code: 'RATE_LIMIT_EXCEEDED', retryAfter })
    }

    const declared = Number(req.headers?.['content-length'])
    if (declared > MAX_BODY_BYTES) return res.status(413).json({ error: 'Anfrage zu groß', code: 'PAYLOAD_TOO_LARGE' })
    let rawBody
    try {
      rawBody = await readRawBody(req)
    } catch (e) {
      if (e instanceof TooLarge) return res.status(413).json({ error: 'Anfrage zu groß', code: 'PAYLOAD_TOO_LARGE' })
      throw e
    }

    let parsed
    try {
      parsed = await driver.parseWebhook({ rawBody, headers: req.headers, settings: await loadShopSettings() })
    } catch (e) {
      if (e && e.message === 'invalid signature') return res.status(400).json({ error: 'Ungültige Signatur', code: 'INVALID_SIGNATURE' })
      throw e
    }
    if (parsed && parsed.externalId) await syncPayment({ provider: providerId, externalId: parsed.externalId }, { strict: true })
    return res.status(200).json({ received: true })
  } catch (e) {
    console.error('[/api/shop/webhooks Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
