import { prisma } from '../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { logAudit } from '../../../lib/audit'
import { requireShopEnabled } from '../../../lib/shop/guard'
import { SHOP_PROVIDERS, providerEnabledKey } from '../../../lib/shop/keys'

const MAX_LEN = 500

async function readValues() {
  const keys = Object.keys(SHOP_PROVIDERS).flatMap((id) => [providerEnabledKey(id), ...SHOP_PROVIDERS[id].fields.map((f) => f.key)])
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

/** Ansicht für den Admin: Geheimnisse nur als set true/false. */
async function view() {
  const map = await readValues()
  const providers = {}
  for (const [id, p] of Object.entries(SHOP_PROVIDERS)) {
    providers[id] = {
      label: p.label,
      enabled: map[providerEnabledKey(id)] === 'true',
      configured: p.requiredKeys.every((k) => !!map[k]),
      fields: p.fields.map((f) => {
        const out = { key: f.key, label: f.label, secret: !!f.secret, set: !!map[f.key] }
        if (f.options) out.options = f.options
        if (!f.secret) out.value = map[f.key] || ''
        return out
      }),
    }
  }
  return { providers }
}

export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_SETTINGS)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method === 'GET') return res.status(200).json(await view())

    if (req.method === 'PUT') {
      const incoming = req.body?.providers
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return res.status(422).json({ error: 'Ungültige Anfrage', code: 'VALIDATION_ERROR', details: { errors: ['providers fehlt'] } })
      }
      const errors = []
      const writes = [] // [key, value]
      for (const [id, p] of Object.entries(incoming)) {
        const def = SHOP_PROVIDERS[id]
        if (!def) { errors.push(`Unbekannter Anbieter: ${id}`); continue }
        if (p?.enabled !== undefined) {
          if (typeof p.enabled !== 'boolean') { errors.push(`${def.label}: „Aktiv“ muss ein Schalter sein.`); continue }
          writes.push([providerEnabledKey(id), p.enabled ? 'true' : 'false'])
        }
        for (const [key, raw] of Object.entries(p?.values || {})) {
          const f = def.fields.find((x) => x.key === key)
          if (!f) { errors.push(`${def.label}: Unbekanntes Feld ${key}`); continue }
          const v = String(raw ?? '').trim()
          if (f.secret && !v) continue // leer = Wert behalten
          if (v.length > MAX_LEN) { errors.push(`${f.label}: höchstens ${MAX_LEN} Zeichen.`); continue }
          if (f.options && !f.options.includes(v)) { errors.push(`${f.label}: ungültiger Wert.`); continue }
          writes.push([key, v])
        }
      }
      if (errors.length) return res.status(422).json({ error: 'Ungültige Zahlungseinstellungen', code: 'VALIDATION_ERROR', details: { errors } })

      for (const [key, value] of writes) {
        await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
      }
      await logAudit({ action: 'shop.payments.update', resource: 'shop', resourceId: 'payments', userId: auth.user.id, details: { keys: writes.map(([k]) => k) } })
      return res.status(200).json(await view())
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
  } catch (e) {
    console.error('[/api/shop/payments Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
