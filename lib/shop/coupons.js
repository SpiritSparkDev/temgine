// Gutscheine: Eingabeprüfung (Admin), Einlösbarkeit, Lookup und idempotente Einlösung. Vertrag: docs/SHOP_ADDON.md §7.5.
import { prisma } from '../prisma'
import { ShopPricingError } from './pricing'

const CODE_RE = /^[A-Z0-9_-]{3,32}$/
const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max

/** Code groß schreiben und prüfen; ungültig -> null. */
export function normalizeCode(s) {
  const c = String(s ?? '').trim().toUpperCase()
  return CODE_RE.test(c) ? c : null
}

function readDate(v, label, errors) {
  if (v === undefined || v === null || v === '') return null
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v) : null
  if (!d || Number.isNaN(d.getTime())) {
    errors.push(`${label} muss ein ISO-Datum sein.`)
    return null
  }
  return d
}

/** Admin-Eingabe prüfen: { errors: [Text], data } (data nur ohne Fehler verwenden). */
export function validateCouponInput(input) {
  const errors = []
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const code = normalizeCode(src.code)
  if (!code) errors.push('Code muss 3–32 Zeichen lang sein (A–Z, 0–9, _ und -).')
  const type = src.type
  if (type !== 'PERCENT' && type !== 'FIXED') errors.push('Art muss PERCENT oder FIXED sein.')
  const value = src.value
  if (type === 'PERCENT' && !isInt(value, 1, 10000)) errors.push('Prozentwert muss eine ganze Zahl von 1 bis 10000 (Basispunkte) sein.')
  else if (type === 'FIXED' && !isInt(value, 1, 9999999)) errors.push('Betrag muss eine ganze Zahl von 1 bis 9999999 Cent sein.')
  else if (type !== 'PERCENT' && type !== 'FIXED' && !Number.isInteger(value)) errors.push('Wert muss eine ganze Zahl sein.')

  let minOrderCents = null
  if (src.minOrderCents !== undefined && src.minOrderCents !== null) {
    if (isInt(src.minOrderCents, 0, 9999999)) minOrderCents = src.minOrderCents
    else errors.push('Mindestbestellwert muss eine ganze Zahl von 0 bis 9999999 Cent sein.')
  }
  let maxUses = null
  if (src.maxUses !== undefined && src.maxUses !== null) {
    if (isInt(src.maxUses, 1, 1000000)) maxUses = src.maxUses
    else errors.push('Maximale Einlösungen müssen eine ganze Zahl von 1 bis 1000000 sein.')
  }
  const validFrom = readDate(src.validFrom, 'Gültig ab', errors)
  const validUntil = readDate(src.validUntil, 'Gültig bis', errors)
  if (validFrom && validUntil && validUntil < validFrom) errors.push('Gültig bis liegt vor Gültig ab.')

  if (src.active !== undefined && typeof src.active !== 'boolean') errors.push('active muss true oder false sein.')
  let note = null
  if (src.note !== undefined && src.note !== null && src.note !== '') {
    if (typeof src.note !== 'string' || src.note.length > 200) errors.push('Notiz darf höchstens 200 Zeichen lang sein.')
    else note = src.note.trim() || null
  }
  return { errors, data: { code, type, value, minOrderCents, maxUses, validFrom, validUntil, active: src.active !== false, note } }
}

/** Gutschein einlösbar? Wirft ShopPricingError (COUPON_INVALID | COUPON_EXPIRED | COUPON_EXHAUSTED | COUPON_MIN_ORDER). */
export function validateCoupon(row, { subtotalCents = 0, now = new Date() } = {}) {
  const details = { code: row?.code }
  if (!row || row.active === false) throw new ShopPricingError('COUPON_INVALID', 'Gutscheincode ist ungültig.', details)
  if (row.validFrom && new Date(row.validFrom) > now) throw new ShopPricingError('COUPON_INVALID', 'Gutscheincode ist noch nicht gültig.', details)
  if (row.validUntil && new Date(row.validUntil) < now) throw new ShopPricingError('COUPON_EXPIRED', 'Gutscheincode ist abgelaufen.', details)
  if (row.maxUses != null && row.usedCount >= row.maxUses) throw new ShopPricingError('COUPON_EXHAUSTED', 'Gutscheincode wurde bereits zu oft eingelöst.', details)
  if (row.minOrderCents != null && subtotalCents < row.minOrderCents) {
    throw new ShopPricingError('COUPON_MIN_ORDER', 'Der Mindestbestellwert für diesen Gutschein ist nicht erreicht.', { ...details, minOrderCents: row.minOrderCents })
  }
}

/** Zeile zum Code (normalisiert) oder null. */
export async function findCoupon(code) {
  const c = normalizeCode(code)
  if (!c) return null
  return prisma.shopCoupon.findUnique({ where: { code: c } })
}

/** Leer -> null; unbekannter/ungültiger Code -> ShopPricingError COUPON_INVALID, sonst die Zeile. */
export async function lookupCoupon(raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return null
  const row = await findCoupon(text)
  if (!row) throw new ShopPricingError('COUPON_INVALID', 'Gutscheincode ist ungültig.', { code: text.slice(0, 32) })
  return row
}

/** Einlösung genau einmal je Bestellung zählen -> true, wenn dieser Aufruf gezählt hat. */
export async function recordCouponUse(orderId, code) {
  const c = normalizeCode(code)
  if (!orderId || !c) return false
  return prisma.$transaction(async (tx) => {
    const coupon = await tx.shopCoupon.findUnique({ where: { code: c } })
    if (!coupon) return false
    // skipDuplicates statt Unique-Fehler: ein Fehler würde die Postgres-Transaktion abbrechen.
    const r = await tx.shopCouponUse.createMany({ data: [{ couponId: coupon.id, orderId }], skipDuplicates: true })
    if (r.count === 0) return false
    await tx.shopCoupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } })
    return true
  })
}

const iso = (d) => (d ? new Date(d).toISOString() : null)

/** Zeile -> Admin-JSON (Datumswerte als ISO-Text). */
export function toAdminCoupon(row) {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.value,
    minOrderCents: row.minOrderCents ?? null,
    maxUses: row.maxUses ?? null,
    usedCount: row.usedCount ?? 0,
    validFrom: iso(row.validFrom),
    validUntil: iso(row.validUntil),
    active: row.active !== false,
    note: row.note ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}
