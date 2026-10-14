import { prisma } from '../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../lib/auth'
import { logAudit } from '../../../../lib/audit'
import { requireShopEnabled } from '../../../../lib/shop/guard'
import { syncPayment, LATE_PAYMENT_WINDOW_MS } from '../../../../lib/shop/payments'

const MAX_PAYMENTS = 50
const MIN_AGE_MS = 2 * 60_000

/** Offene Zahlungen beim Anbieter nachprüfen: POST (ORDERS_EDIT). Nacheinander, nicht-strikt, höchstens 50 je Aufruf. */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    }

    const now = Date.now()
    const payments = await prisma.shopPayment.findMany({
      where: {
        createdAt: { lt: new Date(now - MIN_AGE_MS) },
        OR: [
          { status: 'PENDING', order: { status: 'PENDING' } },
          { order: { status: 'FAILED', createdAt: { gte: new Date(now - LATE_PAYMENT_WINDOW_MS) } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_PAYMENTS,
      select: { provider: true, externalId: true },
    })

    const result = { checked: 0, paid: 0, failed: 0, pending: 0 }
    for (const p of payments) {
      let status = null
      try {
        status = await syncPayment({ provider: p.provider.toLowerCase(), externalId: p.externalId })
      } catch (e) {
        console.error('[/api/shop/orders/reconcile] Sync fehlgeschlagen:', e.message)
      }
      result.checked++
      if (status === 'PAID') result.paid++
      else if (status === 'FAILED') result.failed++
      else result.pending++
    }

    await logAudit({ action: 'shop.orders.reconcile', resource: 'shop-order', userId: auth.user.id, details: result })
    return res.status(200).json(result)
  } catch (e) {
    console.error('[/api/shop/orders/reconcile Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
