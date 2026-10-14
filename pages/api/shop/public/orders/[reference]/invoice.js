import { prisma } from '../../../../../../lib/prisma'
import { rateLimit } from '../../../../../../lib/rateLimit'
import { isShopEnabled } from '../../../../../../lib/shop/config'
import { safeEqual } from '../../../../../../lib/shop/tokens'
import { issueInvoice, buildInvoicePdf, INVOICE_STATUSES } from '../../../../../../lib/shop/invoice'

const limiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyFn: (req) => `shop-invoice:${req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'}`,
})

const NOT_FOUND = { error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' }

/** Öffentlich: GET /api/shop/public/orders/<reference>/invoice?t=<accessToken> - Rechnungs-PDF. */
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
    if (!reference || reference.length > 60 || !token) return res.status(404).json(NOT_FOUND)

    const order = await prisma.shopOrder.findUnique({ where: { reference }, select: { id: true, status: true, accessToken: true } })
    if (!order || !order.accessToken || !safeEqual(order.accessToken, token) || !INVOICE_STATUSES.includes(order.status)) {
      return res.status(404).json(NOT_FOUND)
    }
    const invoice = await issueInvoice(order.id)
    const pdf = invoice ? await buildInvoicePdf(order.id) : null
    if (!pdf) return res.status(404).json(NOT_FOUND)

    const name = `Rechnung-${invoice.number.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${name}"`)
    res.setHeader('Content-Length', pdf.length)
    return res.status(200).send(pdf)
  } catch (e) {
    console.error('[/api/shop/public/orders/invoice Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
