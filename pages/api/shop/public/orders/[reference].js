import { prisma } from '../../../../../lib/prisma'
import { rateLimit } from '../../../../../lib/rateLimit'
import { isShopEnabled } from '../../../../../lib/shop/config'
import { syncPayment } from '../../../../../lib/shop/payments'
import { safeEqual } from '../../../../../lib/shop/tokens'
import { listDownloadsForOrder } from '../../../../../lib/shop/downloads'

const limiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyFn: (req) => `shop-order:${req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'}`,
})

const SELECT = { id: true, reference: true, status: true, totalCents: true, currency: true, accessToken: true, trackingCarrier: true, trackingNumber: true, trackingUrl: true }
const DUMMY = 'x'.repeat(48)
const NOT_FOUND = { error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' }

/** Öffentlich: GET /api/shop/public/orders/<reference>?t=<accessToken> - nur mit gültigem Token, keine personenbezogenen Daten. */
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
    const token = typeof req.query?.t === 'string' ? req.query.t : ''

    const found = reference && reference.length <= 60
      ? await prisma.shopOrder.findUnique({
          where: { reference },
          select: { ...SELECT, payments: { where: { status: 'PENDING' }, select: { provider: true, externalId: true } } },
        })
      : null
    // Vergleich läuft immer, damit Antwortzeit und -form nicht verraten, ob die Nummer existiert
    const stored = found?.accessToken || ''
    const same = safeEqual(token || DUMMY, stored || DUMMY)
    let order = found && stored && token && same ? found : null
    if (!order) return res.status(404).json(NOT_FOUND)

    if (order.status === 'PENDING') {
      for (const p of order.payments || []) {
        try {
          await syncPayment({ provider: p.provider.toLowerCase(), externalId: p.externalId })
        } catch (e) {
          console.error('[/api/shop/public/orders] Sync fehlgeschlagen:', e.message)
        }
      }
      const fresh = await prisma.shopOrder.findUnique({ where: { id: order.id }, select: SELECT })
      if (fresh) order = fresh
    }

    const paid = order.status === 'PAID' || order.status === 'SHIPPED'
    const out = { reference: order.reference, status: order.status, totalCents: order.totalCents, currency: order.currency, paid }
    if (paid) {
      let downloads = []
      try {
        downloads = ((await listDownloadsForOrder(order.id)) || []).map((d) => ({ filename: d.filename, url: d.url, expiresAt: d.expiresAt, remaining: d.remaining }))
      } catch (e) {
        console.error('[/api/shop/public/orders] Downloads:', e.message)
      }
      out.downloads = downloads
      out.invoiceUrl = `/api/shop/public/orders/${encodeURIComponent(order.reference)}/invoice?t=${encodeURIComponent(token)}`
    }
    if (order.status === 'SHIPPED') {
      out.trackingNumber = order.trackingNumber || null
      out.trackingCarrier = order.trackingCarrier || null
      out.trackingUrl = order.trackingUrl || null
    }
    return res.status(200).json(out)
  } catch (e) {
    console.error('[/api/shop/public/orders Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
