import { prisma } from '../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../lib/auth'
import { requireShopEnabled } from '../../../../lib/shop/guard'

/** Shop-Bestellung: GET Detail (ORDERS_VIEW). Ohne externe Zahlungs-IDs, Download-Token und Zugriffstoken. */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_VIEW)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    }

    const o = await prisma.shopOrder.findUnique({
      where: { id: req.query.id },
      include: {
        items: true,
        payments: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'desc' }, take: 200 },
        refunds: { orderBy: { createdAt: 'asc' } },
        invoice: true,
        downloadTokens: { include: { file: true }, orderBy: { createdAt: 'asc' } },
        returns: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!o) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })
    return res.status(200).json({
      order: {
        id: o.id,
        reference: o.reference,
        status: o.status,
        email: o.email,
        locale: o.locale,
        billing: o.billing,
        shipping: o.shipping,
        subtotalCents: o.subtotalCents,
        discountCents: o.discountCents,
        shippingCents: o.shippingCents,
        shippingTaxBp: o.shippingTaxBp,
        totalCents: o.totalCents,
        refundedCents: o.refundedCents,
        currency: o.currency,
        taxBreakdown: o.taxBreakdown,
        acceptedTermsAt: o.acceptedTermsAt,
        acceptedWaiver: o.acceptedWaiver,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        shippedAt: o.shippedAt,
        cancelledAt: o.cancelledAt,
        items: o.items.map((i) => ({
          sku: i.sku, title: i.title, label: i.label, qty: i.qty, unitCents: i.unitCents, discountCents: i.discountCents,
          taxRateBp: i.taxRateBp, digital: i.digital, weightG: i.weightG,
        })),
        payments: o.payments.map((p) => ({
          provider: p.provider, status: p.status, amountCents: p.amountCents, currency: p.currency, createdAt: p.createdAt,
        })),
        events: o.events.map((e) => ({ id: e.id, type: e.type, message: e.message, userId: e.userId, createdAt: e.createdAt })),
        tracking: { carrier: o.trackingCarrier, number: o.trackingNumber, url: o.trackingUrl },
        refunds: o.refunds.map((r) => ({
          id: r.id, amountCents: r.amountCents, reason: r.reason, restock: r.restock, status: r.status, createdAt: r.createdAt,
        })),
        invoice: o.invoice ? { number: o.invoice.number, issuedAt: o.invoice.issuedAt } : null,
        downloads: o.downloadTokens.map((d) => ({
          filename: d.file ? d.file.filename : null, downloads: d.downloads, maxDownloads: d.maxDownloads, expiresAt: d.expiresAt,
        })),
        coupon: o.couponCode ? { code: o.couponCode, discountCents: o.discountCents } : null,
        returns: o.returns.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt })),
      },
    })
  } catch (e) {
    console.error('[/api/shop/orders/[id] Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
