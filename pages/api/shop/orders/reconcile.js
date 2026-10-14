import { requireAuth, PERMISSIONS } from '../../../../lib/auth'
import { logAudit } from '../../../../lib/audit'
import { requireShopEnabled } from '../../../../lib/shop/guard'
import { reconcileOpenPayments } from '../../../../lib/shop/payments'

/** Offene Zahlungen beim Anbieter nachprüfen: POST (ORDERS_EDIT). Logik in reconcileOpenPayments (höchstens 50 je Aufruf). */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    }

    const result = await reconcileOpenPayments({ limit: 50 })
    await logAudit({ action: 'shop.orders.reconcile', resource: 'shop-order', userId: auth.user.id, details: result })
    return res.status(200).json(result)
  } catch (e) {
    console.error('[/api/shop/orders/reconcile Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
