/**
 * __tests__/shopRefunds.test.js
 * createRefund gegen einen zustandsbehafteten Prisma-Fake; Treiber, Mails, Ereignisse gemockt.
 */

jest.disableAutomock()

const db = { orders: [], payments: [], refunds: [], items: [], formats: [], movements: [], products: [] }
const mockPrisma = {}
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../lib/shop/config', () => ({ loadShopSettings: jest.fn(async () => ({ shop_x: 'y' })) }))
jest.mock('../lib/shop/orderMails', () => ({ sendPaidMails: jest.fn(), sendRefundMail: jest.fn(async () => {}) }))
jest.mock('../lib/shop/events', () => ({ logOrderEvent: jest.fn(async () => {}) }))
const mockDriver = { refundPayment: jest.fn() }
jest.mock('../lib/shop/providers', () => ({
  getProvider: (id) => (id === 'sumup' ? mockDriver : id === 'nodriver' ? {} : null),
  isProviderAvailable: () => true,
}))

const { createRefund, ShopRefundError } = require('../lib/shop/refunds')
const { sendRefundMail } = require('../lib/shop/orderMails')
const { logOrderEvent } = require('../lib/shop/events')

const match = (row, where) => Object.entries(where).every(([k, v]) => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('lte' in v) return row[k] <= v.lte
    if ('gte' in v) return row[k] !== null && row[k] >= v.gte
    if ('not' in v) return row[k] !== v.not
    if ('in' in v) return v.in.includes(row[k])
    return false
  }
  return row[k] === v
})

Object.assign(mockPrisma, {
  $transaction: async (fn) => fn(mockPrisma),
  shopOrder: {
    findUnique: async ({ where }) => { const o = db.orders.find((x) => x.id === where.id); return o ? { ...o } : null },
    updateMany: async ({ where, data }) => {
      await Promise.resolve() // erlaubt Verschränkung paralleler Aufrufe
      const rows = db.orders.filter((o) => match(o, where))
      rows.forEach((o) => Object.entries(data).forEach(([k, v]) => { o[k] = v && typeof v === 'object' && 'increment' in v ? o[k] + v.increment : v }))
      return { count: rows.length }
    },
  },
  shopPayment: { findFirst: async ({ where }) => db.payments.find((p) => match(p, where)) || null },
  shopRefund: {
    findMany: async ({ where }) => db.refunds.filter((r) => match(r, where)).map((r) => ({ ...r })),
    create: async ({ data }) => { const r = { id: `r${db.refunds.length + 1}`, error: null, externalId: null, ...data }; db.refunds.push(r); return { ...r } },
    update: async ({ where, data }) => {
      const r = db.refunds.find((x) => x.id === where.id)
      Object.entries(data).forEach(([k, v]) => { if (v !== undefined) r[k] = v })
      return { ...r }
    },
  },
  shopOrderItem: { findMany: async ({ where }) => db.items.filter((i) => i.orderId === where.orderId) },
  shopProduct: { update: async ({ where, data }) => Object.assign(db.products.find((p) => p.id === where.id), data) },
  shopFormat: {
    findUnique: async ({ where }) => { const f = db.formats.find((x) => x.id === where.id); return f ? { ...f } : null },
    updateMany: async ({ where, data }) => {
      const rows = db.formats.filter((f) => f.id === where.id && f.stock !== null)
      rows.forEach((f) => { f.stock += data.stock.increment })
      return { count: rows.length }
    },
  },
  shopStockMovement: {
    createMany: async ({ data }) => {
      let count = 0
      for (const d of data) {
        if (db.movements.some((m) => m.orderId === d.orderId && m.sku === d.sku && m.reason === d.reason)) continue
        db.movements.push(d)
        count++
      }
      return { count }
    },
  },
})

const order = () => db.orders[0]
const stock = (id) => db.formats.find((f) => f.id === id).stock

beforeEach(() => {
  db.orders = [{ id: 'o1', reference: 'ORD-1', status: 'PAID', totalCents: 5000, refundedCents: 0, currency: 'EUR' }]
  db.payments = [{ id: 'p1', orderId: 'o1', provider: 'SUMUP', externalId: 'x1', status: 'PAID', amountCents: 5000, currency: 'EUR' }]
  db.refunds = []
  db.items = [
    { orderId: 'o1', formatId: 'f1', sku: 'A', qty: 2, digital: false },
    { orderId: 'o1', formatId: 'f2', sku: 'PDF', qty: 1, digital: true },
    { orderId: 'o1', formatId: 'f3', sku: 'INF', qty: 4, digital: false },
    { orderId: 'o1', formatId: 'fb', sku: 'BUN', qty: 2, digital: false, bundleItems: [{ formatId: 'f1', sku: 'A', qty: 1, digital: false }, { formatId: 'f2', sku: 'PDF', qty: 1, digital: true }] },
  ]
  db.formats = [{ id: 'f1', stock: 5, productId: 'pr' }, { id: 'f2', stock: 9, productId: 'pr' }, { id: 'f3', stock: null, productId: 'pr' }, { id: 'fb', stock: null, productId: 'pr' }]
  db.products = [{ id: 'pr', updatedAt: new Date(0) }]
  db.movements = []
  mockDriver.refundPayment.mockReset().mockResolvedValue({ externalId: 'rf1', status: 'SUCCEEDED' })
  sendRefundMail.mockReset().mockResolvedValue()
  logOrderEvent.mockClear()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

const refund = (o = {}) => createRefund({ order: { ...order() }, userId: 'u1', ...o })
const code = async (p) => { try { await p } catch (e) { expect(e).toBeInstanceOf(ShopRefundError); return e.code } return null }

describe('createRefund: Erfolg', () => {
  test('Teilerstattung: refundedCents erhöht, Status bleibt, Treiber bekommt alle Felder, Mail und Ereignis', async () => {
    const r = await refund({ amountCents: 1500, reason: 'Kulanz' })
    expect(r.full).toBe(false)
    expect(r.refund).toMatchObject({ status: 'SUCCEEDED', amountCents: 1500, externalId: 'rf1', reason: 'Kulanz', userId: 'u1', paymentId: 'p1' })
    expect(order()).toMatchObject({ status: 'PAID', refundedCents: 1500 })
    const arg = mockDriver.refundPayment.mock.calls[0][0]
    expect(arg).toMatchObject({ externalId: 'x1', amountCents: 1500, currency: 'EUR', reason: 'Kulanz', settings: { shop_x: 'y' }, idempotencyKey: 'r1' })
    expect(sendRefundMail).toHaveBeenCalledTimes(1)
    expect(logOrderEvent.mock.calls.some((c) => c[1] === 'REFUND')).toBe(true)
    expect(db.movements).toHaveLength(0)
  })

  test('Betrag fehlt: Rest wird erstattet, Vollerstattung -> REFUNDED', async () => {
    const r = await refund()
    expect(r.full).toBe(true)
    expect(order()).toMatchObject({ status: 'REFUNDED', refundedCents: 5000 })
    expect(r.order.status).toBe('REFUNDED')
  })

  test('zwei Teilerstattungen ergeben Vollerstattung, SHIPPED ist erlaubt', async () => {
    order().status = 'SHIPPED'
    await refund({ amountCents: 2000 })
    expect(order().status).toBe('SHIPPED')
    await refund({ amountCents: 3000 })
    expect(order()).toMatchObject({ status: 'REFUNDED', refundedCents: 5000 })
  })

  test('notifyCustomer false: keine Mail; Mailfehler bricht nicht ab und wird als MAIL_ERROR vermerkt', async () => {
    await refund({ amountCents: 100, notifyCustomer: false })
    expect(sendRefundMail).not.toHaveBeenCalled()
    sendRefundMail.mockRejectedValue(new Error('smtp'))
    const r = await refund({ amountCents: 100 })
    expect(r.mailError).toBe(true)
    expect(order().refundedCents).toBe(200)
    expect(logOrderEvent).toHaveBeenCalledWith('o1', 'MAIL_ERROR', expect.any(String))
  })
})

describe('createRefund: Prüfungen', () => {
  test.each(['PENDING', 'FAILED', 'CANCELLED', 'REFUNDED'])('Status %s: REFUND_NOT_ALLOWED, kein Anbieteraufruf', async (s) => {
    order().status = s
    expect(await code(refund({ amountCents: 100 }))).toBe('REFUND_NOT_ALLOWED')
    expect(mockDriver.refundPayment).not.toHaveBeenCalled()
    expect(db.refunds).toHaveLength(0)
  })

  test('keine erfolgreiche Zahlung / Anbieter ohne refundPayment', async () => {
    db.payments[0].status = 'FAILED'
    expect(await code(refund({ amountCents: 100 }))).toBe('REFUND_NOT_ALLOWED')
    db.payments[0].status = 'PAID'
    db.payments[0].provider = 'NODRIVER'
    expect(await code(refund({ amountCents: 100 }))).toBe('REFUND_NOT_ALLOWED')
    db.payments[0].provider = 'UNKNOWN'
    expect(await code(refund({ amountCents: 100 }))).toBe('REFUND_NOT_ALLOWED')
  })

  test.each([0, -5, 1.5, '100', NaN, 5001])('Betrag %p: AMOUNT_INVALID', async (a) => {
    expect(await code(refund({ amountCents: a }))).toBe('AMOUNT_INVALID')
    expect(mockDriver.refundPayment).not.toHaveBeenCalled()
  })

  test('Überschreitung des Restbetrags', async () => {
    await refund({ amountCents: 4000 })
    expect(await code(refund({ amountCents: 1001 }))).toBe('AMOUNT_INVALID')
    expect(order().refundedCents).toBe(4000)
  })

  test('Doppelklick: Anbieter-PENDING wird verbucht, zweite Erstattung scheitert am Restbetrag', async () => {
    mockDriver.refundPayment.mockResolvedValue({ externalId: 'rf1', status: 'PENDING' })
    const a = await refund({ amountCents: 5000 })
    expect(a.refund.status).toBe('SUCCEEDED')
    expect(order().refundedCents).toBe(5000)
    expect(await code(refund({ amountCents: 5000 }))).toBe('REFUND_NOT_ALLOWED')
    expect(mockDriver.refundPayment).toHaveBeenCalledTimes(1)
  })
})

describe('createRefund: Parallelität', () => {
  test('zwei gleichzeitige Vollerstattungen: höchstens eine wird verbucht, nie über den Gesamtbetrag', async () => {
    const results = await Promise.allSettled([refund({ amountCents: 5000 }), refund({ amountCents: 5000 })])
    expect(order().refundedCents).toBeLessThanOrEqual(5000)
    expect(order().refundedCents).toBe(5000)
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected')
    expect(['REFUND_NOT_ALLOWED', 'AMOUNT_INVALID']).toContain(rejected.reason.code)
    // wurde der Anbieter doppelt gerufen, ist die zweite Erstattung sichtbar markiert statt verschwiegen
    if (mockDriver.refundPayment.mock.calls.length === 2) {
      expect(db.refunds.some((r) => /Anbieter prüfen/.test(r.error || ''))).toBe(true)
    }
  })
})

describe('createRefund: Anbieterfehler', () => {
  test('Treiber wirft: Refund FAILED mit gekürztem Fehler, kein Statuswechsel, PROVIDER_ERROR', async () => {
    mockDriver.refundPayment.mockRejectedValue(new Error('x'.repeat(900)))
    expect(await code(refund({ amountCents: 100 }))).toBe('PROVIDER_ERROR')
    expect(db.refunds[0].status).toBe('FAILED')
    expect(db.refunds[0].error.length).toBeLessThanOrEqual(300)
    expect(order()).toMatchObject({ status: 'PAID', refundedCents: 0 })
    expect(sendRefundMail).not.toHaveBeenCalled()
  })

  test('Treiber meldet FAILED', async () => {
    mockDriver.refundPayment.mockResolvedValue({ externalId: 'rf9', status: 'FAILED' })
    expect(await code(refund({ amountCents: 100 }))).toBe('PROVIDER_ERROR')
    expect(db.refunds[0]).toMatchObject({ status: 'FAILED', externalId: 'rf9' })
    expect(order().refundedCents).toBe(0)
  })

  test('nach Fehlschlag ist derselbe Betrag erneut erstattbar', async () => {
    mockDriver.refundPayment.mockRejectedValueOnce(new Error('boom'))
    await code(refund({ amountCents: 5000 }))
    const r = await refund({ amountCents: 5000 })
    expect(r.full).toBe(true)
  })

  test('Anbieter-PENDING wird wie Erfolg verbucht', async () => {
    mockDriver.refundPayment.mockResolvedValue({ externalId: 'rf2', status: 'PENDING' })
    const r = await refund({ amountCents: 100 })
    expect(r.refund).toMatchObject({ status: 'SUCCEEDED', externalId: 'rf2' })
    expect(order().refundedCents).toBe(100)
  })

  test('unbekannter Treiberstatus gilt als FAILED', async () => {
    mockDriver.refundPayment.mockResolvedValue({ externalId: 'r', status: 'WHATEVER' })
    expect(await code(refund({ amountCents: 100 }))).toBe('PROVIDER_ERROR')
  })
})

describe('createRefund: restock', () => {
  test('Vollerstattung mit restock: nicht-digitale bestandsgeführte Positionen und Bündelbestandteile zurück', async () => {
    await refund({ restock: true })
    expect(stock('f1')).toBe(5 + 2 + 2) // Einzelposition 2 + Bündel 1 x 2
    expect(stock('f2')).toBe(9) // digital
    expect(stock('f3')).toBeNull() // unbegrenzt
    expect(db.movements).toEqual([{ sku: 'A', delta: 4, reason: 'REFUND_RESTOCK', orderId: 'o1' }])
  })

  test('Teilerstattung mit restock bucht nichts zurück', async () => {
    await refund({ amountCents: 1000, restock: true })
    expect(stock('f1')).toBe(5)
    expect(db.movements).toHaveLength(0)
  })

  test('ohne restock bleibt der Bestand', async () => {
    await refund({})
    expect(stock('f1')).toBe(5)
  })

  test('restock ist idempotent über die Movement-Eindeutigkeit', async () => {
    await refund({ restock: true })
    db.orders[0].status = 'PAID' // Wiederholung (z. B. manuell zurückgesetzt) darf nicht doppelt buchen
    db.orders[0].refundedCents = 0
    await refund({ restock: true })
    expect(stock('f1')).toBe(9)
    expect(db.movements).toHaveLength(1)
  })

  test('Fehler bei der Rückbuchung verhindern die Erstattung nicht', async () => {
    const orig = mockPrisma.shopStockMovement.createMany
    mockPrisma.shopStockMovement.createMany = jest.fn(async () => { throw new Error('db') })
    const r = await refund({ restock: true })
    mockPrisma.shopStockMovement.createMany = orig
    expect(r.full).toBe(true)
    expect(order().status).toBe('REFUNDED')
  })
})
