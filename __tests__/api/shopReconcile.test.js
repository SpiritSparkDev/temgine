/**
 * __tests__/api/shopReconcile.test.js
 * POST /api/shop/orders/reconcile (Logik in reconcileOpenPayments, siehe shopPayments.test.js)
 */

jest.disableAutomock()

jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_ORDERS_EDIT: ['EDIT'] } }))
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }))
jest.mock('../../lib/shop/guard', () => ({ requireShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/payments', () => ({ reconcileOpenPayments: jest.fn() }))

const { requireAuth } = require('../../lib/auth')
const { logAudit } = require('../../lib/audit')
const { requireShopEnabled } = require('../../lib/shop/guard')
const { reconcileOpenPayments } = require('../../lib/shop/payments')
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
  expect(reconcileOpenPayments).not.toHaveBeenCalled()
  requireShopEnabled.mockResolvedValue(true)
  res = makeRes()
  await reconcile({ method: 'GET' }, res)
  expect(res.status).toHaveBeenCalledWith(405)
})

test('calls reconcileOpenPayments with limit 50, audits, no-store', async () => {
  reconcileOpenPayments.mockResolvedValue({ checked: 5, paid: 1, failed: 1, pending: 3 })
  const res = makeRes()
  await reconcile({ method: 'POST' }, res)
  expect(reconcileOpenPayments).toHaveBeenCalledWith({ limit: 50 })
  expect(res.json).toHaveBeenCalledWith({ checked: 5, paid: 1, failed: 1, pending: 3 })
  expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.orders.reconcile', userId: 'u1' }))
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
})

test('unexpected error -> 500', async () => {
  reconcileOpenPayments.mockRejectedValue(new Error('db'))
  const res = makeRes()
  await reconcile({ method: 'POST' }, res)
  expect(res.status).toHaveBeenCalledWith(500)
})
