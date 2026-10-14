import { requireAuth, PERMISSIONS } from '../../../../lib/auth'
import { requireShopEnabled } from '../../../../lib/shop/guard'
import { getOverview } from '../../../../lib/shop/reports'

/** GET /api/shop/reports/overview – Kennzahlen (SHOP_REPORTS_VIEW). */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_REPORTS_VIEW)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    return res.status(200).json(await getOverview({ now: new Date() }))
  } catch (e) {
    console.error('[/api/shop/reports/overview Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
