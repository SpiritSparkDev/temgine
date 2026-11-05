import { rateLimit } from '../../../../lib/rateLimit'
import { clientIp } from '../../../../lib/shop/clientIp'
import { isShopEnabled } from '../../../../lib/shop/config'
import { createReturnRequest, ReturnError } from '../../../../lib/shop/returns'

const limiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  keyFn: (req) => `shop-return:${clientIp(req)}`,
})

/** Öffentlich: POST /api/shop/public/returns { reference, email, items?, reason } */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    const { ok, retryAfter } = limiter.check(req)
    if (!ok) {
      res.setHeader('Retry-After', retryAfter)
      return res.status(429).json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.', code: 'RATE_LIMIT_EXCEEDED', retryAfter })
    }
    const b = req.body && typeof req.body === 'object' ? req.body : {}
    const r = await createReturnRequest(b)
    return res.status(201).json({ id: r.id, status: r.status })
  } catch (e) {
    if (e instanceof ReturnError) {
      return res.status(e.status).json({ error: e.message, code: e.code, ...(e.details ? { details: e.details } : {}) })
    }
    console.error('[/api/shop/public/returns Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
