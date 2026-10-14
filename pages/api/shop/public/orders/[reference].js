import { prisma } from '../../../../../lib/prisma'
import { rateLimit } from '../../../../../lib/rateLimit'
import { isShopEnabled } from '../../../../../lib/shop/config'
import { syncPayment } from '../../../../../lib/shop/payments'

const limiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyFn: (req) => `shop-order:${req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'}`,
})

const PUBLIC = (o) => ({ reference: o.reference, status: o.status, totalCents: o.totalCents, currency: o.currency, paid: o.status === 'PAID' || o.status === 'SHIPPED' })

/** Öffentlich: GET /api/shop/public/orders/<reference> - nur Status und Betrag, keine personenbezogenen Daten. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    const { ok, retryAfter } = limiter.check(req)
    if (!ok) {
      res.setHeader('Retry-After', retryAfter)
      return res.status(429).json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.', code: 'RATE_LIMIT_EXCEEDED', retryAfter })
    }
    const reference = typeof req.query?.reference === 'string' ? req.query.reference : ''
    if (!reference || reference.length > 60) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })

    let order = await prisma.shopOrder.findUnique({
      where: { reference },
      select: { id: true, reference: true, status: true, totalCents: true, currency: true, payments: { where: { status: 'PENDING' }, select: { provider: true, externalId: true } } },
    })
    if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })

    if (order.status === 'PENDING') {
      for (const p of order.payments) {
        try {
          await syncPayment({ provider: p.provider.toLowerCase(), externalId: p.externalId })
        } catch (e) {
          console.error('[/api/shop/public/orders] Sync fehlgeschlagen:', e.message)
        }
      }
      const fresh = await prisma.shopOrder.findUnique({ where: { id: order.id }, select: { reference: true, status: true, totalCents: true, currency: true } })
      if (fresh) order = fresh
    }
    return res.status(200).json(PUBLIC(order))
  } catch (e) {
    console.error('[/api/shop/public/orders Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
