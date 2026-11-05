/**
 * __tests__/shopPricing.test.js
 * Port von CartTest.php (Polyfeder-Prototyp).
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }))
import { priceCart, priceShipping, priceOrder, quoteShipping, ShopPricingError } from '../lib/shop/pricing'

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
    expect(t.lines[0]).toEqual({ formatId: 'f1', sku: 'HC', title: 'G', label: 'Hardcover', qty: 1, unitCents: 4990, lineCents: 4990, discountCents: 0, taxRateBp: 700, digital: false, weightG: 800, bundle: null })
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

// ---- v2: Staffelpreise, Bündel, Gutscheine, Versand-MwSt., Versandkostenfrei, Reservierung, Währung
const F = (o) => ({ id: o.sku, label: 'L', priceCents: 1000, taxRateBp: 700, weightG: 100, stock: null, digital: false, product: { title: 'T-' + o.sku, active: true }, ...o })
const price = (items, formats, extra = {}) => priceOrder({
  items, formats, shipping: { zones: [{ id: 'DE', countries: ['DE'], taxRateBp: null, tiers: [{ maxG: 100000, priceCents: 500 }] }] }, country: 'DE', ...extra,
})
const pct = (value, over = {}) => ({ code: 'P', type: 'PERCENT', value, usedCount: 0, active: true, ...over })
const fixed = (value, over = {}) => ({ code: 'P', type: 'FIXED', value, usedCount: 0, active: true, ...over })
const consistent = (r) => {
  expect(r.subtotalCents - r.discountCents + r.shippingCents).toBe(r.totalCents)
  expect(r.lines.reduce((s, l) => s + l.discountCents, 0)).toBe(r.discountCents)
  expect(r.lines.reduce((s, l) => s + l.lineCents, 0)).toBe(r.subtotalCents)
}

describe('Staffelpreise', () => {
  const t = F({ sku: 'T', priceCents: 1000, priceTiers: [{ minQty: 10, priceCents: 800 }, { minQty: 3, priceCents: 900 }] })
  test.each([[1, 1000], [2, 1000], [3, 900], [9, 900], [10, 800], [99, 800]])('Menge %i -> %i Cent', (q, unit) => {
    const r = price([{ sku: 'T', qty: q }], [t])
    expect(r.lines[0].unitCents).toBe(unit)
    expect(r.lines[0].lineCents).toBe(unit * q)
  })
  test('Menge je SKU wird summiert', () => {
    expect(price([{ sku: 'T', qty: 2 }, { sku: 'T', qty: 1 }], [t]).lines[0].unitCents).toBe(900)
  })
})

describe('Bündel', () => {
  const book = F({ sku: 'BOOK', stock: 10, weightG: 500 })
  const pdf = F({ sku: 'PDF', digital: true, weightG: null })
  const bundle = (items, o = {}) => F({ sku: 'SET', priceCents: 2500, taxRateBp: 700, stock: null, weightG: null, bundleItems: items, ...o })
  test('eigener Preis, Gewicht aus Bestandteilen, Snapshot', () => {
    const r = price([{ sku: 'SET', qty: 2 }], [bundle([{ sku: 'BOOK', qty: 2 }, { sku: 'PDF', qty: 1 }]), book, pdf])
    expect(r.lines[0]).toMatchObject({ unitCents: 2500, lineCents: 5000, digital: false, weightG: 1000 })
    expect(r.lines[0].bundle).toEqual([
      { formatId: 'BOOK', sku: 'BOOK', title: 'T-BOOK', label: 'L', qty: 2, digital: false, weightG: 500 },
      { formatId: 'PDF', sku: 'PDF', title: 'T-PDF', label: 'L', qty: 1, digital: true, weightG: null },
    ])
    expect(r.shippingCents).toBe(500)
  })
  test('rein digitales Bündel ist digital und versandfrei', () => {
    const r = price([{ sku: 'SET', qty: 1 }], [bundle([{ sku: 'PDF', qty: 1 }]), pdf])
    expect(r.lines[0]).toMatchObject({ digital: true, weightG: null })
    expect(r.shippingCents).toBe(0)
    expect(r.hasPhysical).toBe(false)
  })
  test('Bestand: kleinster Wert der Bestandteile, abzüglich Reservierung', () => {
    const f = [bundle([{ sku: 'BOOK', qty: 2 }]), book]
    expect(price([{ sku: 'SET', qty: 5 }], f).totalCents).toBe(12500 + 500)
    expect(code(() => price([{ sku: 'SET', qty: 6 }], f)).code).toBe('STOCK_EXCEEDED')
    expect(code(() => price([{ sku: 'SET', qty: 4 }], f, { reserved: new Map([['BOOK', 3]]) })).code).toBe('STOCK_EXCEEDED') // (10-3)/2 = 3
    expect(price([{ sku: 'SET', qty: 3 }], f, { reserved: new Map([['BOOK', 3]]) }).lines[0].qty).toBe(3)
  })
  test('Bestandteil ohne Gewicht: WEIGHT_UNKNOWN; unbegrenzt ohne Bestandsgrenze', () => {
    const noW = F({ sku: 'BOOK', weightG: null })
    expect(code(() => price([{ sku: 'SET', qty: 1 }], [bundle([{ sku: 'BOOK', qty: 1 }]), noW])).code).toBe('WEIGHT_UNKNOWN')
    expect(price([{ sku: 'SET', qty: 99 }], [bundle([{ sku: 'BOOK', qty: 1 }]), F({ sku: 'BOOK', stock: null })]).lines[0].qty).toBe(99)
  })
  test('Bestand gemeinsam: Bündel + Einzelzeile desselben Bestandteils', () => {
    const f = [bundle([{ sku: 'BOOK', qty: 2 }]), book] // Bestand 10
    expect(price([{ sku: 'SET', qty: 4 }, { sku: 'BOOK', qty: 2 }], f).lines).toHaveLength(2) // 8 + 2
    const e = code(() => price([{ sku: 'SET', qty: 4 }, { sku: 'BOOK', qty: 3 }], f)) // 8 + 3 > 10
    expect(e.code).toBe('STOCK_EXCEEDED')
    expect(e.details.sku).toBe('BOOK')
  })
  test('BUNDLE_INVALID: Bestandteil fehlt, verschachtelt, Menge ungültig', () => {
    expect(code(() => price([{ sku: 'SET', qty: 1 }], [bundle([{ sku: 'GONE', qty: 1 }])])).code).toBe('BUNDLE_INVALID')
    const inner = bundle([{ sku: 'BOOK', qty: 1 }], { sku: 'IN' })
    expect(code(() => price([{ sku: 'SET', qty: 1 }], [bundle([{ sku: 'IN', qty: 1 }]), inner, book])).code).toBe('BUNDLE_INVALID')
    expect(code(() => price([{ sku: 'SET', qty: 1 }], [bundle([{ sku: 'BOOK', qty: 0 }]), book])).code).toBe('BUNDLE_INVALID')
  })
})

describe('Verfügbarer Bestand = stock - reserved', () => {
  const f = [F({ sku: 'A', stock: 5 })]
  test('Reservierung anderer verringert den Bestand', () => {
    expect(price([{ sku: 'A', qty: 3 }], f, { reserved: new Map([['A', 2]]) }).lines[0].qty).toBe(3)
    expect(code(() => price([{ sku: 'A', qty: 4 }], f, { reserved: new Map([['A', 2]]) })).code).toBe('STOCK_EXCEEDED')
    expect(code(() => price([{ sku: 'A', qty: 1 }], f, { reserved: new Map([['A', 9]]) })).code).toBe('STOCK_EXCEEDED')
  })
})

describe('Gutscheine', () => {
  test('Prozent: ganzzahlig gerundet, MwSt. auf den Betrag nach Rabatt', () => {
    const r = price([{ sku: 'A', qty: 1 }], [F({ sku: 'A', priceCents: 1990, taxRateBp: 1900 })], { coupon: pct(1000) })
    expect(r.discountCents).toBe(199)
    expect(r.lines[0].discountCents).toBe(199)
    expect(r.taxBreakdown[1900]).toBe(Math.round(((1990 - 199) * 1900) / 11900))
    expect(r.coupon).toEqual({ code: 'P', type: 'PERCENT', value: 1000 })
    consistent(r)
  })
  test('Festbetrag wird auf die Zwischensumme gedeckelt', () => {
    const r = price([{ sku: 'A', qty: 1 }], [F({ sku: 'A', priceCents: 700 })], { coupon: fixed(5000) })
    expect(r.discountCents).toBe(700)
    expect(r.totalCents).toBe(500)
    consistent(r)
  })
  test('Verteilung nach größtem Rest: Summe exakt, deterministisch', () => {
    const fm = [F({ sku: 'A', priceCents: 333 }), F({ sku: 'B', priceCents: 333 }), F({ sku: 'C', priceCents: 334 })]
    const items = [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 1 }, { sku: 'C', qty: 1 }]
    const r = price(items, fm, { coupon: fixed(100) })
    expect(r.lines.map((l) => l.discountCents)).toEqual([33, 33, 34])
    consistent(r)
    const r2 = price(items, fm, { coupon: fixed(1) })
    expect(r2.lines.map((l) => l.discountCents)).toEqual([0, 0, 1])
    consistent(r2)
    const r3 = price(items, fm, { coupon: fixed(2) })
    expect(r3.lines.map((l) => l.discountCents)).toEqual([1, 0, 1])
    consistent(r3)
  })
  test('gemischte Steuersätze: MwSt. je Zeile auf den Restbetrag', () => {
    const fm = [F({ sku: 'A', priceCents: 1000, taxRateBp: 700 }), F({ sku: 'B', priceCents: 3000, taxRateBp: 1900 })]
    const r = price([{ sku: 'A', qty: 1 }, { sku: 'B', qty: 1 }], fm, { coupon: pct(2500) })
    expect(r.lines.map((l) => l.discountCents)).toEqual([250, 750])
    expect(r.taxBreakdown).toEqual({ 700: Math.round((750 * 700) / 10700), 1900: Math.round((2250 * 1900) / 11900) })
    consistent(r)
  })
  test.each([
    ['inaktiv', pct(500, { active: false }), 'COUPON_INVALID'],
    ['noch nicht gültig', pct(500, { validFrom: new Date(Date.now() + 86400000) }), 'COUPON_INVALID'],
    ['abgelaufen', pct(500, { validUntil: new Date(Date.now() - 1000) }), 'COUPON_EXPIRED'],
    ['aufgebraucht', pct(500, { maxUses: 3, usedCount: 3 }), 'COUPON_EXHAUSTED'],
    ['Mindestbestellwert', pct(500, { minOrderCents: 1001 }), 'COUPON_MIN_ORDER'],
  ])('Gutschein %s', (_n, c, expected) => {
    const e = code(() => price([{ sku: 'A', qty: 1 }], [F({ sku: 'A' })], { coupon: c }))
    expect(e.code).toBe(expected)
    expect(e.details.code).toBe('P')
  })
  test('Mindestbestellwert genau erreicht gilt', () => {
    expect(price([{ sku: 'A', qty: 1 }], [F({ sku: 'A' })], { coupon: pct(500, { minOrderCents: 1000 }) }).discountCents).toBe(50)
  })
  test('ohne Gutschein: discountCents 0, coupon null', () => {
    const r = price([{ sku: 'A', qty: 1 }], [F({ sku: 'A' })])
    expect(r).toMatchObject({ discountCents: 0, coupon: null, currency: 'EUR' })
  })
})

describe('Versand: MwSt., Versandkostenfrei, Währung', () => {
  const shipCfg = (o = {}) => ({ freeShippingFromCents: null, zones: [{ id: 'DE', countries: ['DE'], taxRateBp: 1900, tiers: [{ maxG: 100000, priceCents: 500 }] }], ...o })
  const run = (items, formats, shipping, extra = {}) => priceOrder({ items, formats, shipping, country: 'DE', ...extra })
  test('Versand-MwSt. aus der Zone fließt in taxBreakdown unter demselben Satz', () => {
    const r = run([{ sku: 'A', qty: 1 }], [F({ sku: 'A', taxRateBp: 1900 })], shipCfg())
    expect(r.shippingTaxBp).toBe(1900)
    expect(r.taxBreakdown[1900]).toBe(Math.round((1000 * 1900) / 11900) + Math.round((500 * 1900) / 11900))
    consistent(r)
  })
  test('Zone ohne Satz: shippingTaxBp null, keine Versand-MwSt.', () => {
    const r = run([{ sku: 'A', qty: 1 }], [F({ sku: 'A' })], shipCfg({ zones: [{ id: 'DE', countries: ['DE'], taxRateBp: null, tiers: [{ maxG: 9999, priceCents: 500 }] }] }))
    expect(r.shippingTaxBp).toBeNull()
    expect(r.taxBreakdown).toEqual({ 700: Math.round((1000 * 700) / 10700) })
  })
  test('Satz 0 ist ein gesetzter Satz', () => {
    const r = run([{ sku: 'A', qty: 1 }], [F({ sku: 'A' })], shipCfg({ zones: [{ id: 'DE', countries: ['DE'], taxRateBp: 0, tiers: [{ maxG: 9999, priceCents: 500 }] }] }))
    expect(r.shippingTaxBp).toBe(0)
  })
  test('Versandkostenfrei: Vergleich mit der Zwischensumme nach Rabatt', () => {
    const fm = [F({ sku: 'A', priceCents: 2000 })]
    const it = [{ sku: 'A', qty: 1 }]
    expect(run(it, fm, shipCfg({ freeShippingFromCents: 2000 })).shippingCents).toBe(0)
    expect(run(it, fm, shipCfg({ freeShippingFromCents: 2001 })).shippingCents).toBe(500)
    const withCoupon = run(it, fm, shipCfg({ freeShippingFromCents: 2000 }), { coupon: pct(1000) })
    expect(withCoupon.shippingCents).toBe(500)
    expect(withCoupon.totalCents).toBe(1800 + 500)
    const free = run(it, fm, shipCfg({ freeShippingFromCents: 2000 }))
    expect(free.taxBreakdown[700]).toBe(Math.round((2000 * 700) / 10700))
  })
  test('Versandkostenfrei umgeht Tarif- und Gewichtsfehler, nicht aber ein unbekanntes Land', () => {
    const cfg = shipCfg({ freeShippingFromCents: 1000, zones: [{ id: 'DE', countries: ['DE'], taxRateBp: null, tiers: [] }] })
    expect(run([{ sku: 'A', qty: 1 }], [F({ sku: 'A', weightG: null })], cfg).shippingCents).toBe(0)
    expect(code(() => priceOrder({ items: [{ sku: 'A', qty: 1 }], formats: [F({ sku: 'A' })], shipping: cfg, country: 'FR' })).code).toBe('COUNTRY_UNSUPPORTED')
  })
  test('Digitalbestellung bleibt 0 und ohne Versand-MwSt.', () => {
    const q = quoteShipping(priceCart({ items: [{ sku: 'P', qty: 1 }], formats: [F({ sku: 'P', digital: true })] }).lines, shipCfg({ freeShippingFromCents: 1 }), 'DE', 5000)
    expect(q).toEqual({ shippingCents: 0, shippingTaxBp: null, freeShipping: false })
  })
  test('priceShipping ignoriert die Versandkostenfrei-Grenze (Altvertrag)', () => {
    const lines = priceCart({ items: [{ sku: 'A', qty: 1 }], formats: [F({ sku: 'A' })] }).lines
    expect(priceShipping(lines, shipCfg({ freeShippingFromCents: 1 }), 'DE')).toBe(500)
  })
  test('Währung wird durchgereicht, Standard EUR', () => {
    const fm = [F({ sku: 'A' })]
    expect(run([{ sku: 'A', qty: 1 }], fm, shipCfg(), { currency: 'CHF' }).currency).toBe('CHF')
    expect(run([{ sku: 'A', qty: 1 }], fm, shipCfg()).currency).toBe('EUR')
  })
})
