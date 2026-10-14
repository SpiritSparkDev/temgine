/**
 * __tests__/api/shopInvoiceApi.test.js
 * GET /api/shop/orders/[id]/invoice und /api/shop/public/orders/[reference]/invoice
 */

jest.disableAutomock()

const mockPrisma = { shopOrder: { findUnique: jest.fn() } }
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_ORDERS_VIEW: ['VIEW'] } }))
jest.mock('../../lib/shop/guard', () => ({ requireShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/config', () => ({ isShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/invoice', () => ({
  INVOICE_STATUSES: ['PAID', 'SHIPPED', 'REFUNDED'],
  issueInvoice: jest.fn(),
  buildInvoicePdf: jest.fn(),
}))

const { requireAuth } = require('../../lib/auth')
const { requireShopEnabled } = require('../../lib/shop/guard')
const { isShopEnabled } = require('../../lib/shop/config')
const { issueInvoice, buildInvoicePdf } = require('../../lib/shop/invoice')
const admin = require('../../pages/api/shop/orders/[id]/invoice').default
const pub = require('../../pages/api/shop/public/orders/[reference]/invoice').default

function makeRes() {
  const res = { headers: {} }
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.send = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn((k, v) => { res.headers[k] = v; return res })
  return res
}
const PDF = Buffer.from('%PDF-1.7 test')

let ipCounter = 0
const pubReq = (over = {}) => ({ method: 'GET', headers: { 'x-forwarded-for': `10.0.0.${++ipCounter}` }, query: { reference: 'ORD-1', t: 'tok' }, ...over })

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  requireAuth.mockResolvedValue({ authorized: true })
  requireShopEnabled.mockResolvedValue(true)
  isShopEnabled.mockResolvedValue(true)
  issueInvoice.mockResolvedValue({ number: 'RE-2026-000001' })
  buildInvoicePdf.mockResolvedValue(PDF)
})

describe('admin route', () => {
  const req = { method: 'GET', query: { id: 'o1' } }

  test('requires SHOP_ORDERS_VIEW and passes auth failure through', async () => {
    requireAuth.mockResolvedValue({ authorized: false, error: 'Zugriff verweigert', status: 403 })
    const res = makeRes()
    await admin(req, res)
    expect(requireAuth.mock.calls[0][2]).toEqual(['VIEW'])
    expect(res.status).toHaveBeenCalledWith(403)
    expect(buildInvoicePdf).not.toHaveBeenCalled()
  })

  test('add-on disabled -> nothing served', async () => {
    requireShopEnabled.mockResolvedValue(false)
    await admin(req, makeRes())
    expect(mockPrisma.shopOrder.findUnique).not.toHaveBeenCalled()
  })

  test('unknown order 404, unpaid 409', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValueOnce(null)
    let res = makeRes()
    await admin(req, res)
    expect(res.status).toHaveBeenCalledWith(404)
    mockPrisma.shopOrder.findUnique.mockResolvedValueOnce({ id: 'o1', status: 'PENDING' })
    res = makeRes()
    await admin(req, res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json.mock.calls[0][0].code).toBe('NOT_PAID')
  })

  test('paid order -> inline PDF, no-store, safe file name', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue({ id: 'o1', status: 'SHIPPED' })
    issueInvoice.mockResolvedValue({ number: 'R"E/../1' })
    const res = makeRes()
    await admin(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(PDF)
    expect(res.headers['Content-Type']).toBe('application/pdf')
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(res.headers['Content-Disposition']).toBe('inline; filename="Rechnung-R_E_.._1.pdf"')
  })

  test('POST not allowed', async () => {
    const res = makeRes()
    await admin({ method: 'POST', query: { id: 'o1' } }, res)
    expect(res.status).toHaveBeenCalledWith(405)
  })
})

describe('public route', () => {
  const found = (over = {}) => mockPrisma.shopOrder.findUnique.mockResolvedValue({ id: 'o1', status: 'PAID', accessToken: 'tok', ...over })

  test('valid token + paid -> PDF', async () => {
    found()
    const res = makeRes()
    await pub(pubReq(), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.headers['Content-Type']).toBe('application/pdf')
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  test.each([
    ['wrong token', { query: { reference: 'ORD-1', t: 'nope' } }, {}],
    ['missing token', { query: { reference: 'ORD-1' } }, {}],
    ['order without token', {}, { accessToken: null }],
    ['unpaid', {}, { status: 'PENDING' }],
  ])('%s -> 404 like unknown order', async (_n, reqOver, orderOver) => {
    found(orderOver)
    const res = makeRes()
    await pub(pubReq(reqOver), res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json.mock.calls[0][0].code).toBe('NOT_FOUND')
    expect(buildInvoicePdf).not.toHaveBeenCalled()
  })

  test('unknown reference -> same 404', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
    const res = makeRes()
    await pub(pubReq(), res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json.mock.calls[0][0]).toEqual({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })
  })

  test('add-on disabled -> 404', async () => {
    isShopEnabled.mockResolvedValue(false)
    const res = makeRes()
    await pub(pubReq(), res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(mockPrisma.shopOrder.findUnique).not.toHaveBeenCalled()
  })

  test('rate limit: 21st request from one IP -> 429', async () => {
    found()
    const headers = { 'x-forwarded-for': '9.9.9.9' }
    let last
    for (let i = 0; i < 21; i++) { last = makeRes(); await pub(pubReq({ headers }), last) }
    expect(last.status).toHaveBeenCalledWith(429)
  })
})
