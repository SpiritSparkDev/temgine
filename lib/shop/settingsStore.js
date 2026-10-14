import { prisma } from '../prisma'
import { SHOP_KEY_PREFIX, SHOP_SETTING_DEFAULTS, SHOP_CURRENCIES, SHOP_LOCALES } from './keys'

/** Alle shop_*-Einstellungen inkl. Geheimnisse als { key: value } (nur serverseitig verwenden). */
export async function getShopSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: SHOP_KEY_PREFIX } } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

/** Einzelner Wert; leere Zeichenkette zählt als nicht gesetzt (Standardwert aus keys.js, sonst fallback). */
export async function getSetting(key, fallback = null) {
  const row = await prisma.setting.findUnique({ where: { key } })
  const v = row?.value
  if (v !== undefined && v !== null && v !== '') return v
  return SHOP_SETTING_DEFAULTS[key] !== undefined ? String(SHOP_SETTING_DEFAULTS[key]) : fallback
}

/** Ganzzahl-Einstellung (positiv); ungültige Werte ergeben den Standardwert bzw. fallback. */
export async function getNumberSetting(key, fallback = null) {
  return numberFrom(await getSetting(key, null), fallback)
}

/** Reine Hilfsfunktion: Zahl aus einem Einstellungswert (≥ 0, ganzzahlig) oder fallback. */
export function numberFrom(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

/** Währung des Shops (nur erlaubte ISO-Codes), Standard EUR. `settings` = Ergebnis von getShopSettings(). */
export function shopCurrency(settings = {}) {
  const c = String(settings.shop_currency || SHOP_SETTING_DEFAULTS.shop_currency).toUpperCase()
  return SHOP_CURRENCIES.includes(c) ? c : SHOP_SETTING_DEFAULTS.shop_currency
}

/** Standardsprache des Shops (de | en). */
export function shopLocale(settings = {}) {
  const l = String(settings.shop_default_locale || SHOP_SETTING_DEFAULTS.shop_default_locale).toLowerCase()
  return SHOP_LOCALES.includes(l) ? l : SHOP_SETTING_DEFAULTS.shop_default_locale
}

/** Absenderdaten für Rechnung und Mails (nur gesetzte Werte, nichts wird erfunden). */
export function sellerData(settings = {}) {
  const pick = (k) => String(settings[k] || '').trim()
  return {
    name: pick('shop_seller_name'),
    address: pick('shop_seller_address'),
    vatId: pick('shop_seller_vat_id'),
    taxNumber: pick('shop_seller_tax_number'),
    email: pick('shop_seller_email'),
    phone: pick('shop_seller_phone'),
    bank: pick('shop_seller_bank'),
    footer: pick('shop_seller_footer'),
    invoicePrefix: pick('shop_invoice_prefix') || SHOP_SETTING_DEFAULTS.shop_invoice_prefix,
  }
}
