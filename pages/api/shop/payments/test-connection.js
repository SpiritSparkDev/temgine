import { prisma } from '../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../lib/auth'
import { requireShopEnabled } from '../../../../lib/shop/guard'
import { SHOP_PROVIDERS } from '../../../../lib/shop/keys'
import { getProvider } from '../../../../lib/shop/providers'

/** Verbindungstest; nicht gespeicherte Eingaben haben Vorrang vor gespeicherten Werten. Antwortet immer 200. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_SETTINGS)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    const id = req.body?.provider
    const def = SHOP_PROVIDERS[id]
    if (!def) return res.status(200).json({ ok: false, error: 'Unbekannter Anbieter' })

    const keys = def.fields.map((f) => f.key)
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    const input = req.body?.values && typeof req.body.values === 'object' ? req.body.values : {}
    for (const k of keys) {
      const v = String(input[k] ?? '').trim().slice(0, 500)
      if (v) settings[k] = v
    }

    try {
      const r = await getProvider(id).testConnection({ settings })
      return res.status(200).json(r?.ok ? { ok: true, ...(r.info ? { info: String(r.info) } : {}) } : { ok: false, error: String(r?.error || 'Verbindung fehlgeschlagen') })
    } catch (e) {
      console.error('[shop payments test]', id, e?.status || '', e?.name || '')
      return res.status(200).json({ ok: false, error: 'Verbindung fehlgeschlagen. Bitte Zugangsdaten prüfen.' })
    }
  } catch (e) {
    console.error('[/api/shop/payments/test-connection Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
