import { prisma } from '../../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../../lib/auth'
import { requireShopEnabled } from '../../../../../lib/shop/guard'
import { logOrderEvent } from '../../../../../lib/shop/events'
import { validateTracking } from '../../../../../lib/shop/orderMails'

/** Sendungsdaten setzen/ändern (PUT, nur PAID/SHIPPED). Ersetzt alle drei Felder, leere Werte löschen. Sendet keine Mail. */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method !== 'PUT') {
      return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    }

    const { errors, data } = validateTracking(req.body)
    if (errors.length) {
      return res.status(422).json({ error: 'Ungültige Sendungsdaten', code: 'VALIDATION_ERROR', details: { errors } })
    }
    const tracking = { trackingCarrier: null, trackingNumber: null, trackingUrl: null, ...data }

    const { id } = req.query
    const order = await prisma.shopOrder.findUnique({ where: { id } })
    if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })

    const r = await prisma.shopOrder.updateMany({ where: { id, status: { in: ['PAID', 'SHIPPED'] } }, data: tracking })
    if (r.count !== 1) {
      return res.status(409).json({ error: 'Sendungsdaten sind nur bei bezahlten oder versendeten Bestellungen möglich', code: 'INVALID_STATUS' })
    }

    await logOrderEvent(id, 'TRACKING', Object.values(tracking).some(Boolean) ? 'Sendungsdaten geändert' : 'Sendungsdaten entfernt', { userId: auth.user.id })
    return res.status(200).json({
      ok: true,
      tracking: { carrier: tracking.trackingCarrier, number: tracking.trackingNumber, url: tracking.trackingUrl },
    })
  } catch (e) {
    console.error('[/api/shop/orders/[id]/tracking Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
