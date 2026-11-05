// Preisberechnung (rein, kein Prisma): ganze Cent, brutto, Steuersatz in Hundertstel-Prozent. Port von Cart.php, v2 (SHOP_ADDON.md §7.5).
import { vatIncluded } from './money'
import { validateCoupon } from './coupons'

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

/** Staffelpreis: höchste Stufe mit minQty <= qty, sonst Basispreis. */
export function unitPriceFor(format, qty) {
  let price = format.priceCents
  let best = 0
  if (Array.isArray(format.priceTiers)) {
    for (const t of format.priceTiers) {
      if (Number.isInteger(t?.minQty) && Number.isInteger(t?.priceCents) && t.minQty <= qty && t.minQty > best) {
        best = t.minQty
        price = t.priceCents
      }
    }
  }
  return price
}

const availableOf = (f, reserved) => Math.max(0, f.stock - (reserved?.get?.(f.id) ?? 0))

/** Bündel auflösen: { bundle: [...], digital, weightG, available (null = unbegrenzt) } oder BUNDLE_INVALID. */
function resolveBundle(f, bySku, reserved) {
  const bundle = []
  let available = null
  let weight = 0
  let weightKnown = true
  for (const part of f.bundleItems) {
    const c = bySku.get(part?.sku)
    if (!c || (Array.isArray(c.bundleItems) && c.bundleItems.length) || !Number.isInteger(part.qty) || part.qty < 1) {
      throw err('BUNDLE_INVALID', `Bündel ${f.sku} ist ungültig.`, f.sku)
    }
    const digital = !!c.digital
    const weightG = digital ? null : c.weightG ?? null
    bundle.push({ formatId: c.id, sku: c.sku, title: c.product?.title ?? '', label: c.label, qty: part.qty, digital, weightG })
    if (!digital) {
      if (weightG == null) weightKnown = false
      else weight += weightG * part.qty
      if (c.stock != null) {
        const n = Math.floor(availableOf(c, reserved) / part.qty)
        available = available === null ? n : Math.min(available, n)
      }
    }
  }
  const digital = bundle.every((b) => b.digital)
  return { bundle, digital, weightG: digital || !weightKnown ? null : weight, available }
}

/** Rabatt nach größtem Rest auf die Zeilen verteilen (deterministisch, Summe exakt). */
function distribute(lines, discount, subtotal) {
  const total = BigInt(subtotal)
  const parts = lines.map((l, i) => {
    const num = BigInt(l.lineCents) * BigInt(discount)
    return { i, base: Number(num / total), rem: num % total }
  })
  let left = discount - parts.reduce((s, p) => s + p.base, 0)
  const order = [...parts].sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1))
  for (const p of order) {
    if (left <= 0) break
    p.base += 1
    left -= 1
  }
  parts.forEach((p) => { lines[p.i].discountCents = p.base })
}

/**
 * items [{ sku, qty }] + formats (ShopFormat-Zeilen inkl. product { title, active? }, auch Bündel-Bestandteile)
 * -> { lines, subtotalCents, discountCents, taxBreakdown (nur Positionen), hasPhysical, coupon }
 * reserved: Map<formatId, qty> (reservedByOthers); coupon: ShopCoupon-Zeile oder null.
 */
export function priceCart({ items, formats, reserved, coupon = null, now = new Date() }) {
  if (!Array.isArray(items) || items.length === 0) throw err('CART_EMPTY', 'Warenkorb ist leer.')
  const bySku = new Map((formats || []).map((f) => [f.sku, f]))
  const lines = []
  // Wiederholte SKUs zusammenfassen, damit Menge, Staffel und Bestand auf die Summe geprüft werden.
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
    let digital = !!f.digital
    let weightG = digital ? null : f.weightG ?? null
    let bundle = null
    let available = !digital && f.stock != null ? availableOf(f, reserved) : null
    if (Array.isArray(f.bundleItems) && f.bundleItems.length) {
      const r = resolveBundle(f, bySku, reserved)
      bundle = r.bundle
      digital = r.digital
      weightG = r.weightG
      available = r.available
    }
    if (!digital && available !== null && qty > available) throw err('STOCK_EXCEEDED', `Nicht genug Bestand für ${sku}.`, sku)
    const unitCents = unitPriceFor(f, qty)
    lines.push({
      formatId: f.id,
      sku,
      title: f.product?.title ?? '',
      label: f.label,
      qty,
      unitCents,
      lineCents: unitCents * qty,
      discountCents: 0,
      taxRateBp: f.taxRateBp,
      digital,
      weightG,
      bundle,
    })
  }
  // Gemeinsamer Bedarf pro Format (Einzelzeilen + Bündel-Bestandteile) gegen den verfügbaren Bestand.
  const need = new Map()
  const addNeed = (id, n) => need.set(id, (need.get(id) || 0) + n)
  for (const l of lines) {
    if (l.bundle) for (const b of l.bundle) { if (!b.digital) addNeed(b.formatId, b.qty * l.qty) }
    else if (!l.digital) addNeed(l.formatId, l.qty)
  }
  for (const f of bySku.values()) {
    if (f.stock != null && need.has(f.id) && need.get(f.id) > availableOf(f, reserved)) {
      throw err('STOCK_EXCEEDED', `Nicht genug Bestand für ${f.sku}.`, f.sku)
    }
  }
  const subtotalCents = lines.reduce((s, l) => s + l.lineCents, 0)
  let discountCents = 0
  let couponOut = null
  if (coupon) {
    validateCoupon(coupon, { subtotalCents, now })
    discountCents = coupon.type === 'PERCENT'
      ? Math.floor((subtotalCents * coupon.value + 5000) / 10000)
      : Math.min(coupon.value, subtotalCents)
    discountCents = Math.min(discountCents, subtotalCents)
    if (discountCents > 0) distribute(lines, discountCents, subtotalCents)
    couponOut = { code: coupon.code, type: coupon.type, value: coupon.value }
  }
  const taxBreakdown = {}
  for (const l of lines) taxBreakdown[l.taxRateBp] = (taxBreakdown[l.taxRateBp] || 0) + vatIncluded(l.lineCents - l.discountCents, l.taxRateBp)
  return { lines, subtotalCents, discountCents, taxBreakdown, hasPhysical: lines.some((l) => !l.digital), coupon: couponOut }
}

/**
 * Versand: { shippingCents, shippingTaxBp, freeShipping } oder ShopPricingError.
 * afterDiscountCents = Zwischensumme nach Rabatt (Vergleich mit shipping.freeShippingFromCents).
 */
export function quoteShipping(lines, shipping, country, afterDiscountCents = 0) {
  const physical = lines.filter((l) => !l.digital)
  if (physical.length === 0) return { shippingCents: 0, shippingTaxBp: null, freeShipping: false }
  const from = shipping?.freeShippingFromCents ?? null
  const free = from != null && afterDiscountCents >= from
  let weight = 0
  let weightMissing = null
  for (const l of physical) {
    if (l.weightG == null) weightMissing = weightMissing || l.sku
    else weight += l.weightG * l.qty
  }
  for (const zone of shipping?.zones || []) {
    if (!zone.countries.includes(country)) continue
    const taxBp = zone.taxRateBp ?? null
    if (free) return { shippingCents: 0, shippingTaxBp: taxBp, freeShipping: true }
    if (weightMissing) throw err('WEIGHT_UNKNOWN', `Gewicht unbekannt: ${weightMissing}`, weightMissing)
    const tier = zone.tiers.find((t) => weight <= t.maxG)
    if (tier) return { shippingCents: tier.priceCents, shippingTaxBp: taxBp, freeShipping: false }
    throw err('SHIPPING_UNAVAILABLE', 'Versandkosten für dieses Land noch nicht verfügbar.')
  }
  throw err('COUNTRY_UNSUPPORTED', 'Lieferland wird nicht unterstützt.')
}

/** Versand in Cent ohne Versandkostenfrei-Grenze; 0 bei reinen Digitalbestellungen. Wirft ShopPricingError. */
export function priceShipping(lines, shipping, country) {
  return quoteShipping(lines, { ...shipping, freeShippingFromCents: null }, country).shippingCents
}

/** Warenkorb + Versandangebot -> Gesamtergebnis (Versand-MwSt. im taxBreakdown unter demselben Satz). */
export function completeOrder(cart, quote, currency = 'EUR') {
  const { shippingCents, shippingTaxBp } = quote
  const taxBreakdown = { ...cart.taxBreakdown }
  if (shippingCents > 0 && shippingTaxBp != null) {
    taxBreakdown[shippingTaxBp] = (taxBreakdown[shippingTaxBp] || 0) + vatIncluded(shippingCents, shippingTaxBp)
  }
  return {
    ...cart,
    taxBreakdown,
    shippingCents,
    shippingTaxBp,
    totalCents: cart.subtotalCents - cart.discountCents + shippingCents,
    currency: currency || 'EUR',
  }
}

/** priceCart + Versand -> inkl. discountCents, shippingCents, shippingTaxBp, totalCents, coupon, currency */
export function priceOrder({ items, formats, shipping, country, coupon = null, reserved, currency = 'EUR', now }) {
  const cart = priceCart({ items, formats, reserved, coupon, now })
  const quote = quoteShipping(cart.lines, shipping, country, cart.subtotalCents - cart.discountCents)
  return completeOrder(cart, quote, currency)
}
