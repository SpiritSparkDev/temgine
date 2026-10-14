/**
 * __tests__/api/shopOrders.test.js
 * /api/shop/orders, /api/shop/orders/[id], /api/shop/orders/[id]/ship
 */

jest.disableAutomock()

const mockPrisma = { shopOrder: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() } }
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_ORDERS_VIEW: ['VIEW'], SHOP_ORDERS_EDIT: ['EDIT'] } }))
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }))
jest.mock('../../lib/shop/guard', () => ({ requireShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/orderMails', () => ({ sendShippedMail: jest.fn() }))

const { requireAuth } = require('../../lib/auth')
const { logAudit } = require('../../lib/audit')
const { requireShopEnabled } = require('../../lib/shop/guard')
const { sendShippedMail } = require('../../lib/shop/orderMails')
const list = require('../../pages/api/shop/orders').default
const detail = require('../../pages/api/shop/orders/[id]').default
const ship = require('../../pages/api/shop/orders/[id]/ship').default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}

const calls = () => [
  [list, { method: 'GET', query: {} }],
  [detail, { method: 'GET', query: { id: 'x' } }],
  [ship, { method: 'POST', query: { id: 'x' } }],
]

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
  requireShopEnabled.mockResolvedValue(true)
})

describe('auth and add-on guard', () => {
  test('rights: VIEW for list/detail, EDIT for ship', async () => {
    mockPrisma.shopOrder.count.mockResolvedValue(0)
    mockPrisma.shopOrder.findMany.mockResolvedValue([])
    mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
    for (const [h, req] of calls()) await h(req, makeRes())
    expect(requireAuth.mock.calls.map((c) => c[2])).toEqual([['VIEW'], ['VIEW'], ['EDIT']])
  })

  test('auth failure is passed through, nothing is read or written', async () => {
    requireAuth.mockResolvedValue({ authorized: false, error: 'Zugriff verweigert', status: 403 })
    for (const [h, req] of calls()) {
      const res = makeRes()
      await h(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    }
    expect(mockPrisma.shopOrder.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.shopOrder.updateMany).not.toHaveBeenCalled()
  })

  test('add-on off stops all three before touching the database', async () => {
    requireShopEnabled.mockResolvedValue(false)
    for (const [h, req] of calls()) await h(req, makeRes())
    expect(mockPrisma.shopOrder.count).not.toHaveBeenCalled()
    expect(mockPrisma.shopOrder.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.shopOrder.updateMany).not.toHaveBeenCalled()
  })
})

describe('GET /api/shop/orders', () => {
  test('filters by status and search, paginates with 25 per page, newest first', async () => {
    mockPrisma.shopOrder.count.mockResolvedValue(60)
    mockPrisma.shopOrder.findMany.mockResolvedValue([{ id: 'o1' }])
    const res = makeRes()
    await list({ method: 'GET', query: { status: 'PAID', q: ' abc ', page: '2' } }, res)
    const args = mockPrisma.shopOrder.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ status: 'PAID', OR: [{ reference: { contains: 'abc' } }, { email: { contains: 'abc' } }] })
    expect(args.skip).toBe(25)
    expect(args.take).toBe(25)
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
    expect(res.json).toHaveBeenCalledWith({ orders: [{ id: 'o1' }], total: 60, page: 2, pages: 3 })
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  test('clamps the page and rejects an unknown status', async () => {
    mockPrisma.shopOrder.count.mockResolvedValue(10)
    mockPrisma.shopOrder.findMany.mockResolvedValue([])
    let res = makeRes()
    await list({ method: 'GET', query: { page: '99' } }, res)
    expect(res.json.mock.calls[0][0].page).toBe(1)
    res = makeRes()
    await list({ method: 'GET', query: { status: 'NOPE' } }, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })
})

describe('GET /api/shop/orders/[id]', () => {
  test('returns details without external payment ids or internal links', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue({
      id: 'o1', reference: 'ORD-1', status: 'PAID', email: 'a@b.de', billing: {}, shipping: {}, subtotalCents: 1, shippingCents: 0, totalCents: 1,
      currency: 'EUR', taxBreakdown: {}, acceptedTermsAt: new Date(), acceptedWaiver: false, memberId: 'm1', createdAt: new Date(), paidAt: null, shippedAt: null,
      items: [{ id: 'i1', orderId: 'o1', formatId: 'f1', sku: 'S', title: 'T', label: 'L', qty: 1, unitCents: 1, taxRateBp: 700, digital: false, weightG: 1 }],
      payments: [{ id: 'p1', orderId: 'o1', provider: 'STRIPE', externalId: 'cs_SECRET', status: 'PAID', amountCents: 1, currency: 'EUR', createdAt: new Date() }],
    })
    const res = makeRes()
    await detail({ method: 'GET', query: { id: 'o1' } }, res)
    const body = res.json.mock.calls[0][0]
    expect(body.order.payments[0]).toMatchObject({ provider: 'STRIPE', status: 'PAID' })
    expect(JSON.stringify(body)).not.toMatch(/cs_SECRET|externalId|memberId|formatId/)
    expect(body.order.items[0].sku).toBe('S')
  })

  test('unknown id -> 404', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
    const res = makeRes()
    await detail({ method: 'GET', query: { id: 'zz' } }, res)
    expect(res.status).toHaveBeenCalledWith(404)
  })
})

describe('POST /api/shop/orders/[id]/ship', () => {
  const order = { id: 'o1', reference: 'ORD-1', email: 'a@b.de', status: 'PAID' }

  test('PAID -> SHIPPED via conditional update, audit, one mail', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order)
    mockPrisma.shopOrder.updateMany.mockResolvedValue({ count: 1 })
    sendShippedMail.mockResolvedValue()
    const res = makeRes()
    await ship({ method: 'POST', query: { id: 'o1' } }, res)
    const arg = mockPrisma.shopOrder.updateMany.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'o1', status: 'PAID' })
    expect(arg.data.status).toBe('SHIPPED')
    expect(arg.data.shippedAt).toBeInstanceOf(Date)
    expect(sendShippedMail).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.order.ship', resourceId: 'o1', userId: 'u1' }))
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json.mock.calls[0][0]).toMatchObject({ status: 'SHIPPED', mailError: false })
  })

  test('second call (or non-PAID order) changes nothing and sends no mail', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue({ ...order, status: 'SHIPPED' })
    mockPrisma.shopOrder.updateMany.mockResolvedValue({ count: 0 })
    const res = makeRes()
    await ship({ method: 'POST', query: { id: 'o1' } }, res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(sendShippedMail).not.toHaveBeenCalled()
    expect(logAudit).not.toHaveBeenCalled()
  })

  test('mail failure keeps SHIPPED and reports mailError', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order)
    mockPrisma.shopOrder.updateMany.mockResolvedValue({ count: 1 })
    sendShippedMail.mockRejectedValue(new Error('smtp down'))
    const res = makeRes()
    await ship({ method: 'POST', query: { id: 'o1' } }, res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json.mock.calls[0][0]).toMatchObject({ status: 'SHIPPED', mailError: true })
  })

  test('unknown order -> 404, wrong method -> 405', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
    let res = makeRes()
    await ship({ method: 'POST', query: { id: 'zz' } }, res)
    expect(res.status).toHaveBeenCalledWith(404)
    res = makeRes()
    await ship({ method: 'GET', query: { id: 'o1' } }, res)
    expect(res.status).toHaveBeenCalledWith(405)
  })
})
