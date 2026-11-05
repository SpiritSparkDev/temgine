import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { rateLimit } from '../../../lib/rateLimit'
import { clientIp } from '../../../lib/shop/clientIp'
import { isShopEnabled } from '../../../lib/shop/config'
import { getSetting } from '../../../lib/shop/settingsStore'
import { safeEqual } from '../../../lib/shop/tokens'
import { runShopJobs } from '../../../lib/shop/cron'

const limiter = rateLimit({
  windowMs: 60_000,
  max: 6,
  keyFn: (req) => `shop-cron:${clientIp(req)}`,
})

async function tokenMatches(given) {
  if (typeof given !== 'string' || !given) return false
  const candidates = [process.env.SHOP_CRON_TOKEN, process.env.SHOP_INTERNAL_CRON_TOKEN, await getSetting('shop_cron_token', '')]
  let ok = false
  for (const c of candidates) if (c && safeEqual(given, String(c))) ok = true
  return ok
}

/** Zeitplan-Jobs ausführen: POST. Admin (SHOP_ORDERS_EDIT) oder Header x-shop-cron mit gültigem Token. */
export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    }
    const { ok, retryAfter } = limiter.check(req)
    if (!ok) {
      res.setHeader('Retry-After', String(retryAfter || 60))
      return res.status(429).json({ error: 'Zu viele Anfragen', code: 'RATE_LIMIT_EXCEEDED' })
    }

    const header = req.headers['x-shop-cron']
    if (header !== undefined) {
      if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
      if (!(await tokenMatches(Array.isArray(header) ? header[0] : header))) {
        return res.status(401).json({ error: 'Nicht autorisiert', code: 'UNAUTHORIZED' })
      }
    } else {
      const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_EDIT)
      if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
      if (!(await isShopEnabled())) {
        return res.status(403).json({ error: 'Add-on Shop nicht aktiviert', code: 'ADDON_DISABLED' })
      }
    }

    const result = await runShopJobs({ now: new Date() })
    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    console.error('[/api/shop/cron Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
