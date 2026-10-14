import { prisma } from '../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { logAudit } from '../../../lib/audit'
import { getShopStatus, setShopEnabled, isShopEnabled } from '../../../lib/shop/config'
import { ensureShopPages } from '../../../lib/shop/pages'
import {
  SHOP_NOTIFY_EMAIL_KEY, SHOP_ORDER_PREFIX_KEY, SHOP_SETTING_FIELDS, SHOP_SETTING_DEFAULTS,
  SHOP_CURRENCIES, SHOP_LOCALES, SHOP_CRON_TOKEN_KEY,
} from '../../../lib/shop/keys'
import { normalizePrefix } from '../../../lib/shop/checkout'
import { randomToken } from '../../../lib/shop/tokens'

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

// Textfelder: Label und maximale Länge (Zeichen)
const TEXT_LIMITS = {
  shop_seller_name: ['Name des Verkäufers', 100],
  shop_seller_address: ['Anschrift', 300],
  shop_seller_vat_id: ['USt-IdNr.', 30],
  shop_seller_tax_number: ['Steuernummer', 30],
  shop_seller_email: ['Verkäufer-E-Mail', 200],
  shop_seller_phone: ['Telefon', 40],
  shop_seller_bank: ['Bankverbindung', 300],
  shop_seller_footer: ['Rechnungsfußzeile', 500],
}

// Ganzzahlen: Label, Minimum, Maximum (leer = Standardwert bzw. aus/unbegrenzt)
const INT_LIMITS = {
  shop_low_stock_threshold: ['Schwelle Niedrigbestand', 0, 1000000],
  shop_reservation_minutes: ['Reservierungsdauer (Minuten)', 1, 1440],
  shop_pending_cleanup_days: ['Aufräumen unbezahlter Bestellungen (Tage)', 1, 365],
  shop_download_days: ['Gültigkeit der Download-Links (Tage)', 1, 3650],
  shop_download_max: ['Maximale Downloads je Link', 1, 1000],
  shop_return_days: ['Rückgabefrist (Tage)', 1, 3650],
}

const CRON_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/

/** Prüft die Einstellungswerte; liefert { errors: [Text], values: { key: String } } (nur übergebene bekannte Schlüssel). */
function validateShopSettings(input) {
  const errors = []
  const values = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: ['Einstellungen müssen ein Objekt sein'], values }
  for (const [key, raw] of Object.entries(input)) {
    const type = SHOP_SETTING_FIELDS[key]
    if (!type) { errors.push(`Unbekannte Einstellung „${key}“`); continue }
    if (raw !== null && typeof raw !== 'string' && typeof raw !== 'number') { errors.push(`${key}: ungültiger Wert`); continue }
    const v = raw === null ? '' : String(raw).replace(/\r\n/g, '\n').trim()
    if (TEXT_LIMITS[key]) {
      const [label, max] = TEXT_LIMITS[key]
      if (v.length > max) errors.push(`${label}: höchstens ${max} Zeichen`)
      else if (type !== 'multiline' && /[\r\n]/.test(v)) errors.push(`${label}: keine Zeilenumbrüche erlaubt`)
      else if (type === 'email' && v !== '' && !EMAIL_RE.test(v)) errors.push(`${label}: ungültige E-Mail-Adresse`)
      else values[key] = v
    } else if (INT_LIMITS[key]) {
      const [label, min, max] = INT_LIMITS[key]
      if (v === '') values[key] = ''
      else if (!/^\d{1,9}$/.test(v) || Number(v) < min || Number(v) > max) errors.push(`${label}: ganze Zahl von ${min} bis ${max} oder leer`)
      else values[key] = String(Number(v))
    } else if (key === 'shop_invoice_prefix') {
      const up = v.toUpperCase()
      if (up === '') values[key] = ''
      else if (!/^[A-Z0-9-]{1,10}$/.test(up)) errors.push('Rechnungspräfix: 1 bis 10 Zeichen aus A–Z, 0–9 und Bindestrich')
      else values[key] = up
    } else if (key === 'shop_currency') {
      const up = v.toUpperCase()
      if (up === '') values[key] = ''
      else if (!SHOP_CURRENCIES.includes(up)) errors.push(`Währung: erlaubt sind ${SHOP_CURRENCIES.join(', ')}`)
      else values[key] = up
    } else if (key === 'shop_default_locale') {
      const low = v.toLowerCase()
      if (low === '') values[key] = ''
      else if (!SHOP_LOCALES.includes(low)) errors.push(`Sprache: erlaubt sind ${SHOP_LOCALES.join(', ')}`)
      else values[key] = low
    }
  }
  return { errors, values }
}

/** Prüft die Zeitplan-Token-Aktion; liefert { error, action, value }. */
function parseCronToken(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Zeitplan-Token: ungültige Eingabe' }
  if (raw.action === 'generate') return { action: 'generate', value: randomToken(24) }
  if (raw.action === 'clear') return { action: 'clear', value: '' }
  if (raw.action === 'set') {
    const v = typeof raw.value === 'string' ? raw.value.trim() : ''
    if (!CRON_TOKEN_RE.test(v)) return { error: 'Zeitplan-Token: 16 bis 128 Zeichen aus A–Z, a–z, 0–9, _ und -' }
    return { action: 'set', value: v }
  }
  return { error: 'Zeitplan-Token: Aktion generate, set oder clear erwartet' }
}

const SETTING_KEYS = Object.keys(SHOP_SETTING_FIELDS)

async function readStatus() {
  const status = await getShopStatus()
  const rows = await prisma.setting.findMany({
    where: { key: { in: [SHOP_NOTIFY_EMAIL_KEY, SHOP_ORDER_PREFIX_KEY, SHOP_CRON_TOKEN_KEY, ...SETTING_KEYS] } },
  })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  // Wirksame Werte: gespeichert, sonst Standard, sonst leer. Das Zeitplan-Token wird nie ausgeliefert.
  const settings = {}
  for (const key of SETTING_KEYS) {
    const stored = map[key]
    settings[key] = stored !== undefined && stored !== null && stored !== '' ? stored : (SHOP_SETTING_DEFAULTS[key] !== undefined ? String(SHOP_SETTING_DEFAULTS[key]) : '')
  }
  return {
    ...status,
    notifyEmail: map[SHOP_NOTIFY_EMAIL_KEY] || '',
    orderPrefix: normalizePrefix(map[SHOP_ORDER_PREFIX_KEY]),
    settings,
    cronTokenSet: !!map[SHOP_CRON_TOKEN_KEY],
  }
}

const save = (key, value) => prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })

/**
 * Shop-Add-on: Status lesen und Einstellungen speichern. Nur Admins.
 * Gibt nie Zugangsdaten zurück, nur Flags (aktiviert / konfiguriert / Token gesetzt).
 * PUT { settings: { shop_*: Wert }, cronToken: { action: 'generate' | 'set' | 'clear', value? } }; ein neu
 * erzeugtes Token steht einmalig in der Antwort (generatedCronToken).
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
      const { enabled, notifyEmail, orderPrefix, ensurePages, settings: settingsInput, cronToken } = req.body || {}
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
      if (enabled === undefined && notifyEmail === undefined && orderPrefix === undefined && settingsInput === undefined && cronToken === undefined) {
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
      let values = {}
      if (settingsInput !== undefined) {
        const checked = validateShopSettings(settingsInput)
        if (checked.errors.length) {
          return res.status(422).json({ error: 'Einstellungen ungültig', code: 'VALIDATION_ERROR', details: { errors: checked.errors } })
        }
        values = checked.values
      }
      let cron
      if (cronToken !== undefined) {
        cron = parseCronToken(cronToken)
        if (cron.error) return res.status(422).json({ error: cron.error, code: 'VALIDATION_ERROR', details: { errors: [cron.error] } })
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
      for (const [key, value] of Object.entries(values)) await save(key, value)
      if (Object.keys(values).length) details.settings = Object.keys(values)
      if (cron) {
        await save(SHOP_CRON_TOKEN_KEY, cron.value)
        details.cronToken = cron.action // nie der Wert selbst
      }
      await logAudit({ action: 'shop.settings.update', resource: 'shop', resourceId: Object.keys(details).join(','), userId: auth.user.id, details })
      const out = await readStatus()
      if (cron && cron.action === 'generate') out.generatedCronToken = cron.value
      return res.status(200).json(out)
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
  } catch (e) {
    console.error('[/api/shop/settings Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
