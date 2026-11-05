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
    $queryRaw: jest.fn().mockResolvedValue([
      { id: 'p', stock: 10, digital: false }, { id: 'u', stock: null, digital: false }, { id: 'c1', stock: 10, digital: false },
    ]),
    shopReservation: { create: jest.fn(async ({ data }) => data), aggregate: jest.fn().mockResolvedValue({ _sum: { qty: 1 } }) },
  }
  const lines = [
    { formatId: 'p', qty: 2, digital: false },
    { formatId: 'u', qty: 1, digital: false },
    { formatId: 'd', qty: 1, digital: true },
    { formatId: 'bundle', qty: 3, digital: false, bundle: [{ formatId: 'c1', qty: 2, digital: false }, { formatId: 'x', qty: 1, digital: true }] },
  ]
  const out = await r.reserveStock(client, { orderId: 'o1', lines, now })
  expect(client.$queryRaw).toHaveBeenCalledTimes(1)
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

describe('reserveStock Bestandspruefung', () => {
  const mk = (rows, sum) => ({
    $queryRaw: jest.fn().mockResolvedValue(rows),
    shopReservation: { create: jest.fn(async ({ data }) => data), aggregate: jest.fn().mockResolvedValue({ _sum: { qty: sum } }) },
  })
  const lines = [{ formatId: 'p', qty: 3, digital: false }]

  test('Summe aktiver Reservierungen (inkl. eigener) ueber Bestand -> STOCK_EXCEEDED', async () => {
    const client = mk([{ id: 'p', stock: 5, digital: false }], 6)
    await expect(r.reserveStock(client, { orderId: 'o1', lines })).rejects.toMatchObject({ code: 'STOCK_EXCEEDED' })
    expect(client.shopReservation.aggregate.mock.calls[0][0].where).toMatchObject({ formatId: 'p', status: 'ACTIVE' })
  })
  test('genau Bestand ist erlaubt (Grenzfall)', async () => {
    const client = mk([{ id: 'p', stock: 5, digital: false }], 5)
    expect(await r.reserveStock(client, { orderId: 'o1', lines })).toHaveLength(1)
  })
  test('unbegrenzte Formate ohne Pruefung', async () => {
    const client = mk([{ id: 'p', stock: null, digital: false }], 999)
    expect(await r.reserveStock(client, { orderId: 'o1', lines })).toEqual([])
    expect(client.shopReservation.aggregate).not.toHaveBeenCalled()
  })
  test('zweiter (serialisierter) Checkout sieht die Reservierung des ersten und scheitert', async () => {
    let reserved = 0
    const client = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'p', stock: 4, digital: false }]),
      shopReservation: {
        create: jest.fn(async ({ data }) => { reserved += data.qty; return data }),
        aggregate: jest.fn(async () => ({ _sum: { qty: reserved } })),
      },
    }
    await r.reserveStock(client, { orderId: 'a', lines: [{ formatId: 'p', qty: 3, digital: false }] })
    await expect(r.reserveStock(client, { orderId: 'b', lines: [{ formatId: 'p', qty: 3, digital: false }] })).rejects.toMatchObject({ code: 'STOCK_EXCEEDED' })
  })
})
