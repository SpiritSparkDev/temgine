jest.disableAutomock()

const mockPrisma = { shopReservation: { findMany: jest.fn(), updateMany: jest.fn() } }
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../lib/shop/settingsStore', () => ({ getNumberSetting: jest.fn() }))

const { getNumberSetting } = require('../lib/shop/settingsStore')
const r = require('../lib/shop/reservations')

beforeEach(() => { jest.clearAllMocks(); getNumberSetting.mockResolvedValue(30) })

test('reservationMinutes: Standard und Bereich', async () => {
  getNumberSetting.mockResolvedValue(0)
  expect(await r.reservationMinutes()).toBe(30)
  getNumberSetting.mockResolvedValue(5000)
  expect(await r.reservationMinutes()).toBe(30)
  getNumberSetting.mockResolvedValue(45)
  expect(await r.reservationMinutes()).toBe(45)
})

test('reservedByOthers summiert je Format und schließt eigene Bestellung aus', async () => {
  const now = new Date()
  mockPrisma.shopReservation.findMany.mockResolvedValue([{ formatId: 'a', qty: 2 }, { formatId: 'a', qty: 1 }, { formatId: 'b', qty: 4 }])
  const m = await r.reservedByOthers(['a', 'b', 'a'], { excludeOrderId: 'o1', now })
  expect(m.get('a')).toBe(3)
  expect(m.get('b')).toBe(4)
  expect(mockPrisma.shopReservation.findMany.mock.calls[0][0].where).toMatchObject({
    formatId: { in: ['a', 'b'] }, status: 'ACTIVE', expiresAt: { gt: now }, orderId: { not: 'o1' },
  })
  expect((await r.reservedByOthers([])).size).toBe(0)
})

test('reserveStock: nur bestandsgeführte physische Formate, Bündel je Bestandteil', async () => {
  const now = new Date('2026-01-01T10:00:00Z')
  const client = {
    shopFormat: { findMany: jest.fn().mockResolvedValue([
      { id: 'p', stock: 10, digital: false }, { id: 'u', stock: null, digital: false }, { id: 'c1', stock: 5, digital: false },
    ]) },
    shopReservation: { create: jest.fn(async ({ data }) => data) },
  }
  const lines = [
    { formatId: 'p', qty: 2, digital: false },
    { formatId: 'u', qty: 1, digital: false },
    { formatId: 'd', qty: 1, digital: true },
    { formatId: 'bundle', qty: 3, digital: false, bundle: [{ formatId: 'c1', qty: 2, digital: false }, { formatId: 'x', qty: 1, digital: true }] },
  ]
  const out = await r.reserveStock(client, { orderId: 'o1', lines, now })
  expect(client.shopFormat.findMany.mock.calls[0][0].where.id.in.sort()).toEqual(['c1', 'p', 'u'])
  expect(out.map((o) => [o.formatId, o.qty]).sort()).toEqual([['c1', 6], ['p', 2]])
  expect(out[0].expiresAt).toEqual(new Date('2026-01-01T10:30:00Z'))
  expect(await r.reserveStock(client, { orderId: 'o1', lines: [] , now })).toEqual([])
})

test('Statuswechsel per bedingtem updateMany', async () => {
  mockPrisma.shopReservation.updateMany.mockResolvedValue({ count: 2 })
  expect(await r.consumeReservations('o1')).toBe(2)
  expect(mockPrisma.shopReservation.updateMany).toHaveBeenLastCalledWith({ where: { orderId: 'o1', status: 'ACTIVE' }, data: { status: 'CONSUMED' } })
  await r.releaseReservations('o1')
  expect(mockPrisma.shopReservation.updateMany.mock.calls[1][0].data).toEqual({ status: 'RELEASED' })
  const now = new Date()
  expect(await r.releaseExpired(now)).toBe(2)
  expect(mockPrisma.shopReservation.updateMany.mock.calls[2][0].where).toEqual({ status: 'ACTIVE', expiresAt: { lte: now } })
})
