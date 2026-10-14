/**
 * __tests__/api/shopCartApi.test.js
 * GET /api/shop/cart und GET /api/shop/public/config
 */
jest.disableAutomock()

const mockPrisma = {
  setting: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  shopFormat: { findMany: jest.fn() },
  shopCoupon: { findUnique: jest.fn() },
}
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
const mockReserved = jest.fn()
jest.mock('../../lib/shop/reservations', () => ({ reservedByOthers: (...a) => mockReserved(...a) }))

const cart = require('../../pages/api/shop/cart').default
const config = require('../../pages/api/shop/public/config').default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}
const product = { title: 'Dark Space', active: true }
const HC = { id: 'f1', sku: 'DS-HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, weightG: 800, stock: 5, digital: false, product }
const PDF = { id: 'f2', sku: 'DS PDF', label: 'PDF', priceCents: 1990, taxRateBp: 1900, weightG: null, stock: null, digital: true, product }
const SHIPPING = {
  countries: { DE: 'Deutschland', AT: 'Österreich' },
  zones: [
    { id: 'DE', name: 'DE', countries: ['DE'], tiers: [{ maxG: 1000, priceCents: 400 }] },
    { id: 'EU', name: 'EU', countries: ['AT'], tiers: [] },
  ],
}
let shippingRow
beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.setting.findMany.mockResolvedValue([])
  mockReserved.mockResolvedValue(new Map())
  mockPrisma.shopCoupon.findUnique.mockResolvedValue(null)
  shippingRow = { value: JSON.stringify(SHIPPING) }
  mockPrisma.setting.findUnique.mockImplementation(async ({ where }) => (where.key === 'shop_enabled' ? { value: 'true' } : shippingRow))
  mockPrisma.shopFormat.findMany.mockImplementation(async ({ where }) => [HC, PDF].filter((f) => where.sku.in.includes(f.sku)))
})

const get = async (query, h = cart) => {
  const res = makeRes()
  await h({ method: 'GET', query }, res)
  return { res, status: res.status.mock.calls.at(-1)?.[0], body: res.json.mock.calls.at(-1)?.[0] }
}

describe('GET /api/shop/cart', () => {
  test('berechnet Positionen, MwSt., Versand, no-store; keine Interna', async () => {
    const { res, status, body } = await get({ items: 'DS-HC:1,DS%20PDF:2', country: 'de' })
    expect(status).toBe(200)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(body.subtotalCents).toBe(4990 + 3980)
    expect(body.shippingCents).toBe(400)
    expect(body.totalCents).toBe(4990 + 3980 + 400)
    expect(body.taxBreakdown).toEqual({ 700: 326, 1900: 635 })
    expect(body.shippingError).toBeUndefined()
    expect(body.lines[1].sku).toBe('DS PDF')
    expect(JSON.stringify(body)).not.toMatch(/formatId|weightG|stock|"id"/)
    // nur aktive Produkte werden abgefragt
    expect(mockPrisma.shopFormat.findMany.mock.calls[0][0].where.product).toEqual({ active: true })
  })

  test('Parsing: lastIndexOf, doppelt kodierte SKU (Next dekodiert schon einmal)', async () => {
    const { body } = await get({ items: 'DS%20PDF:1' })
    expect(body.lines[0].sku).toBe('DS PDF')
    expect(body.shippingCents).toBe(0)
    expect(body.totalCents).toBe(1990)
  })

  test('ohne Land und mit physischer Position: Versand null, kein Fehler', async () => {
    const { status, body } = await get({ items: 'DS-HC:1' })
    expect(status).toBe(200)
    expect(body.shippingCents).toBeNull()
    expect(body.totalCents).toBeNull()
    expect(body.shippingError).toBeUndefined()
  })

  test('Versandprobleme -> 200 mit shippingError', async () => {
    let r = await get({ items: 'DS-HC:1', country: 'AT' })
    expect(r.status).toBe(200)
    expect(r.body.shippingError.code).toBe('SHIPPING_UNAVAILABLE')
    expect(r.body.shippingCents).toBeNull()
    expect(r.body.totalCents).toBeNull()
    r = await get({ items: 'DS-HC:1', country: 'FR' })
    expect(r.body.shippingError.code).toBe('COUNTRY_UNSUPPORTED')
  })

  test('Warenkorb-Fehler -> 422 mit code und details.sku', async () => {
    const cases = [
      [{ items: 'NOPE:1' }, 'PRODUCT_UNKNOWN', 'NOPE'],
      [{ items: 'DS-HC:0' }, 'QTY_INVALID', 'DS-HC'],
      [{ items: 'DS-HC:100' }, 'QTY_INVALID', 'DS-HC'],
      [{ items: 'DS-HC:abc' }, 'QTY_INVALID', 'DS-HC'],
      [{ items: 'DS-HC:-1' }, 'QTY_INVALID', 'DS-HC'],
      [{ items: 'DS-HC' }, 'QTY_INVALID', 'DS-HC'],
      [{ items: 'DS-HC:6' }, 'STOCK_EXCEEDED', 'DS-HC'],
      [{ items: '' }, 'CART_EMPTY', undefined],
      [{}, 'CART_EMPTY', undefined],
    ]
    for (const [q, c, sku] of cases) {
      const r = await get(q)
      expect(r.status).toBe(422)
      expect(r.body.code).toBe(c)
      expect(r.body.details.sku).toBe(sku)
      expect(r.body.error).toBeTruthy()
    }
  })

  test('inaktives Produkt ist für die DB-Abfrage unsichtbar -> PRODUCT_UNKNOWN', async () => {
    mockPrisma.shopFormat.findMany.mockResolvedValue([])
    expect((await get({ items: 'DS-HC:1' })).body.code).toBe('PRODUCT_UNKNOWN')
  })

  test('mehr als 50 Positionen -> 422', async () => {
    const items = Array.from({ length: 51 }, (_, i) => `S${i}:1`).join(',')
    const r = await get({ items })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('CART_TOO_LARGE')
    expect(mockPrisma.shopFormat.findMany).not.toHaveBeenCalled()
    mockPrisma.shopFormat.findMany.mockResolvedValue([{ ...HC, stock: null }]) // wiederholte SKUs werden summiert, daher ohne Bestandsgrenze
    expect((await get({ items: Array.from({ length: 50 }, () => 'DS-HC:1').join(',') })).status).toBe(200) // genau 50 Positionen sind erlaubt
    expect(mockPrisma.shopFormat.findMany).toHaveBeenCalled()
  })

  test('Add-on aus -> 404, nur GET, DB-Fehler -> 500 ohne Interna', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue({ value: 'false' })
    const off = await get({ items: 'DS-HC:1' })
    expect(off.status).toBe(404)
    expect(off.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(mockPrisma.shopFormat.findMany).not.toHaveBeenCalled()

    mockPrisma.setting.findUnique.mockImplementation(async () => ({ value: 'true' }))
    const res = makeRes()
    await cart({ method: 'POST', query: {} }, res)
    expect(res.status).toHaveBeenCalledWith(405)

    jest.spyOn(console, 'error').mockImplementation(() => {})
    mockPrisma.shopFormat.findMany.mockRejectedValue(new Error('geheim: db down'))
    const r = await get({ items: 'DS-HC:1' })
    expect(r.status).toBe(500)
    expect(JSON.stringify(r.body)).not.toMatch(/geheim/)
  })
})

describe('GET /api/shop/public/config', () => {
  test('Länder sortiert, EUR, no-store', async () => {
    const { res, status, body } = await get({}, config)
    expect(status).toBe(200)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(body).toEqual({ currency: 'EUR', locale: 'de', freeShippingFromCents: null, countries: [{ code: 'DE', name: 'Deutschland' }, { code: 'AT', name: 'Österreich' }], paymentProviders: [] })
  })
  test('Standard bei fehlendem Setting; Add-on aus -> 404', async () => {
    shippingRow = null
    expect((await get({}, config)).body.countries.length).toBe(31)
    mockPrisma.setting.findUnique.mockResolvedValue({ value: 'false' })
    expect((await get({}, config)).status).toBe(404)
  })
})

describe('GET /api/shop/cart v2', () => {
  const COUPON = { id: 'c1', code: 'SOMMER', type: 'PERCENT', value: 1000, usedCount: 0, maxUses: null, minOrderCents: null, validFrom: null, validUntil: null, active: true }
  const withShipping = (extra) => { shippingRow = { value: JSON.stringify({ ...SHIPPING, ...extra }) } }

  test('Standardfelder: currency, discountCents 0, coupon null, freeShipping null', async () => {
    const { body } = await get({ items: 'DS-HC:1', country: 'DE' })
    expect(body).toMatchObject({ discountCents: 0, coupon: null, currency: 'EUR', freeShipping: null, shippingTaxBp: null })
    expect(body.lines[0]).toMatchObject({ discountCents: 0, bundle: null })
  })

  test('gültiger Gutschein: Rabatt in Antwort, Summen konsistent, Code wird normalisiert', async () => {
    mockPrisma.shopCoupon.findUnique.mockResolvedValue(COUPON)
    const { body } = await get({ items: 'DS-HC:1', country: 'DE', coupon: ' sommer ' })
    expect(mockPrisma.shopCoupon.findUnique).toHaveBeenCalledWith({ where: { code: 'SOMMER' } })
    expect(body.discountCents).toBe(499)
    expect(body.coupon).toEqual({ code: 'SOMMER', type: 'PERCENT', value: 1000 })
    expect(body.lines[0].discountCents).toBe(499)
    expect(body.totalCents).toBe(4990 - 499 + 400)
    expect(body.taxBreakdown[700]).toBe(Math.round(((4990 - 499) * 700) / 10700))
  })

  test('unbekannter/ungültiger Gutschein -> 422 COUPON_*, details.code', async () => {
    mockPrisma.shopCoupon.findUnique.mockResolvedValue(null)
    let r = await get({ items: 'DS-HC:1', coupon: 'NOPE' })
    expect(r.status).toBe(422)
    expect(r.body).toMatchObject({ code: 'COUPON_INVALID', details: { code: 'NOPE' } })
    mockPrisma.shopCoupon.findUnique.mockResolvedValue({ ...COUPON, validUntil: new Date(Date.now() - 1000) })
    r = await get({ items: 'DS-HC:1', coupon: 'SOMMER' })
    expect(r.status).toBe(422)
    expect(r.body).toMatchObject({ code: 'COUPON_EXPIRED', details: { code: 'SOMMER' } })
    mockPrisma.shopCoupon.findUnique.mockResolvedValue({ ...COUPON, minOrderCents: 999999 })
    expect((await get({ items: 'DS-HC:1', coupon: 'SOMMER' })).body.code).toBe('COUPON_MIN_ORDER')
  })

  test('Versandkostenfrei: Grenze und Restbetrag nur bei physischem Warenkorb', async () => {
    withShipping({ freeShippingFromCents: 6000 })
    let r = await get({ items: 'DS-HC:1', country: 'DE' })
    expect(r.body.freeShipping).toEqual({ fromCents: 6000, remainingCents: 1010 })
    expect(r.body.shippingCents).toBe(400)
    r = await get({ items: 'DS-HC:2', country: 'DE' })
    expect(r.body.freeShipping).toEqual({ fromCents: 6000, remainingCents: 0 })
    expect(r.body.shippingCents).toBe(0)
    expect(r.body.totalCents).toBe(9980)
    r = await get({ items: 'DS%20PDF:1', country: 'DE' })
    expect(r.body.freeShipping).toBeNull()
  })

  test('Versand-MwSt. der Zone: shippingTaxBp und taxBreakdown', async () => {
    withShipping({ zones: [{ id: 'DE', name: 'DE', countries: ['DE'], taxRateBp: 700, tiers: [{ maxG: 1000, priceCents: 400 }] }] })
    const { body } = await get({ items: 'DS-HC:1', country: 'DE' })
    expect(body.shippingTaxBp).toBe(700)
    expect(body.taxBreakdown[700]).toBe(Math.round((4990 * 700) / 10700) + Math.round((400 * 700) / 10700))
  })

  test('Reservierungen anderer verringern den Bestand (excludeOrderId undefined)', async () => {
    mockReserved.mockResolvedValue(new Map([['f1', 3]]))
    const r = await get({ items: 'DS-HC:3' })
    expect(r.status).toBe(422)
    expect(r.body.code).toBe('STOCK_EXCEEDED')
    expect(mockReserved).toHaveBeenCalledWith(['f1'], { excludeOrderId: undefined })
    expect((await get({ items: 'DS-HC:2' })).status).toBe(200)
  })

  test('Bündel: Bestandteile werden nachgeladen und ohne Interna ausgegeben', async () => {
    const SET = { id: 'f9', sku: 'SET', label: 'Set', priceCents: 5000, taxRateBp: 700, weightG: null, stock: null, digital: false, bundleItems: [{ sku: 'DS-HC', qty: 1 }], product }
    mockPrisma.shopFormat.findMany.mockImplementation(async ({ where }) => [HC, PDF, SET].filter((f) => where.sku.in.includes(f.sku)))
    const { status, body } = await get({ items: 'SET:1', country: 'DE' })
    expect(status).toBe(200)
    expect(mockPrisma.shopFormat.findMany).toHaveBeenCalledTimes(2)
    expect(body.lines[0].bundle).toEqual([{ sku: 'DS-HC', title: 'Dark Space', label: 'Hardcover', qty: 1 }])
    expect(JSON.stringify(body)).not.toMatch(/formatId|weightG/)
    expect(body.shippingCents).toBe(400)
  })

  test('Währung aus den Einstellungen', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([{ key: 'shop_currency', value: 'CHF' }])
    expect((await get({ items: 'DS-HC:1' })).body.currency).toBe('CHF')
  })
})

describe('GET /api/shop/public/config v2', () => {
  test('locale, currency, freeShippingFromCents', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([{ key: 'shop_currency', value: 'GBP' }, { key: 'shop_default_locale', value: 'en' }])
    shippingRow = { value: JSON.stringify({ ...SHIPPING, freeShippingFromCents: 5000 }) }
    const { body } = await get({}, config)
    expect(body).toMatchObject({ currency: 'GBP', locale: 'en', freeShippingFromCents: 5000 })
  })
})
