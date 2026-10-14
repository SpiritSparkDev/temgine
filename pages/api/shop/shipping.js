import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { logAudit } from '../../../lib/audit'
import { requireShopEnabled } from '../../../lib/shop/guard'
import { loadShippingConfig, saveShippingConfig, validateShippingConfig } from '../../../lib/shop/shippingConfig'

/** Versandkonfiguration lesen/speichern (nur Admin). */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_SETTINGS)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method === 'GET') return res.status(200).json(await loadShippingConfig())

    if (req.method === 'PUT') {
      const { errors, data } = validateShippingConfig(req.body)
      if (errors.length) {
        return res.status(422).json({ error: 'Ungültige Versandkonfiguration', code: 'VALIDATION_ERROR', details: { errors } })
      }
      await saveShippingConfig(data)
      await logAudit({ action: 'shop.shipping.update', resource: 'shop', resourceId: 'shipping', userId: auth.user.id })
      return res.status(200).json(data)
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
  } catch (e) {
    console.error('[/api/shop/shipping Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
