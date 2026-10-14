import { prisma } from '../../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../../lib/auth'
import { logAudit } from '../../../../../lib/audit'
import { requireShopEnabled } from '../../../../../lib/shop/guard'
import { releaseReservations } from '../../../../../lib/shop/reservations'
import { logOrderEvent } from '../../../../../lib/shop/events'

/** Stornieren: nur PENDING -> CANCELLED (bedingtes Update). */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    }

    const { id } = req.query
    const order = await prisma.shopOrder.findUnique({ where: { id } })
    if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })

    const cancelledAt = new Date()
    const r = await prisma.shopOrder.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'CANCELLED', cancelledAt } })
    if (r.count !== 1) {
      return res.status(409).json({ error: 'Nur offene Bestellungen können storniert werden', code: 'INVALID_STATUS' })
    }

    try {
      await releaseReservations(id)
    } catch (e) {
      console.error(`[shop/cancel] Reservierungen ${order.reference} nicht freigegeben: ${e.message}`)
    }
    await logOrderEvent(id, 'CANCELLED', 'Bestellung storniert', { userId: auth.user.id })
    await logAudit({ action: 'shop.order.cancel', resource: 'shop-order', resourceId: id, userId: auth.user.id, details: { reference: order.reference } })
    return res.status(200).json({ ok: true, status: 'CANCELLED', cancelledAt: cancelledAt.toISOString() })
  } catch (e) {
    console.error('[/api/shop/orders/[id]/cancel Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
