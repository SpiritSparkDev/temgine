jest.disableAutomock()
const mockPrisma = { shopOrder: { findUnique: jest.fn() } }
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/shop/config', () => ({ isShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/payments', () => ({ syncPayment: jest.fn() }))
jest.mock('../../lib/shop/downloads', () => ({ listDownloadsForOrder: jest.fn() }))

const { isShopEnabled } = require('../../lib/shop/config')
const { syncPayment } = require('../../lib/shop/payments')
const { listDownloadsForOrder } = require('../../lib/shop/downloads')
const handler = require('../../pages/api/shop/public/orders/[reference]').default

let ip = 0
const TOKEN = 'tok-abc-123'
function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}
const call = async (reference = 'ORD-2026-000001', { method = 'GET', ipAddr = `10.1.0.${++ip}`, t = TOKEN } = {}) => {
  const res = makeRes()
  await handler({ method, query: t === null ? { reference } : { reference, t }, headers: { 'x-forwarded-for': ipAddr } }, res)
  return res
}
const row = (o = {}) => ({ id: 'o1', accessToken: TOKEN, reference: 'ORD-2026-000001', status: 'PENDING', totalCents: 2400, currency: 'EUR', payments: [{ provider: 'SUMUP', externalId: 'x1' }], ...o })

beforeEach(() => {
  jest.clearAllMocks()
  isShopEnabled.mockResolvedValue(true)
  listDownloadsForOrder.mockReset().mockResolvedValue([])
  mockPrisma.shopOrder.findUnique.mockReset().mockResolvedValue(row())
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

test('404 when add-on is off, 405 for non-GET, 404 for unknown or oversized reference', async () => {
  isShopEnabled.mockResolvedValue(false)
  expect((await call()).status).toHaveBeenCalledWith(404)
  isShopEnabled.mockResolvedValue(true)
  expect((await call(undefined, { method: 'POST' })).status).toHaveBeenCalledWith(405)
  mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
  expect((await call()).status).toHaveBeenCalledWith(404)
  expect((await call('x'.repeat(61))).status).toHaveBeenCalledWith(404)
})

test('token required: missing, wrong, null-token orders and unknown reference give the identical 404', async () => {
  const bodies = []
  const check = (res) => {
    expect(res.status).toHaveBeenCalledWith(404)
    bodies.push(JSON.stringify(res.json.mock.calls[0][0]))
  }
  check(await call(undefined, { t: null }))
  check(await call(undefined, { t: 'wrong' }))
  check(await call(undefined, { t: '' }))
  mockPrisma.shopOrder.findUnique.mockResolvedValue(row({ accessToken: null }))
  check(await call(undefined, { t: 'null' }))
  check(await call(undefined, { t: null }))
  mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
  check(await call())
  expect(new Set(bodies).size).toBe(1)
  expect(syncPayment).not.toHaveBeenCalled()
})

test('pending order: open payments are synced, fresh status returned', async () => {
  mockPrisma.shopOrder.findUnique
    .mockResolvedValueOnce(row())
    .mockResolvedValueOnce({ id: 'o1', reference: 'ORD-2026-000001', status: 'PAID', totalCents: 2400, currency: 'EUR' })
  const res = await call()
  expect(syncPayment).toHaveBeenCalledWith({ provider: 'sumup', externalId: 'x1' })
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reference: 'ORD-2026-000001', status: 'PAID', totalCents: 2400, currency: 'EUR', paid: true }))
})

test('final orders are not synced; SHIPPED counts as paid, FAILED does not', async () => {
  mockPrisma.shopOrder.findUnique.mockResolvedValue(row({ status: 'SHIPPED' }))
  expect((await call()).json.mock.calls[0][0].paid).toBe(true)
  mockPrisma.shopOrder.findUnique.mockResolvedValue(row({ status: 'FAILED' }))
  expect((await call()).json.mock.calls[0][0]).toMatchObject({ status: 'FAILED', paid: false })
  expect(syncPayment).not.toHaveBeenCalled()
})

test('sync errors do not break the response', async () => {
  syncPayment.mockRejectedValue(new Error('x'))
  const res = await call()
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json.mock.calls[0][0].paid).toBe(false)
})

test('exposes no PII: only status fields for an unpaid order', async () => {
  mockPrisma.shopOrder.findUnique.mockResolvedValue(row({ status: 'FAILED', email: 'a@b.de', billing: { name: 'Max' }, shipping: {}, items: [{ sku: 'A' }] }))
  const out = (await call()).json.mock.calls[0][0]
  expect(Object.keys(out).sort()).toEqual(['currency', 'locale', 'paid', 'reference', 'status', 'totalCents'])
  const select = mockPrisma.shopOrder.findUnique.mock.calls[0][0].select
  for (const k of ['email', 'billing', 'shipping', 'items', 'memberId']) expect(select[k]).toBeUndefined()
})

test('paid order: downloads and invoiceUrl; shipped adds tracking; token never echoed except in invoiceUrl', async () => {
  listDownloadsForOrder.mockResolvedValue([{ fileId: 'f', filename: 'a.pdf', url: '/api/shop/download/z', expiresAt: 'D', remaining: 4, sizeBytes: 9 }])
  mockPrisma.shopOrder.findUnique.mockResolvedValue(row({ status: 'SHIPPED', trackingCarrier: 'DHL', trackingNumber: '123', trackingUrl: 'https://t.example/1' }))
  const out = (await call()).json.mock.calls[0][0]
  expect(listDownloadsForOrder).toHaveBeenCalledWith('o1')
  expect(out.downloads).toEqual([{ filename: 'a.pdf', url: '/api/shop/download/z', expiresAt: 'D', remaining: 4 }])
  expect(out.invoiceUrl).toBe('/api/shop/public/orders/ORD-2026-000001/invoice?t=tok-abc-123')
  expect(out).toMatchObject({ trackingCarrier: 'DHL', trackingNumber: '123', trackingUrl: 'https://t.example/1' })
  expect(out.accessToken).toBeUndefined()
})

test('download lookup failure does not break a paid response', async () => {
  listDownloadsForOrder.mockRejectedValue(new Error('x'))
  mockPrisma.shopOrder.findUnique.mockResolvedValue(row({ status: 'PAID' }))
  expect((await call()).json.mock.calls[0][0].downloads).toEqual([])
})

test('response carries the order locale (null when unset)', async () => {
  mockPrisma.shopOrder.findUnique.mockResolvedValueOnce(row({ status: 'REFUNDED', locale: 'en' }))
  expect((await call()).json.mock.calls[0][0]).toMatchObject({ locale: 'en' })
  mockPrisma.shopOrder.findUnique.mockResolvedValueOnce(row({ status: 'REFUNDED' }))
  expect((await call()).json.mock.calls[0][0]).toMatchObject({ locale: null })
})

test('429 after 60 requests per minute from one IP', async () => {
  let last
  for (let i = 0; i < 61; i++) last = await call(undefined, { ipAddr: '7.7.7.7' })
  expect(last.status).toHaveBeenCalledWith(429)
  expect(last.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number))
})

test('no-store header', async () => {
  expect((await call()).setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
})
