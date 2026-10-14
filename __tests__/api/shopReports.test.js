/**
 * __tests__/api/shopReports.test.js
 * lib/shop/reports.js, csv.js, lowStock.js und /api/shop/reports/overview
 */

jest.disableAutomock()

const mockPrisma = {
  shopOrder: { aggregate: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
  shopOrderItem: { groupBy: jest.fn() },
  shopFormat: { findMany: jest.fn() },
}
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_REPORTS_VIEW: ['REPORTS'] } }))
jest.mock('../../lib/shop/guard', () => ({ requireShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/settingsStore', () => ({
  ...jest.requireActual('../../lib/shop/settingsStore'),
  getSetting: jest.fn(),
  getShopSettings: jest.fn(),
}))
jest.mock('../../lib/shop/orderMails', () => ({ sendLowStockMail: jest.fn() }))

const { requireAuth } = require('../../lib/auth')
const { requireShopEnabled } = require('../../lib/shop/guard')
const { getSetting, getShopSettings } = require('../../lib/shop/settingsStore')
const { sendLowStockMail } = require('../../lib/shop/orderMails')
const { getOverview } = require('../../lib/shop/reports')
const { toCsv, formatCents } = require('../../lib/shop/csv')
const { notifyLowStock } = require('../../lib/shop/lowStock')
const overview = require('../../pages/api/shop/reports/overview').default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}

const NOW = new Date(2026, 9, 14, 12, 0, 0) // lokale Zeit, wie die Tagesgrenzen im Bericht
const sumOf = (total, refunded, n) => ({ _sum: { totalCents: total, refundedCents: refunded }, _count: { _all: n } })

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  getShopSettings.mockResolvedValue({})
  getSetting.mockResolvedValue(null)
  mockPrisma.shopOrder.aggregate.mockResolvedValue(sumOf(null, null, 0))
  mockPrisma.shopOrder.groupBy.mockResolvedValue([])
  mockPrisma.shopOrder.findMany.mockResolvedValue([])
  mockPrisma.shopOrderItem.groupBy.mockResolvedValue([])
  mockPrisma.shopFormat.findMany.mockResolvedValue([])
})

describe('getOverview', () => {
  test('no data: zeros, 30 gapless days, no low stock query without threshold', async () => {
    const o = await getOverview({ now: NOW })
    expect(o.revenue).toEqual({ last7: 0, last30: 0, total: 0 })
    expect(o.orders).toEqual({ byStatus: {}, open: 0 })
    expect(o.averageOrderCents).toBe(0)
    expect(o.refundedCents).toBe(0)
    expect(o.currency).toBe('EUR')
    expect(o.perDay).toHaveLength(30)
    expect(o.perDay[0].date).toBe('2026-09-15')
    expect(o.perDay[29]).toEqual({ date: '2026-10-14', count: 0, revenueCents: 0 })
    expect(o.lowStock).toEqual([])
    expect(mockPrisma.shopFormat.findMany).not.toHaveBeenCalled()
  })

  test('revenue subtracts refunds, status filter covers PAID/SHIPPED/REFUNDED, windows by paidAt', async () => {
    mockPrisma.shopOrder.aggregate
      .mockResolvedValueOnce(sumOf(5000, 1000, 2))
      .mockResolvedValueOnce(sumOf(9000, 1000, 3))
      .mockResolvedValueOnce(sumOf(20000, 2500, 4))
    mockPrisma.shopOrder.groupBy
      .mockResolvedValueOnce([{ status: 'PENDING', _count: { _all: 2 } }, { status: 'PAID', _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ couponCode: 'SOMMER', _count: { _all: 2 }, _sum: { discountCents: 700 } }])
    const o = await getOverview({ now: NOW })
    expect(o.revenue).toEqual({ last7: 4000, last30: 8000, total: 17500 })
    expect(o.refundedCents).toBe(2500)
    expect(o.averageOrderCents).toBe(5000)
    expect(o.orders).toEqual({ byStatus: { PENDING: 2, PAID: 3 }, open: 2 })
    expect(o.topCoupons).toEqual([{ code: 'SOMMER', uses: 2, discountCents: 700 }])
    const w7 = mockPrisma.shopOrder.aggregate.mock.calls[0][0].where
    expect(w7.status).toEqual({ in: ['PAID', 'SHIPPED', 'REFUNDED'] })
    expect(w7.paidAt.gte).toEqual(new Date(NOW.getTime() - 7 * 86400000))
  })

  test('average is rounded to whole cents', async () => {
    mockPrisma.shopOrder.aggregate
      .mockResolvedValueOnce(sumOf(0, 0, 0))
      .mockResolvedValueOnce(sumOf(0, 0, 0))
      .mockResolvedValueOnce(sumOf(1000, 0, 3))
    expect((await getOverview({ now: NOW })).averageOrderCents).toBe(333)
  })

  test('perDay buckets by local day, ignores rows outside the window, nets refunds', async () => {
    mockPrisma.shopOrder.findMany.mockResolvedValue([
      { paidAt: new Date(2026, 9, 14, 0, 0, 0), totalCents: 3000, refundedCents: 500 },
      { paidAt: new Date(2026, 9, 14, 23, 59, 59), totalCents: 1000, refundedCents: 0 },
      { paidAt: new Date(2026, 8, 15, 0, 0, 0), totalCents: 700, refundedCents: 0 },
      { paidAt: new Date(2026, 8, 14, 23, 59, 59), totalCents: 999, refundedCents: 0 },
    ])
    const o = await getOverview({ now: NOW })
    expect(o.perDay[29]).toEqual({ date: '2026-10-14', count: 2, revenueCents: 3500 })
    expect(o.perDay[0]).toEqual({ date: '2026-09-15', count: 1, revenueCents: 700 })
    expect(mockPrisma.shopOrder.findMany.mock.calls[0][0].where.paidAt.gte).toEqual(new Date(2026, 8, 15))
  })

  test('topProducts and lowStock with threshold', async () => {
    getSetting.mockResolvedValue('3')
    mockPrisma.shopOrderItem.groupBy.mockResolvedValue([{ title: 'A', _sum: { qty: 9 } }, { title: 'B', _sum: { qty: 4 } }])
    mockPrisma.shopFormat.findMany.mockResolvedValue([{ sku: 'X-1', label: 'Hardcover', stock: 2, product: { title: 'Buch' } }])
    const o = await getOverview({ now: NOW })
    expect(o.topProducts).toEqual([{ title: 'A', units: 9 }, { title: 'B', units: 4 }])
    expect(mockPrisma.shopOrderItem.groupBy.mock.calls[0][0].take).toBe(5)
    expect(o.lowStock).toEqual([{ sku: 'X-1', label: 'Hardcover', title: 'Buch', stock: 2 }])
    expect(mockPrisma.shopFormat.findMany.mock.calls[0][0].where).toEqual({ stock: { not: null, lte: 3 }, digital: false, product: { active: true } })
  })
})

describe('/api/shop/reports/overview', () => {
  beforeEach(() => {
    requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
    requireShopEnabled.mockResolvedValue(true)
  })

  test('uses SHOP_REPORTS_VIEW, no-store, 200', async () => {
    const res = makeRes()
    await overview({ method: 'GET', query: {} }, res)
    expect(requireAuth.mock.calls[0][2]).toEqual(['REPORTS'])
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test('auth failure, add-on off, wrong method', async () => {
    requireAuth.mockResolvedValueOnce({ authorized: false, error: 'Zugriff verweigert', status: 403 })
    let res = makeRes()
    await overview({ method: 'GET' }, res)
    expect(res.status).toHaveBeenCalledWith(403)
    requireShopEnabled.mockResolvedValueOnce(false)
    res = makeRes()
    await overview({ method: 'GET' }, res)
    expect(res.status).not.toHaveBeenCalled()
    res = makeRes()
    await overview({ method: 'POST' }, res)
    expect(res.status).toHaveBeenCalledWith(405)
  })
})

describe('csv', () => {
  test('formatCents', () => {
    expect(formatCents(2490)).toBe('24,90')
    expect(formatCents(5)).toBe('0,05')
    expect(formatCents(-500)).toBe('-5,00')
    expect(formatCents(null)).toBe('')
  })

  test('separator, CRLF, quote escaping, no BOM', () => {
    const csv = toCsv([{ a: 'x;y', b: 'sagt "hi"', c: 'zwei\nZeilen' }], [{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }, { key: 'c', header: 'C' }])
    expect(csv).toBe('A;B;C\r\n"x;y";"sagt ""hi""";"zwei\nZeilen"\r\n')
  })

  test('formula guard for text, not for number cells', () => {
    const cols = [{ key: 't', header: 'T' }, { key: 'n', header: 'N', number: true }]
    for (const t of ['=1+1', '+1', '-1', '@x']) {
      expect(toCsv([{ t, n: '' }], cols).split('\r\n')[1].startsWith("'" + t)).toBe(true)
    }
    expect(toCsv([{ t: '\tx', n: '' }], cols)).toContain("'\tx")
    expect(toCsv([{ t: '=A1', n: '-5,00' }], cols)).toBe("T;N\r\n'=A1;-5,00\r\n")
    expect(toCsv([{ t: 'ok', n: 7 }], cols)).toBe('T;N\r\nok;7\r\n')
    expect(toCsv([{ t: null, n: undefined }], cols)).toBe('T;N\r\n;\r\n')
  })
})

describe('notifyLowStock', () => {
  const fmt = [{ id: 'f1', sku: 'S1', label: 'HC', product: { title: 'Buch' } }]

  test('threshold empty: nothing', async () => {
    getSetting.mockResolvedValue(null)
    expect(await notifyLowStock([{ formatId: 'f1', sku: 'S1', before: 10, after: 0 }])).toBe(0)
    expect(sendLowStockMail).not.toHaveBeenCalled()
  })

  test('exactly on crossing: before > threshold, after <= threshold', async () => {
    getSetting.mockResolvedValue('3')
    mockPrisma.shopFormat.findMany.mockResolvedValue(fmt)
    expect(await notifyLowStock([{ formatId: 'f1', sku: 'S1', before: 4, after: 3 }])).toBe(1)
    expect(sendLowStockMail).toHaveBeenCalledWith([{ sku: 'S1', label: 'HC', title: 'Buch', stock: 3, threshold: 3 }])
  })

  test('not again when already at or below the threshold, or still above', async () => {
    getSetting.mockResolvedValue('3')
    expect(await notifyLowStock([
      { formatId: 'f1', sku: 'S1', before: 3, after: 2 },
      { formatId: 'f2', sku: 'S2', before: 9, after: 4 },
    ])).toBe(0)
    expect(sendLowStockMail).not.toHaveBeenCalled()
    expect(mockPrisma.shopFormat.findMany).not.toHaveBeenCalled()
  })

  test('threshold 0 is valid; mail errors are swallowed', async () => {
    getSetting.mockResolvedValue('0')
    mockPrisma.shopFormat.findMany.mockResolvedValue(fmt)
    sendLowStockMail.mockRejectedValue(new Error('smtp'))
    expect(await notifyLowStock([{ formatId: 'f1', sku: 'S1', before: 1, after: 0 }])).toBe(0)
    expect(sendLowStockMail).toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})
