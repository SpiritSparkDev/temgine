import { prisma } from '../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { logAudit } from '../../../lib/audit'
import { requireShopEnabled } from '../../../lib/shop/guard'
import { validateCouponInput, toAdminCoupon } from '../../../lib/shop/coupons'

/** Gutscheine: GET Liste, POST anlegen (beides SHOP_COUPONS_EDIT). */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_COUPONS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method === 'GET') {
      const rows = await prisma.shopCoupon.findMany({ orderBy: { createdAt: 'desc' } })
      return res.status(200).json({ coupons: rows.map(toAdminCoupon) })
    }

    if (req.method === 'POST') {
      const { errors, data } = validateCouponInput(req.body)
      if (errors.length) {
        return res.status(422).json({ error: 'Eingabe ungültig', code: 'VALIDATION_ERROR', details: { errors } })
      }
      try {
        const row = await prisma.shopCoupon.create({ data })
        await logAudit({ action: 'shop.coupon.create', resource: 'shop-coupon', resourceId: row.id, userId: auth.user.id, details: { code: row.code } })
        return res.status(201).json({ coupon: toAdminCoupon(row) })
      } catch (e) {
        if (e.code === 'P2002') return res.status(409).json({ error: 'Dieser Gutscheincode existiert bereits', code: 'DUPLICATE' })
        throw e
      }
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
  } catch (e) {
    console.error('[/api/shop/coupons Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
