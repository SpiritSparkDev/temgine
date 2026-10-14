import { prisma } from '../../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../../lib/auth'
import { logAudit } from '../../../../../lib/audit'
import { requireShopEnabled } from '../../../../../lib/shop/guard'
import { logOrderEvent } from '../../../../../lib/shop/events'
import { sendShippedMail, validateTracking } from '../../../../../lib/shop/orderMails'

/** Als versendet markieren: nur PAID -> SHIPPED (bedingtes Update, inkl. optionaler Sendungsdaten), Mail nur beim Wechsel. */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    }

    const { errors, data: tracking } = validateTracking(req.body)
    if (errors.length) {
      return res.status(422).json({ error: 'Ungültige Sendungsdaten', code: 'VALIDATION_ERROR', details: { errors } })
    }

    const { id } = req.query
    const order = await prisma.shopOrder.findUnique({ where: { id } })
    if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })

    const shippedAt = new Date()
    const r = await prisma.shopOrder.updateMany({ where: { id, status: 'PAID' }, data: { status: 'SHIPPED', shippedAt, ...tracking } })
    if (r.count !== 1) {
      return res.status(409).json({ error: 'Nur bezahlte Bestellungen können versendet werden', code: 'INVALID_STATUS' })
    }

    await logAudit({ action: 'shop.order.ship', resource: 'shop-order', resourceId: id, userId: auth.user.id, details: { reference: order.reference } })
    await logOrderEvent(id, 'SHIPPED', 'Als versendet markiert', { userId: auth.user.id })
    if (Object.values(tracking).some(Boolean)) {
      await logOrderEvent(id, 'TRACKING', 'Sendungsdaten hinterlegt', { userId: auth.user.id })
    }

    let mailError = false
    try {
      await sendShippedMail({ ...order, ...tracking, status: 'SHIPPED', shippedAt })
      await logOrderEvent(id, 'MAIL', 'Versandmail gesendet')
    } catch (e) {
      mailError = true
      console.error(`[shop/ship] Versandmail ${order.reference} fehlgeschlagen: ${e.message}`)
      await logOrderEvent(id, 'MAIL_ERROR', 'Versandmail konnte nicht gesendet werden')
    }
    return res.status(200).json({ ok: true, status: 'SHIPPED', shippedAt: shippedAt.toISOString(), mailError })
  } catch (e) {
    console.error('[/api/shop/orders/[id]/ship Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
