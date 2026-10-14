import { prisma } from '../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { logAudit } from '../../../lib/audit'
import { getShopStatus, setShopEnabled, isShopEnabled } from '../../../lib/shop/config'
import { ensureShopPages } from '../../../lib/shop/pages'
import { SHOP_NOTIFY_EMAIL_KEY, SHOP_ORDER_PREFIX_KEY } from '../../../lib/shop/keys'
import { normalizePrefix } from '../../../lib/shop/checkout'

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

async function readStatus() {
  const status = await getShopStatus()
  const rows = await prisma.setting.findMany({ where: { key: { in: [SHOP_NOTIFY_EMAIL_KEY, SHOP_ORDER_PREFIX_KEY] } } })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return { ...status, notifyEmail: map[SHOP_NOTIFY_EMAIL_KEY] || '', orderPrefix: normalizePrefix(map[SHOP_ORDER_PREFIX_KEY]) }
}

const save = (key, value) => prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })

/**
 * Shop-Add-on: Status lesen und Einstellungen speichern. Nur Admins.
 * Gibt nie Zugangsdaten zurück, nur Flags (aktiviert / konfiguriert).
 */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_SETTINGS)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')

    if (req.method === 'GET') {
      return res.status(200).json(await readStatus())
    }

    if (req.method === 'PUT') {
      const { enabled, notifyEmail, orderPrefix, ensurePages } = req.body || {}
      if (ensurePages !== undefined) {
        if (ensurePages !== true) {
          return res.status(400).json({ error: 'ensurePages muss true sein', code: 'VALIDATION_ERROR' })
        }
        if (!(await isShopEnabled())) {
          return res.status(403).json({ error: 'Add-on Shop nicht aktiviert', code: 'ADDON_DISABLED' })
        }
        const created = await ensureShopPages()
        await logAudit({ action: 'shop.pages.ensure', resource: 'shop', resourceId: created.join(','), userId: auth.user.id, details: { created } })
        return res.status(200).json({ ...(await readStatus()), created })
      }
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled (true/false) erforderlich', code: 'VALIDATION_ERROR' })
      }
      if (enabled === undefined && notifyEmail === undefined && orderPrefix === undefined) {
        return res.status(400).json({ error: 'enabled (true/false) erforderlich', code: 'VALIDATION_ERROR' })
      }
      let email
      if (notifyEmail !== undefined) {
        email = typeof notifyEmail === 'string' ? notifyEmail.trim() : null
        if (email === null || email.length > 200 || (email !== '' && !EMAIL_RE.test(email))) {
          return res.status(400).json({ error: 'Benachrichtigungs-E-Mail ungültig', code: 'VALIDATION_ERROR' })
        }
      }
      if (orderPrefix !== undefined && typeof orderPrefix !== 'string') {
        return res.status(400).json({ error: 'Präfix ungültig', code: 'VALIDATION_ERROR' })
      }
      const details = {}
      if (enabled !== undefined) {
        await setShopEnabled(enabled)
        details.enabled = enabled
      }
      if (email !== undefined) {
        await save(SHOP_NOTIFY_EMAIL_KEY, email)
        details.notifyEmail = email
      }
      if (orderPrefix !== undefined) {
        const prefix = normalizePrefix(orderPrefix)
        await save(SHOP_ORDER_PREFIX_KEY, prefix)
        details.orderPrefix = prefix
      }
      await logAudit({ action: 'shop.settings.update', resource: 'shop', resourceId: Object.keys(details).join(','), userId: auth.user.id, details })
      return res.status(200).json(await readStatus())
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
  } catch (e) {
    console.error('[/api/shop/settings Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
