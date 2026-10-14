/**
 * __tests__/api/shopRefundApi.test.js
 * POST /api/shop/orders/[id]/refund und /cancel
 */

jest.disableAutomock()

const mockPrisma = { shopOrder: { findUnique: jest.fn(), updateMany: jest.fn() } }
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_REFUND: ['REFUND'], SHOP_ORDERS_EDIT: ['EDIT'] } }))
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }))
jest.mock('../../lib/shop/guard', () => ({ requireShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/events', () => ({ logOrderEvent: jest.fn() }))
jest.mock('../../lib/shop/reservations', () => ({ releaseReservations: jest.fn() }))
jest.mock('../../lib/shop/refunds', () => {
  class ShopRefundError extends Error {
    constructor(code, message) { super(message); this.code = code }
  }
  return { ShopRefundError, createRefund: jest.fn() }
})

const { requireAuth } = require('../../lib/auth')
const { logAudit } = require('../../lib/audit')
const { requireShopEnabled } = require('../../lib/shop/guard')
const { logOrderEvent } = require('../../lib/shop/events')
const { releaseReservations } = require('../../lib/shop/reservations')
const { createRefund, ShopRefundError } = require('../../lib/shop/refunds')
const refundRoute = require('../../pages/api/shop/orders/[id]/refund').default
const cancelRoute = require('../../pages/api/shop/orders/[id]/cancel').default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}
const req = (body, method = 'POST') => ({ method, query: { id: 'o1' }, body })
const ORDER = { id: 'o1', reference: 'ORD-1', status: 'PAID' }

beforeEach(() => {
  jest.clearAllMocks()
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
  requireShopEnabled.mockResolvedValue(true)
  mockPrisma.shopOrder.findUnique.mockResolvedValue(ORDER)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('refund', () => {
  test('Rechte SHOP_REFUND, Add-on, Methode, no-store', async () => {
    requireAuth.mockResolvedValue({ authorized: false, status: 403, error: 'no' })
    let res = makeRes()
    await refundRoute(req({}), res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(requireAuth.mock.calls[0][2]).toEqual(['REFUND'])
    requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
    requireShopEnabled.mockResolvedValue(false)
    await refundRoute(req({}), makeRes())
    expect(createRefund).not.toHaveBeenCalled()
    requireShopEnabled.mockResolvedValue(true)
    res = makeRes()
    await refundRoute(req({}, 'GET'), res)
    expect(res.status).toHaveBeenCalledWith(405)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  test.each([
    [{ amountCents: 0 }], [{ amountCents: 1.5 }], [{ amountCents: '100' }], [{ reason: 'x'.repeat(501) }],
    [{ reason: 5 }], [{ restock: 'ja' }], [{ notifyCustomer: 1 }],
  ])('Validierung %j -> 422', async (body) => {
    const res = makeRes()
    await refundRoute(req(body), res)
    expect(res.status).toHaveBeenCalledWith(422)
    expect(res.json.mock.calls[0][0].code).toBe('VALIDATION_ERROR')
    expect(createRefund).not.toHaveBeenCalled()
  })

  test('unbekannte Bestellung -> 404', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
    const res = makeRes()
    await refundRoute(req({}), res)
    expect(res.status).toHaveBeenCalledWith(404)
  })

  test('Erfolg: Parameter durchgereicht (notifyCustomer Standard true), Audit, Antwort', async () => {
    createRefund.mockResolvedValue({ refund: { id: 'r1', amountCents: 500, status: 'SUCCEEDED' }, order: { status: 'PAID', refundedCents: 500 }, mailError: false })
    const res = makeRes()
    await refundRoute(req({ amountCents: 500, reason: ' Kulanz ', restock: true }), res)
    expect(createRefund).toHaveBeenCalledWith({ order: ORDER, amountCents: 500, reason: 'Kulanz', restock: true, notifyCustomer: true, userId: 'u1' })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true, refund: { id: 'r1', amountCents: 500, status: 'SUCCEEDED' }, status: 'PAID', refundedCents: 500, mailError: false })
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.order.refund', userId: 'u1' }))
  })

  test('ohne Body: Standardwerte, notifyCustomer false wird beachtet', async () => {
    createRefund.mockResolvedValue({ refund: { id: 'r1', amountCents: 5, status: 'PENDING' }, order: ORDER, mailError: false })
    await refundRoute(req(undefined), makeRes())
    expect(createRefund.mock.calls[0][0]).toMatchObject({ amountCents: undefined, reason: undefined, restock: false, notifyCustomer: true })
    await refundRoute(req({ notifyCustomer: false }), makeRes())
    expect(createRefund.mock.calls[1][0].notifyCustomer).toBe(false)
  })

  test.each([['REFUND_NOT_ALLOWED', 409], ['AMOUNT_INVALID', 422], ['PROVIDER_ERROR', 502]])('%s -> %i', async (c, status) => {
    createRefund.mockRejectedValue(new ShopRefundError(c, 'Text'))
    const res = makeRes()
    await refundRoute(req({}), res)
    expect(res.status).toHaveBeenCalledWith(status)
    expect(res.json).toHaveBeenCalledWith({ error: 'Text', code: c })
  })

  test('unerwarteter Fehler -> 500 ohne Details', async () => {
    createRefund.mockRejectedValue(new Error('secret db detail'))
    const res = makeRes()
    await refundRoute(req({}), res)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret')
  })
})

describe('cancel', () => {
  test('Rechte SHOP_ORDERS_EDIT, Methode', async () => {
    requireAuth.mockResolvedValue({ authorized: false, status: 403, error: 'no' })
    await cancelRoute(req({}), makeRes())
    expect(requireAuth.mock.calls[0][2]).toEqual(['EDIT'])
    requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
    const res = makeRes()
    await cancelRoute(req({}, 'GET'), res)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  test('PENDING -> CANCELLED per bedingtem Update, Reservierungen frei, Ereignis, Audit', async () => {
    mockPrisma.shopOrder.updateMany.mockResolvedValue({ count: 1 })
    const res = makeRes()
    await cancelRoute(req({}), res)
    const arg = mockPrisma.shopOrder.updateMany.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'o1', status: 'PENDING' })
    expect(arg.data.status).toBe('CANCELLED')
    expect(arg.data.cancelledAt).toBeInstanceOf(Date)
    expect(releaseReservations).toHaveBeenCalledWith('o1')
    expect(logOrderEvent).toHaveBeenCalledWith('o1', 'CANCELLED', expect.any(String), { userId: 'u1' })
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.order.cancel' }))
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test('nicht PENDING (Doppelklick/andere Status) -> 409, keine Nebenwirkungen', async () => {
    mockPrisma.shopOrder.updateMany.mockResolvedValue({ count: 0 })
    const res = makeRes()
    await cancelRoute(req({}), res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(releaseReservations).not.toHaveBeenCalled()
    expect(logOrderEvent).not.toHaveBeenCalled()
  })

  test('unbekannte Bestellung -> 404; Fehler bei Reservierungsfreigabe bricht nicht ab', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValueOnce(null)
    let res = makeRes()
    await cancelRoute(req({}), res)
    expect(res.status).toHaveBeenCalledWith(404)
    mockPrisma.shopOrder.updateMany.mockResolvedValue({ count: 1 })
    releaseReservations.mockRejectedValue(new Error('x'))
    res = makeRes()
    await cancelRoute(req({}), res)
    expect(res.status).toHaveBeenCalledWith(200)
  })
})
