/**
 * __tests__/api/shopOrderNotes.test.js
 * POST /api/shop/orders/[id]/notes, PUT /api/shop/orders/[id]/tracking
 */

jest.disableAutomock()

const mockPrisma = { shopOrder: { findUnique: jest.fn(), updateMany: jest.fn() } }
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_ORDERS_EDIT: ['EDIT'] } }))
jest.mock('../../lib/shop/guard', () => ({ requireShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/events', () => ({ logOrderEvent: jest.fn() }))
jest.mock('../../lib/shop/orderMails', () => ({ ...jest.requireActual('../../lib/shop/orderMails'), sendShippedMail: jest.fn() }))

const { requireAuth } = require('../../lib/auth')
const { requireShopEnabled } = require('../../lib/shop/guard')
const { logOrderEvent } = require('../../lib/shop/events')
const { sendShippedMail } = require('../../lib/shop/orderMails')
const notes = require('../../pages/api/shop/orders/[id]/notes').default
const tracking = require('../../pages/api/shop/orders/[id]/tracking').default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
  requireShopEnabled.mockResolvedValue(true)
})

describe('guards', () => {
  test('EDIT right, auth failure and disabled add-on stop before the database', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
    await notes({ method: 'POST', query: { id: 'x' }, body: { message: 'a' } }, makeRes())
    await tracking({ method: 'PUT', query: { id: 'x' }, body: {} }, makeRes())
    expect(requireAuth.mock.calls.map((c) => c[2])).toEqual([['EDIT'], ['EDIT']])

    mockPrisma.shopOrder.findUnique.mockClear()
    requireAuth.mockResolvedValue({ authorized: false, error: 'nein', status: 403 })
    let res = makeRes()
    await notes({ method: 'POST', query: { id: 'x' }, body: { message: 'a' } }, res)
    expect(res.status).toHaveBeenCalledWith(403)
    requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
    requireShopEnabled.mockResolvedValue(false)
    await tracking({ method: 'PUT', query: { id: 'x' }, body: {} }, makeRes())
    expect(mockPrisma.shopOrder.findUnique).not.toHaveBeenCalled()
  })
})

describe('POST notes', () => {
  test('writes a NOTE event with the user id', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue({ id: 'o1' })
    const res = makeRes()
    await notes({ method: 'POST', query: { id: 'o1' }, body: { message: '  Kunde ruft zurück ' } }, res)
    expect(logOrderEvent).toHaveBeenCalledWith('o1', 'NOTE', 'Kunde ruft zurück', { userId: 'u1' })
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  test('empty or too long message -> 422, unknown order -> 404, wrong method -> 405', async () => {
    for (const message of ['', '   ', 'x'.repeat(2001), 5, undefined]) {
      const res = makeRes()
      await notes({ method: 'POST', query: { id: 'o1' }, body: { message } }, res)
      expect(res.status).toHaveBeenCalledWith(422)
    }
    expect(logOrderEvent).not.toHaveBeenCalled()
    mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
    let res = makeRes()
    await notes({ method: 'POST', query: { id: 'zz' }, body: { message: 'a' } }, res)
    expect(res.status).toHaveBeenCalledWith(404)
    res = makeRes()
    await notes({ method: 'GET', query: { id: 'o1' } }, res)
    expect(res.status).toHaveBeenCalledWith(405)
  })
})

describe('PUT tracking', () => {
  test('sets the fields on PAID/SHIPPED orders, logs TRACKING, sends no mail', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue({ id: 'o1' })
    mockPrisma.shopOrder.updateMany.mockResolvedValue({ count: 1 })
    const res = makeRes()
    await tracking({ method: 'PUT', query: { id: 'o1' }, body: { carrier: 'DHL', trackingNumber: '123', trackingUrl: 'https://dhl.de/1' } }, res)
    const arg = mockPrisma.shopOrder.updateMany.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'o1', status: { in: ['PAID', 'SHIPPED'] } })
    expect(arg.data).toEqual({ trackingCarrier: 'DHL', trackingNumber: '123', trackingUrl: 'https://dhl.de/1' })
    expect(logOrderEvent).toHaveBeenCalledWith('o1', 'TRACKING', expect.any(String), { userId: 'u1' })
    expect(sendShippedMail).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test('empty values clear the fields', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue({ id: 'o1' })
    mockPrisma.shopOrder.updateMany.mockResolvedValue({ count: 1 })
    await tracking({ method: 'PUT', query: { id: 'o1' }, body: { carrier: '' } }, makeRes())
    expect(mockPrisma.shopOrder.updateMany.mock.calls[0][0].data).toEqual({ trackingCarrier: null, trackingNumber: null, trackingUrl: null })
  })

  test('invalid -> 422, wrong status -> 409, unknown -> 404', async () => {
    let res = makeRes()
    await tracking({ method: 'PUT', query: { id: 'o1' }, body: { trackingUrl: 'http://x.de' } }, res)
    expect(res.status).toHaveBeenCalledWith(422)
    expect(mockPrisma.shopOrder.updateMany).not.toHaveBeenCalled()

    mockPrisma.shopOrder.findUnique.mockResolvedValue({ id: 'o1' })
    mockPrisma.shopOrder.updateMany.mockResolvedValue({ count: 0 })
    res = makeRes()
    await tracking({ method: 'PUT', query: { id: 'o1' }, body: { carrier: 'DHL' } }, res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(logOrderEvent).not.toHaveBeenCalled()

    mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
    res = makeRes()
    await tracking({ method: 'PUT', query: { id: 'zz' }, body: {} }, res)
    expect(res.status).toHaveBeenCalledWith(404)
  })
})
