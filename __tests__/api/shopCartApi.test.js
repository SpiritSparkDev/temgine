/**
 * __tests__/api/shopCartApi.test.js
 * GET /api/shop/cart und GET /api/shop/public/config
 */
jest.disableAutomock()

const mockPrisma = {
  setting: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  shopFormat: { findMany: jest.fn() },
}
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))

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
    expect(body).toEqual({ currency: 'EUR', countries: [{ code: 'DE', name: 'Deutschland' }, { code: 'AT', name: 'Österreich' }], paymentProviders: [] })
  })
  test('Standard bei fehlendem Setting; Add-on aus -> 404', async () => {
    shippingRow = null
    expect((await get({}, config)).body.countries.length).toBe(31)
    mockPrisma.setting.findUnique.mockResolvedValue({ value: 'false' })
    expect((await get({}, config)).status).toBe(404)
  })
})
