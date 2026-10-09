import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { logAudit } from '../../../lib/audit'
import { getShopStatus, setShopEnabled } from '../../../lib/shop/config'

/**
 * Shop-Add-on: Status lesen und Add-on ein-/ausschalten. Nur Admins.
 * Gibt nie Zugangsdaten zurück, nur Flags (aktiviert / konfiguriert).
 */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_SETTINGS)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')

    if (req.method === 'GET') {
      return res.status(200).json(await getShopStatus())
    }

    if (req.method === 'PUT') {
      const enabled = req.body?.enabled
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled (true/false) erforderlich', code: 'VALIDATION_ERROR' })
      }
      await setShopEnabled(enabled)
      await logAudit({ action: 'shop.settings.update', resource: 'shop', resourceId: 'enabled', userId: auth.user.id, details: { enabled } })
      return res.status(200).json(await getShopStatus())
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
  } catch (e) {
    console.error('[/api/shop/settings Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
