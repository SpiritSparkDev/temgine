import { prisma } from '../../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../../lib/auth'
import { logAudit } from '../../../../../lib/audit'
import { requireShopEnabled } from '../../../../../lib/shop/guard'
import { createRefund, ShopRefundError } from '../../../../../lib/shop/refunds'

const STATUS = { REFUND_NOT_ALLOWED: 409, AMOUNT_INVALID: 422, PROVIDER_ERROR: 502 }

/** Erstatten: POST { amountCents?, reason?, restock?, notifyCustomer? } (SHOP_REFUND). */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_REFUND)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const errors = []
    const { amountCents, reason, restock, notifyCustomer } = body
    if (amountCents !== undefined && amountCents !== null && (!Number.isInteger(amountCents) || amountCents <= 0)) errors.push('Betrag muss eine ganze Zahl in Cent größer 0 sein')
    if (reason !== undefined && reason !== null && (typeof reason !== 'string' || reason.length > 500)) errors.push('Grund darf höchstens 500 Zeichen lang sein')
    for (const [k, v] of Object.entries({ restock, notifyCustomer })) {
      if (v !== undefined && typeof v !== 'boolean') errors.push(`${k} muss true oder false sein`)
    }
    if (errors.length) return res.status(422).json({ error: errors[0], code: 'VALIDATION_ERROR', details: { errors } })

    const { id } = req.query
    const order = await prisma.shopOrder.findUnique({ where: { id } })
    if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })

    let out
    try {
      out = await createRefund({
        order,
        amountCents: amountCents ?? undefined,
        reason: reason ? reason.trim() : undefined,
        restock: restock === true,
        notifyCustomer: notifyCustomer !== false,
        userId: auth.user.id,
      })
    } catch (e) {
      if (e instanceof ShopRefundError) {
        await logAudit({ action: 'shop.order.refund.failed', resource: 'shop-order', resourceId: id, userId: auth.user.id, details: { reference: order.reference, code: e.code } })
        return res.status(STATUS[e.code] || 400).json({ error: e.message, code: e.code })
      }
      throw e
    }

    await logAudit({
      action: 'shop.order.refund', resource: 'shop-order', resourceId: id, userId: auth.user.id,
      details: { reference: order.reference, amountCents: out.refund.amountCents, status: out.refund.status },
    })
    return res.status(200).json({
      ok: true,
      refund: { id: out.refund.id, amountCents: out.refund.amountCents, status: out.refund.status },
      status: out.order.status,
      refundedCents: out.order.refundedCents,
      mailError: out.mailError,
    })
  } catch (e) {
    console.error('[/api/shop/orders/[id]/refund Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
