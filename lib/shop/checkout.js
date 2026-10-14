// Kasse: Eingabevalidierung und Bestellnummer (rein, ohne Prisma). Vorbild: Polyfeder_Shop/src/Checkout.php

export const MAX_ITEMS = 50

const FIELD_MAX = { name: 100, street: 150, zip: 20, city: 100 }
const EMAIL_MAX = 200
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Einzelne Surrogate (kein gültiges UTF-8) und NUL
const BAD_CHARS = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|\u0000/

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const len = (s) => Array.from(s).length

function hasBadChars(v, depth = 0) {
  if (typeof v === 'string') return BAD_CHARS.test(v)
  if (depth > 6 || v === null || typeof v !== 'object') return false
  return Object.values(v).some((x) => hasBadChars(x, depth + 1))
}

/** Prefix: nur A-Z0-9 (Kleinbuchstaben werden groß), max. 8 Zeichen, Standard "ORD". */
export function normalizePrefix(value) {
  const p = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return p || 'ORD'
}

/** 'ORD-2026-000123' (Jahr in UTC, number auf 6 Stellen aufgefüllt). */
export function formatReference(prefix, date, number) {
  return `${normalizePrefix(prefix)}-${new Date(date).getUTCFullYear()}-${String(number).padStart(6, '0')}`
}

/** Positionen säubern: nur { sku, qty }; null bei mehr als MAX_ITEMS oder ungültigen Einträgen. */
export function sanitizeItems(items) {
  if (items === undefined || items === null) return []
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return null
  const out = []
  for (const it of items) {
    if (!isObj(it) || typeof it.sku !== 'string') return null
    out.push({ sku: it.sku.trim(), qty: it.qty })
  }
  return out
}

function readAddress(src, prefix, countries, errors) {
  const a = {}
  const s = isObj(src) ? src : {}
  for (const [f, max] of Object.entries(FIELD_MAX)) {
    const v = typeof s[f] === 'string' ? s[f].trim() : ''
    if (!v || len(v) > max) errors[`${prefix}.${f}`] = 'Bitte ausfüllen.'
    a[f] = v
  }
  a.country = typeof s.country === 'string' ? s.country.trim() : ''
  if (!Object.prototype.hasOwnProperty.call(countries || {}, a.country)) errors[`${prefix}.country`] = 'Bitte ein Land wählen.'
  return a
}

/**
 * @param {object} input Request-Body
 * @param {{countries: Object<string,string>}} opts code -> Name
 * @returns {{errors: Object<string,string>, data: {email, billing, shipping, acceptTerms, acceptWaiver}}}
 */
export function validateCheckoutInput(input, { countries } = {}) {
  const errors = {}
  const src = isObj(input) ? input : {}
  if (hasBadChars(src)) errors.input = 'Die Eingabe enthält ungültige Zeichen (UTF-8 erwartet).'

  const email = typeof src.email === 'string' ? src.email.trim() : ''
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) errors.email = 'Bitte eine gültige E-Mail-Adresse angeben.'

  const billing = readAddress(src.billing, 'billing', countries, errors)
  let shipping = billing
  if (src.shipping !== undefined && src.shipping !== null) {
    if (isObj(src.shipping)) shipping = readAddress(src.shipping, 'shipping', countries, errors)
    else errors.shipping = 'Ungültige Lieferadresse.'
  }

  if (src.acceptTerms !== true) errors.acceptTerms = 'Bitte AGB und Widerrufsbelehrung bestätigen.'

  return { errors, data: { email, billing, shipping, acceptTerms: src.acceptTerms === true, acceptWaiver: src.acceptWaiver === true } }
}
