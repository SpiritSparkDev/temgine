import { prisma } from '../../../../lib/prisma'
import { isShopEnabled } from '../../../../lib/shop/config'
import { getMemberFromRequest, loginRequired, trackingOf, PAID_STATES } from '../../../../lib/shop/account'

/** Mitglied: GET /api/shop/account/orders - eigene Bestellungen, neueste zuerst (max. 100). */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    const member = await getMemberFromRequest(req, res)
    if (!member) return loginRequired(res)
    const rows = await prisma.shopOrder.findMany({
      where: { memberId: member.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        reference: true, status: true, totalCents: true, currency: true, createdAt: true,
        trackingCarrier: true, trackingNumber: true, trackingUrl: true, invoice: { select: { id: true } },
      },
    })
    const orders = rows.map((o) => ({
      reference: o.reference, status: o.status, totalCents: o.totalCents, currency: o.currency, createdAt: o.createdAt,
      paid: PAID_STATES.includes(o.status), hasInvoice: !!o.invoice, tracking: trackingOf(o),
    }))
    return res.status(200).json({ orders })
  } catch (e) {
    console.error('[/api/shop/account/orders Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
