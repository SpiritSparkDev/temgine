import { prisma } from '../../../../../lib/prisma'
import { isShopEnabled } from '../../../../../lib/shop/config'
import { getMemberFromRequest, loginRequired, trackingOf, PAID_STATES } from '../../../../../lib/shop/account'
import { listDownloadsForOrder } from '../../../../../lib/shop/downloads'

/** Mitglied: GET /api/shop/account/orders/<reference> - nur eigene Bestellung, ohne Adressen und Zahlungsdetails. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    const member = await getMemberFromRequest(req, res)
    if (!member) return loginRequired(res)
    const reference = typeof req.query?.reference === 'string' ? req.query.reference : ''
    const o = reference && reference.length <= 60
      ? await prisma.shopOrder.findUnique({
          where: { reference },
          select: {
            id: true, reference: true, status: true, memberId: true, currency: true, createdAt: true, paidAt: true, shippedAt: true,
            subtotalCents: true, discountCents: true, shippingCents: true, shippingTaxBp: true, totalCents: true, refundedCents: true,
            couponCode: true, taxBreakdown: true, trackingCarrier: true, trackingNumber: true, trackingUrl: true,
            items: { select: { title: true, label: true, sku: true, qty: true, unitCents: true, discountCents: true, taxRateBp: true, digital: true } },
          },
        })
      : null
    if (!o || o.memberId !== member.id) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })

    const paid = PAID_STATES.includes(o.status)
    let downloads = []
    if (paid) {
      try {
        downloads = ((await listDownloadsForOrder(o.id)) || []).map((d) => ({ filename: d.filename, url: d.url, expiresAt: d.expiresAt, remaining: d.remaining }))
      } catch (e) {
        console.error('[/api/shop/account/orders] Downloads:', e.message)
      }
    }
    const invoiceable = paid || o.status === 'REFUNDED'
    return res.status(200).json({
      order: {
        reference: o.reference, status: o.status, paid, currency: o.currency, createdAt: o.createdAt, paidAt: o.paidAt, shippedAt: o.shippedAt,
        items: o.items.map((i) => ({ title: i.title, label: i.label, sku: i.sku, qty: i.qty, unitCents: i.unitCents, discountCents: i.discountCents, taxRateBp: i.taxRateBp, digital: i.digital })),
        subtotalCents: o.subtotalCents, discountCents: o.discountCents, couponCode: o.couponCode || null,
        shippingCents: o.shippingCents, shippingTaxBp: o.shippingTaxBp ?? null, totalCents: o.totalCents, refundedCents: o.refundedCents,
        taxBreakdown: o.taxBreakdown || {},
        tracking: trackingOf(o),
        downloads,
        invoiceUrl: invoiceable ? `/api/shop/account/orders/${encodeURIComponent(o.reference)}/invoice` : null,
      },
    })
  } catch (e) {
    console.error('[/api/shop/account/orders/[reference] Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
