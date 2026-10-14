/**
 * __tests__/shopPricing.test.js
 * Port von CartTest.php (Polyfeder-Prototyp).
 */
import { priceCart, priceShipping, priceOrder, ShopPricingError } from '../lib/shop/pricing'

const product = { title: 'G', active: true }
const fmts = () => [
  { id: 'f1', sku: 'HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, weightG: 800, stock: 3, digital: false, product },
  { id: 'f2', sku: 'PDF', label: 'PDF', priceCents: 1990, taxRateBp: 1900, weightG: null, stock: null, digital: true, product },
  { id: 'f3', sku: 'NOPRICE', label: 'x', priceCents: null, taxRateBp: null, weightG: 100, stock: null, digital: false, product },
  { id: 'f9', sku: 'FREE', label: 'gratis', priceCents: 0, taxRateBp: 700, weightG: 10, stock: null, digital: false, product },
  { id: 'f4', sku: 'NOW', label: 'ohne Gewicht', priceCents: 1000, taxRateBp: 700, weightG: null, stock: null, digital: false, product },
  { id: 'f5', sku: 'OLD', label: 'inaktiv', priceCents: 1000, taxRateBp: 700, weightG: 10, stock: null, digital: false, product: { title: 'Alt', active: false } },
  { id: 'f6', sku: 'BOOK19', label: 'Buch 19', priceCents: 1000, taxRateBp: 1900, weightG: 100, stock: null, digital: false, product },
  { id: 'f8', sku: 'ZERO', label: 'leer', priceCents: 100, taxRateBp: 700, weightG: 10, stock: 0, digital: false, product },
  { id: 'f7', sku: 'DPDF', label: 'PDF mit Bestand 0', priceCents: 500, taxRateBp: 700, weightG: null, stock: 0, digital: true, product },
]
const shipping = (tiers = [{ maxG: 1000, priceCents: 400 }, { maxG: 5000, priceCents: 900 }]) => ({
  zones: [
    { id: 'DE', countries: ['DE'], tiers },
    { id: 'EU', countries: ['AT'], tiers: [] },
  ],
})
const order = (items, country = 'DE', tiers) => priceOrder({ items, formats: fmts(), shipping: shipping(tiers), country })
const code = (fn) => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(ShopPricingError)
    return e
  }
  throw new Error('kein Fehler geworfen')
}

describe('priceOrder', () => {
  test('Summe, Versand, MwSt. je Satz', () => {
    const t = order([{ sku: 'HC', qty: 1 }, { sku: 'PDF', qty: 2 }])
    expect(t.subtotalCents).toBe(4990 + 3980)
    expect(t.shippingCents).toBe(400)
    expect(t.totalCents).toBe(4990 + 3980 + 400)
    expect(t.taxBreakdown).toEqual({ 700: 326, 1900: 635 })
    expect(t.hasPhysical).toBe(true)
    expect(t.lines[0]).toEqual({ formatId: 'f1', sku: 'HC', title: 'G', label: 'Hardcover', qty: 1, unitCents: 4990, lineCents: 4990, taxRateBp: 700, digital: false, weightG: 800 })
    expect(t.lines[1].weightG).toBeNull()
  })

  test('MwSt. wird pro Position gerundet und je Satz summiert', () => {
    const t = order([{ sku: 'BOOK19', qty: 1 }, { sku: 'HC', qty: 1 }, { sku: 'PDF', qty: 1 }])
    // 1000*1900/11900 = 159.66 -> 160; 1990*1900/11900 = 317.7 -> 318
    expect(t.taxBreakdown[1900]).toBe(160 + 318)
    expect(t.taxBreakdown[700]).toBe(326)
  })

  test('reiner Digital-Warenkorb: Versand 0, auch ohne Land und ohne Zonen', () => {
    expect(order([{ sku: 'PDF', qty: 1 }], 'AT', []).shippingCents).toBe(0)
    expect(order([{ sku: 'PDF', qty: 1 }], 'XX').shippingCents).toBe(0)
    expect(order([{ sku: 'PDF', qty: 1 }]).hasPhysical).toBe(false)
  })

  test('höhere Gewichtsstufe', () => {
    expect(order([{ sku: 'HC', qty: 2 }]).shippingCents).toBe(900)
    expect(order([{ sku: 'HC', qty: 1 }]).shippingCents).toBe(400)
  })

  test('Gewicht genau an der Stufengrenze gilt für diese Stufe', () => {
    const lines = priceCart({ items: [{ sku: 'HC', qty: 1 }], formats: fmts() }).lines
    expect(priceShipping(lines, shipping([{ maxG: 800, priceCents: 111 }]), 'DE')).toBe(111)
  })

  test('digitale Position zählt nicht zum Gewicht und hat Bestand 0 kein Problem', () => {
    expect(order([{ sku: 'HC', qty: 1 }, { sku: 'PDF', qty: 3 }]).shippingCents).toBe(400)
    expect(order([{ sku: 'DPDF', qty: 5 }]).totalCents).toBe(2500)
  })

  test.each([
    ['unbekannte SKU', [{ sku: 'NOPE', qty: 1 }], 'PRODUCT_UNKNOWN', 'NOPE'],
    ['inaktives Produkt', [{ sku: 'OLD', qty: 1 }], 'PRODUCT_UNKNOWN', 'OLD'],
    ['Menge 0', [{ sku: 'HC', qty: 0 }], 'QTY_INVALID', 'HC'],
    ['Menge 100', [{ sku: 'HC', qty: 100 }], 'QTY_INVALID', 'HC'],
    ['Menge nicht ganzzahlig', [{ sku: 'HC', qty: 1.5 }], 'QTY_INVALID', 'HC'],
    ['Menge als String', [{ sku: 'HC', qty: '1' }], 'QTY_INVALID', 'HC'],
    ['nicht bestellbar', [{ sku: 'NOPRICE', qty: 1 }], 'NOT_ORDERABLE', 'NOPRICE'],
    ['Preis 0', [{ sku: 'FREE', qty: 1 }], 'NOT_ORDERABLE', 'FREE'],
    ['Bestand überschritten', [{ sku: 'HC', qty: 4 }], 'STOCK_EXCEEDED', 'HC'],
    ['Bestand 0', [{ sku: 'ZERO', qty: 1 }], 'STOCK_EXCEEDED', 'ZERO'],
    ['leerer Warenkorb', [], 'CART_EMPTY', undefined],
  ])('Warenkorb-Fehler: %s', (_n, items, c, sku) => {
    const e = code(() => order(items))
    expect(e.code).toBe(c)
    expect(e.details.sku).toBe(sku)
    expect(e.message).toBeTruthy()
  })

  test('maximale Menge 99 ist erlaubt', () => {
    expect(order([{ sku: 'PDF', qty: 99 }]).subtotalCents).toBe(1990 * 99)
  })

  test('Zone ohne Stufen und Gewicht über allen Stufen: SHIPPING_UNAVAILABLE', () => {
    expect(code(() => order([{ sku: 'HC', qty: 1 }], 'AT')).code).toBe('SHIPPING_UNAVAILABLE')
    expect(code(() => order([{ sku: 'HC', qty: 3 }], 'DE', [{ maxG: 1000, priceCents: 1 }])).code).toBe('SHIPPING_UNAVAILABLE')
  })

  test('Land nicht unterstützt / fehlt', () => {
    expect(code(() => order([{ sku: 'HC', qty: 1 }], 'FR')).code).toBe('COUNTRY_UNSUPPORTED')
    expect(code(() => order([{ sku: 'HC', qty: 1 }], null)).code).toBe('COUNTRY_UNSUPPORTED')
  })

  test('Gewicht unbekannt', () => {
    const e = code(() => order([{ sku: 'NOW', qty: 1 }]))
    expect(e.code).toBe('WEIGHT_UNKNOWN')
    expect(e.details.sku).toBe('NOW')
  })

  test('priceCart allein wirft keine Versandfehler', () => {
    expect(priceCart({ items: [{ sku: 'NOW', qty: 1 }], formats: fmts() }).hasPhysical).toBe(true)
  })
})

describe('repeated SKUs', () => {
  const f = (over = {}) => ({ id: 'f1', sku: 'A', label: 'L', priceCents: 1000, taxRateBp: 700, weightG: 100, stock: 5, digital: false, product: { title: 'T', active: true }, ...over });

  test('are merged into one line and the stock check uses the sum', () => {
    const r = priceCart({ items: [{ sku: 'A', qty: 2 }, { sku: 'A', qty: 3 }], formats: [f()] });
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ qty: 5, lineCents: 5000 });
    expect(() => priceCart({ items: [{ sku: 'A', qty: 3 }, { sku: 'A', qty: 3 }], formats: [f()] })).toThrow(expect.objectContaining({ code: 'STOCK_EXCEEDED' }));
  });

  test('the merged quantity is limited to 99', () => {
    expect(() => priceCart({ items: [{ sku: 'A', qty: 60 }, { sku: 'A', qty: 60 }], formats: [f({ stock: null })] })).toThrow(expect.objectContaining({ code: 'QTY_INVALID' }));
  });
});
