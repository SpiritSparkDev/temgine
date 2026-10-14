jest.disableAutomock()

const mockPrisma = { shopOrder: { findMany: jest.fn(), updateMany: jest.fn() } }
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../lib/shop/settingsStore', () => ({ getNumberSetting: jest.fn() }))
jest.mock('../lib/shop/payments', () => ({ reconcileOpenPayments: jest.fn() }))
jest.mock('../lib/shop/reservations', () => ({ releaseExpired: jest.fn(), releaseReservations: jest.fn() }))
jest.mock('../lib/shop/events', () => ({ logOrderEvent: jest.fn() }))

const { getNumberSetting } = require('../lib/shop/settingsStore')
const { reconcileOpenPayments } = require('../lib/shop/payments')
const { releaseExpired, releaseReservations } = require('../lib/shop/reservations')
const { logOrderEvent } = require('../lib/shop/events')
const { runShopJobs } = require('../lib/shop/cron')

beforeEach(() => {
  jest.clearAllMocks()
  getNumberSetting.mockResolvedValue(3)
  reconcileOpenPayments.mockResolvedValue({ checked: 5, paid: 2, failed: 1, pending: 2 })
  releaseExpired.mockResolvedValue(4)
  mockPrisma.shopOrder.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }])
  mockPrisma.shopOrder.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

test('runShopJobs führt alle Jobs aus und storniert bedingt', async () => {
  const now = new Date('2026-01-10T00:00:00Z')
  const res = await runShopJobs({ now })
  expect(res).toEqual({ reconciled: 3, expiredReservations: 4, cancelledOrders: 1 })
  expect(reconcileOpenPayments).toHaveBeenCalledWith({ limit: 50, now })
  const q = mockPrisma.shopOrder.findMany.mock.calls[0][0]
  expect(q.where).toMatchObject({ status: 'PENDING', createdAt: { lt: new Date('2026-01-07T00:00:00Z') }, payments: { none: { status: 'PENDING' } } })
  expect(q.take).toBe(200)
  expect(mockPrisma.shopOrder.updateMany.mock.calls[0][0]).toEqual({ where: { id: 'o1', status: 'PENDING' }, data: { status: 'CANCELLED', cancelledAt: now } })
  expect(releaseReservations).toHaveBeenCalledTimes(1)
  expect(releaseReservations).toHaveBeenCalledWith('o1')
  expect(logOrderEvent).toHaveBeenCalledWith('o1', 'CANCELLED', 'Automatisch storniert (unbezahlt)')
})

test('Fehler im Abgleich werden abgefangen', async () => {
  reconcileOpenPayments.mockRejectedValue(new Error('boom'))
  const res = await runShopJobs({ now: new Date() })
  expect(res.reconciled).toBe(0)
  expect(res.expiredReservations).toBe(4)
})
