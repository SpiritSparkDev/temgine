// Preisberechnung (rein, kein Prisma): Cent, brutto, Steuersatz in Hundertstel-Prozent. Port von Cart.php.
import { vatIncluded } from './money'

export const MAX_QTY = 99

export class ShopPricingError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ShopPricingError'
    this.code = code
    this.details = details
  }
}

const err = (code, message, sku) => new ShopPricingError(code, message, sku ? { sku } : {})

/** items [{ sku, qty }] + formats (ShopFormat-Zeilen inkl. product { title, active? }) -> { lines, subtotalCents, taxBreakdown, hasPhysical } */
export function priceCart({ items, formats }) {
  if (!Array.isArray(items) || items.length === 0) throw err('CART_EMPTY', 'Warenkorb ist leer.')
  const bySku = new Map((formats || []).map((f) => [f.sku, f]))
  const lines = []
  // Wiederholte SKUs zusammenfassen, damit Menge und Bestand auf die Summe geprüft werden.
  const merged = new Map()
  for (const item of items) {
    const sku = String(item?.sku ?? '')
    const qty = item?.qty
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw err('QTY_INVALID', `Ungültige Menge für ${sku}.`, sku)
    merged.set(sku, (merged.get(sku) || 0) + qty)
  }
  for (const [sku, qty] of merged) {
    if (qty > MAX_QTY) throw err('QTY_INVALID', `Ungültige Menge für ${sku}.`, sku)
    const f = bySku.get(sku)
    if (!f || f.product?.active === false) throw err('PRODUCT_UNKNOWN', `Unbekanntes Produkt: ${sku}.`, sku)
    if (!(f.priceCents > 0) || f.taxRateBp == null) throw err('NOT_ORDERABLE', `Nicht bestellbar: ${sku}.`, sku)
    const digital = !!f.digital
    if (!digital && f.stock != null && qty > f.stock) throw err('STOCK_EXCEEDED', `Nicht genug Bestand für ${sku}.`, sku)
    lines.push({
      formatId: f.id,
      sku,
      title: f.product?.title ?? '',
      label: f.label,
      qty,
      unitCents: f.priceCents,
      lineCents: f.priceCents * qty,
      taxRateBp: f.taxRateBp,
      digital,
      weightG: digital ? null : f.weightG ?? null,
    })
  }
  const taxBreakdown = {}
  for (const l of lines) taxBreakdown[l.taxRateBp] = (taxBreakdown[l.taxRateBp] || 0) + vatIncluded(l.lineCents, l.taxRateBp)
  return {
    lines,
    subtotalCents: lines.reduce((s, l) => s + l.lineCents, 0),
    taxBreakdown,
    hasPhysical: lines.some((l) => !l.digital),
  }
}

/** Versand in Cent; 0 bei reinen Digitalbestellungen. Wirft ShopPricingError. */
export function priceShipping(lines, shipping, country) {
  const physical = lines.filter((l) => !l.digital)
  if (physical.length === 0) return 0
  let weight = 0
  for (const l of physical) {
    if (l.weightG == null) throw err('WEIGHT_UNKNOWN', `Gewicht unbekannt: ${l.sku}`, l.sku)
    weight += l.weightG * l.qty
  }
  for (const zone of shipping?.zones || []) {
    if (!zone.countries.includes(country)) continue
    const tier = zone.tiers.find((t) => weight <= t.maxG)
    if (tier) return tier.priceCents
    throw err('SHIPPING_UNAVAILABLE', 'Versandkosten für dieses Land noch nicht verfügbar.')
  }
  throw err('COUNTRY_UNSUPPORTED', 'Lieferland wird nicht unterstützt.')
}

/** priceCart + priceShipping -> inkl. shippingCents, totalCents */
export function priceOrder({ items, formats, shipping, country }) {
  const cart = priceCart({ items, formats })
  const shippingCents = priceShipping(cart.lines, shipping, country)
  return { ...cart, shippingCents, totalCents: cart.subtotalCents + shippingCents }
}
