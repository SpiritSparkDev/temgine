import { prisma } from '../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../lib/auth'
import { requireShopEnabled } from '../../../../lib/shop/guard'

/** Shop-Bestellung: GET Detail (ORDERS_VIEW). Zahlungen ohne externe IDs. */
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
      include: { items: true, payments: { orderBy: { createdAt: 'asc' } } },
    })
    if (!o) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })
    return res.status(200).json({
      order: {
        id: o.id,
        reference: o.reference,
        status: o.status,
        email: o.email,
        billing: o.billing,
        shipping: o.shipping,
        subtotalCents: o.subtotalCents,
        shippingCents: o.shippingCents,
        totalCents: o.totalCents,
        currency: o.currency,
        taxBreakdown: o.taxBreakdown,
        acceptedTermsAt: o.acceptedTermsAt,
        acceptedWaiver: o.acceptedWaiver,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        shippedAt: o.shippedAt,
        items: o.items.map((i) => ({
          sku: i.sku, title: i.title, label: i.label, qty: i.qty, unitCents: i.unitCents,
          taxRateBp: i.taxRateBp, digital: i.digital, weightG: i.weightG,
        })),
        payments: o.payments.map((p) => ({
          provider: p.provider, status: p.status, amountCents: p.amountCents, currency: p.currency, createdAt: p.createdAt,
        })),
      },
    })
  } catch (e) {
    console.error('[/api/shop/orders/[id] Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
