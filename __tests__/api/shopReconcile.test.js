/**
 * __tests__/api/shopReconcile.test.js
 * POST /api/shop/orders/reconcile
 */

jest.disableAutomock()

const mockPrisma = { shopPayment: { findMany: jest.fn() } }
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_ORDERS_EDIT: ['EDIT'] } }))
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }))
jest.mock('../../lib/shop/guard', () => ({ requireShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/payments', () => ({ syncPayment: jest.fn(), LATE_PAYMENT_WINDOW_MS: 48 * 3600_000 }))

const { requireAuth } = require('../../lib/auth')
const { logAudit } = require('../../lib/audit')
const { requireShopEnabled } = require('../../lib/shop/guard')
const { syncPayment } = require('../../lib/shop/payments')
const reconcile = require('../../pages/api/shop/orders/reconcile').default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
  requireShopEnabled.mockResolvedValue(true)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

test('permission, add-on switch and method are enforced', async () => {
  requireAuth.mockResolvedValue({ authorized: false, status: 403, error: 'no' })
  let res = makeRes()
  await reconcile({ method: 'POST' }, res)
  expect(res.status).toHaveBeenCalledWith(403)
  expect(requireAuth.mock.calls[0][2]).toEqual(['EDIT'])
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
  requireShopEnabled.mockResolvedValue(false)
  res = makeRes()
  await reconcile({ method: 'POST' }, res)
  expect(mockPrisma.shopPayment.findMany).not.toHaveBeenCalled()
  requireShopEnabled.mockResolvedValue(true)
  res = makeRes()
  await reconcile({ method: 'GET' }, res)
  expect(res.status).toHaveBeenCalledWith(405)
})

test('syncs sequentially (non-strict), counts by resulting status, audits, no-store', async () => {
  mockPrisma.shopPayment.findMany.mockResolvedValue([
    { provider: 'SUMUP', externalId: 'a' }, { provider: 'STRIPE', externalId: 'b' },
    { provider: 'PAYPAL', externalId: 'c' }, { provider: 'SUMUP', externalId: 'd' }, { provider: 'SUMUP', externalId: 'e' },
  ])
  syncPayment.mockImplementation(async ({ externalId }) => {
    if (externalId === 'e') throw new Error('x')
    return { a: 'PAID', b: 'FAILED', c: 'PENDING', d: null }[externalId]
  })
  const res = makeRes()
  await reconcile({ method: 'POST' }, res)
  expect(syncPayment.mock.calls.map((c) => c[0])).toEqual([
    { provider: 'sumup', externalId: 'a' }, { provider: 'stripe', externalId: 'b' },
    { provider: 'paypal', externalId: 'c' }, { provider: 'sumup', externalId: 'd' }, { provider: 'sumup', externalId: 'e' },
  ])
  expect(syncPayment.mock.calls.every((c) => c.length === 1)).toBe(true)
  expect(res.json).toHaveBeenCalledWith({ checked: 5, paid: 1, failed: 1, pending: 3 })
  expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.orders.reconcile', userId: 'u1' }))
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
})

test('query: max 50, newest first, older than 2 minutes, PENDING or recent FAILED orders', async () => {
  mockPrisma.shopPayment.findMany.mockResolvedValue([])
  const before = Date.now()
  await reconcile({ method: 'POST' }, makeRes())
  const q = mockPrisma.shopPayment.findMany.mock.calls[0][0]
  expect(q.take).toBe(50)
  expect(q.orderBy).toEqual({ createdAt: 'desc' })
  expect(before - q.where.createdAt.lt.getTime()).toBeGreaterThanOrEqual(2 * 60_000 - 5)
  expect(q.where.OR[0]).toEqual({ status: 'PENDING', order: { status: 'PENDING' } })
  expect(q.where.OR[1].order.status).toBe('FAILED')
  expect(before - q.where.OR[1].order.createdAt.gte.getTime()).toBeGreaterThanOrEqual(48 * 3600_000 - 5)
})
