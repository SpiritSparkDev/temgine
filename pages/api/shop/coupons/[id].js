import { prisma } from '../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../lib/auth'
import { logAudit } from '../../../../lib/audit'
import { requireShopEnabled } from '../../../../lib/shop/guard'
import { validateCouponInput, toAdminCoupon } from '../../../../lib/shop/coupons'

/** Ein Gutschein: GET, PUT (Code nicht änderbar, kein Löschen; nur Felder ändern bzw. active umschalten). */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_COUPONS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    const id = typeof req.query.id === 'string' ? req.query.id : ''
    const row = id ? await prisma.shopCoupon.findUnique({ where: { id } }) : null
    if (!row) return res.status(404).json({ error: 'Gutschein nicht gefunden', code: 'NOT_FOUND' })

    if (req.method === 'GET') return res.status(200).json({ coupon: toAdminCoupon(row) })

    if (req.method === 'PUT') {
      // Teil-Updates (z. B. nur active) erlaubt: fehlende Felder bleiben; der Code bleibt der gespeicherte.
      const { id: _id, usedCount: _u, createdAt: _c, updatedAt: _p, ...current } = toAdminCoupon(row)
      const { errors, data } = validateCouponInput({ ...current, ...(req.body || {}), code: row.code })
      if (errors.length) {
        return res.status(422).json({ error: 'Eingabe ungültig', code: 'VALIDATION_ERROR', details: { errors } })
      }
      const { code, ...fields } = data
      const updated = await prisma.shopCoupon.update({ where: { id }, data: fields })
      await logAudit({ action: 'shop.coupon.update', resource: 'shop-coupon', resourceId: id, userId: auth.user.id, details: { code: row.code, active: updated.active } })
      return res.status(200).json({ coupon: toAdminCoupon(updated) })
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
  } catch (e) {
    console.error('[/api/shop/coupons/[id] Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
