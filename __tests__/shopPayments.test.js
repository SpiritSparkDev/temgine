/**
 * __tests__/shopPayments.test.js
 * Kern der Zahlungsschicht gegen einen zustandsbehafteten Prisma-Fake; Anbieter-Treiber gemockt.
 */

jest.disableAutomock()

const db = { orders: [], payments: [], items: [], formats: [], movements: [], products: [] }
const mockPrisma = {}
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../lib/shop/config', () => ({ loadShopSettings: jest.fn(async () => ({})) }))
jest.mock('../lib/shop/orderMails', () => ({ sendPaidMails: jest.fn() }))
const mockDriver = { createPayment: jest.fn(), fetchPayment: jest.fn() }
jest.mock('../lib/shop/providers', () => ({
  getProvider: (id) => (id === 'sumup' ? mockDriver : null),
  isProviderAvailable: (id) => id === 'sumup',
}))

const { startPayment, syncPayment, markOrderPaid, onOrderPaid, afterPaid } = require('../lib/shop/payments')

const match = (row, where) => Object.entries(where).every(([k, v]) => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
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
    updateMany: async ({ where, data }) => {
      const rows = db.orders.filter((o) => match(o, where))
      rows.forEach((o) => Object.assign(o, data))
      return { count: rows.length }
    },
  },
  shopPayment: {
    findUnique: async ({ where }) => {
      const { provider, externalId } = where.provider_externalId
      const p = db.payments.find((x) => x.provider === provider && x.externalId === externalId)
      return p ? { ...p, order: db.orders.find((o) => o.id === p.orderId) } : null
    },
    create: async ({ data }) => { const p = { id: `p${db.payments.length + 1}`, ...data }; db.payments.push(p); return p },
    updateMany: async ({ where, data }) => {
      const rows = db.payments.filter((p) => match(p, where))
      rows.forEach((p) => Object.assign(p, data))
      return { count: rows.length }
    },
    count: async ({ where }) => db.payments.filter((p) => match(p, where)).length,
  },
  shopProduct: {
    update: async ({ where, data }) => { const p = db.products.find((x) => x.id === where.id); Object.assign(p, data); return p },
  },
  shopOrderItem: { findMany: async ({ where }) => db.items.filter((i) => i.orderId === where.orderId) },
  shopFormat: {
    findUnique: async ({ where }) => db.formats.find((f) => f.id === where.id) || null,
    updateMany: async ({ where, data }) => {
      const rest = Object.fromEntries(Object.entries(where).filter(([k]) => k !== 'id'))
      const rows = db.formats.filter((f) => f.id === where.id && match(f, rest))
      rows.forEach((f) => { f.stock = typeof data.stock === 'object' ? f.stock - data.stock.decrement : data.stock })
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

const remote = (o = {}) => ({ status: 'PAID', amountCents: 2400, currency: 'EUR', reference: 'ORD-2026-000001', ...o })

beforeEach(() => {
  db.orders = [{ id: 'o1', reference: 'ORD-2026-000001', status: 'PENDING', totalCents: 2400, currency: 'EUR', email: 'a@b.de', createdAt: new Date() }]
  db.payments = [{ id: 'p1', orderId: 'o1', provider: 'SUMUP', externalId: 'x1', status: 'PENDING', amountCents: 2400, currency: 'EUR' }]
  db.items = [
    { orderId: 'o1', formatId: 'f1', sku: 'A', qty: 2, digital: false },
    { orderId: 'o1', formatId: 'f2', sku: 'PDF', qty: 1, digital: true },
    { orderId: 'o1', formatId: 'f3', sku: 'INF', qty: 5, digital: false },
  ]
  db.formats = [{ id: 'f1', stock: 10, productId: 'pr1' }, { id: 'f2', stock: 7, productId: 'pr1' }, { id: 'f3', stock: null, productId: 'pr1' }]
  db.products = [{ id: 'pr1', updatedAt: new Date(0) }]
  db.movements = []
  afterPaid.length = 0
  mockDriver.fetchPayment.mockReset().mockResolvedValue(remote())
  mockDriver.createPayment.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

const sync = () => syncPayment({ provider: 'sumup', externalId: 'x1' })
const stock = (id) => db.formats.find((f) => f.id === id).stock

describe('syncPayment: bezahlt', () => {
  test('PAID mit passenden Daten: Bestellung PAID, Zahlung PAID, Bestand abgebucht, Hook einmal', async () => {
    const hook = jest.fn()
    afterPaid.push(hook)
    expect(await sync()).toBe('PAID')
    expect(db.orders[0].status).toBe('PAID')
    expect(db.orders[0].paidAt).toBeInstanceOf(Date)
    expect(db.payments[0].status).toBe('PAID')
    expect(stock('f1')).toBe(8)
    expect(stock('f2')).toBe(7) // digital unberührt
    expect(stock('f3')).toBeNull() // unbegrenzt unberührt
    expect(db.movements).toEqual([{ sku: 'A', delta: -2, reason: 'ORDER_PAID', orderId: 'o1' }])
    expect(hook).toHaveBeenCalledTimes(1)
    expect(hook.mock.calls[0][0].reference).toBe('ORD-2026-000001')
  })

  test.each([
    ['falscher Betrag', { amountCents: 100 }],
    ['zu hoher Betrag', { amountCents: 2401 }],
    ['falsche Währung', { currency: 'USD' }],
    ['falsche Referenz', { reference: 'ORD-2026-000999' }],
    ['fehlende Referenz', { reference: undefined }],
  ])('PAID mit %s bleibt PENDING, keine Abbuchung, kein Hook', async (_n, o) => {
    const hook = jest.fn()
    afterPaid.push(hook)
    mockDriver.fetchPayment.mockResolvedValue(remote(o))
    expect(await sync()).toBe('PENDING')
    expect(db.orders[0].status).toBe('PENDING')
    expect(db.payments[0].status).toBe('PENDING')
    expect(stock('f1')).toBe(10)
    expect(db.movements).toHaveLength(0)
    expect(hook).not.toHaveBeenCalled()
  })

  test('Betrag als String oder Float zählt nicht', async () => {
    mockDriver.fetchPayment.mockResolvedValue(remote({ amountCents: '2400' }))
    expect(await sync()).toBe('PENDING')
    mockDriver.fetchPayment.mockResolvedValue(remote({ amountCents: 24.0001 }))
    expect(await sync()).toBe('PENDING')
  })

  test('doppelter Aufruf nacheinander: genau einmal', async () => {
    const hook = jest.fn()
    afterPaid.push(hook)
    await sync()
    await sync()
    expect(stock('f1')).toBe(8)
    expect(db.movements).toHaveLength(1)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(mockDriver.fetchPayment).toHaveBeenCalledTimes(1)
  })

  test('paralleler Aufruf (Webhook + Rückkehrseite): genau einmal', async () => {
    const hook = jest.fn()
    afterPaid.push(hook)
    const r = await Promise.all([sync(), sync(), sync(), sync()])
    expect(r).toEqual(['PAID', 'PAID', 'PAID', 'PAID'])
    expect(stock('f1')).toBe(8)
    expect(db.movements).toHaveLength(1)
    expect(hook).toHaveBeenCalledTimes(1)
  })

  test('onOrderPaid ist selbst idempotent über die Movement-Eindeutigkeit', async () => {
    await onOrderPaid(db.orders[0])
    await onOrderPaid(db.orders[0])
    expect(stock('f1')).toBe(8)
    expect(db.movements).toHaveLength(1)
  })

  test('Bestand nie negativ: Überverkauf setzt auf 0 und warnt mit Bestellnummer und SKU', async () => {
    db.formats[0].stock = 1
    await sync()
    expect(stock('f1')).toBe(0)
    const msg = console.warn.mock.calls[0][0]
    expect(msg).toContain('ORD-2026-000001')
    expect(msg).toContain('SKU A')
  })

  test('Abbuchung setzt updatedAt des Produkts neu (Admin-Konflikterkennung)', async () => {
    await sync()
    expect(db.products[0].updatedAt.getTime()).toBeGreaterThan(0)
  })

  test('Bestand exakt 0 bleibt 0', async () => {
    db.formats[0].stock = 0
    await sync()
    expect(stock('f1')).toBe(0)
  })

  test('Fehler in einem Schritt blockieren Hooks und weitere Positionen nicht', async () => {
    db.items.unshift({ orderId: 'o1', formatId: 'bad', sku: 'BAD', qty: 1, digital: false })
    db.formats.push({ id: 'bad', stock: 3, productId: 'pr1' })
    const orig = mockPrisma.shopStockMovement.createMany
    mockPrisma.shopStockMovement.createMany = jest.fn(async (a) => {
      if (a.data[0].sku === 'BAD') throw new Error('db down')
      return orig(a)
    })
    const bad = jest.fn(async () => { throw new Error('hook kaputt') })
    const good = jest.fn()
    afterPaid.push(bad, good)
    expect(await sync()).toBe('PAID')
    mockPrisma.shopStockMovement.createMany = orig
    expect(stock('f1')).toBe(8)
    expect(stock('bad')).toBe(3)
    expect(good).toHaveBeenCalledTimes(1)
  })

  test('gelöschtes Format (formatId null) wird übersprungen', async () => {
    db.items[0].formatId = null
    await sync()
    expect(stock('f1')).toBe(10)
    expect(db.orders[0].status).toBe('PAID')
  })
})

describe('syncPayment: Fehler, Abbruch, Sonderfälle', () => {
  test('Anbieterfehler beim Abruf lässt PENDING', async () => {
    mockDriver.fetchPayment.mockRejectedValue(new Error('timeout'))
    expect(await sync()).toBe('PENDING')
    expect(db.orders[0].status).toBe('PENDING')
    expect(db.payments[0].status).toBe('PENDING')
  })

  test('strict: Anbieterfehler wird weitergeworfen, nichts geändert', async () => {
    mockDriver.fetchPayment.mockRejectedValue(new Error('timeout'))
    await expect(syncPayment({ provider: 'sumup', externalId: 'x1' }, { strict: true })).rejects.toThrow('timeout')
    expect(db.orders[0].status).toBe('PENDING')
    expect(db.payments[0].status).toBe('PENDING')
  })

  test.each(['FAILED', 'CANCELLED'])('%s: Zahlung %s, Bestellung FAILED, keine Abbuchung', async (s) => {
    mockDriver.fetchPayment.mockResolvedValue(remote({ status: s }))
    expect(await sync()).toBe('FAILED')
    expect(db.payments[0].status).toBe(s)
    expect(db.orders[0].status).toBe('FAILED')
    expect(db.movements).toHaveLength(0)
  })

  test('FAILED, aber weitere Zahlung offen: Bestellung bleibt PENDING', async () => {
    db.payments.push({ id: 'p2', orderId: 'o1', provider: 'SUMUP', externalId: 'x2', status: 'PENDING', amountCents: 2400, currency: 'EUR' })
    mockDriver.fetchPayment.mockResolvedValue(remote({ status: 'FAILED' }))
    expect(await sync()).toBe('PENDING')
    expect(db.orders[0].status).toBe('PENDING')
  })

  test('PENDING oder unbekannter Status beim Anbieter ändert nichts', async () => {
    mockDriver.fetchPayment.mockResolvedValue(remote({ status: 'PENDING' }))
    expect(await sync()).toBe('PENDING')
    mockDriver.fetchPayment.mockResolvedValue(remote({ status: 'WHATEVER' }))
    expect(await sync()).toBe('PENDING')
    expect(db.payments[0].status).toBe('PENDING')
  })

  test('stornierte oder (alte) fehlgeschlagene Bestellung wird von einem späteren PAID nicht wiederbelebt', async () => {
    db.orders[0].createdAt = new Date(Date.now() - 49 * 3600_000)
    for (const s of ['CANCELLED', 'FAILED']) {
      db.orders[0].status = s
      expect(await sync()).toBe(s)
      expect(db.movements).toHaveLength(0)
    }
    expect(mockDriver.fetchPayment).not.toHaveBeenCalled()
  })

  test('bereits bezahlte Bestellung: kein Abruf', async () => {
    db.orders[0].status = 'PAID'
    expect(await sync()).toBe('PAID')
    expect(mockDriver.fetchPayment).not.toHaveBeenCalled()
  })

  test('unbekannte Zahlung, Anbieter oder leere ID: null, kein Abruf', async () => {
    expect(await syncPayment({ provider: 'sumup', externalId: 'nope' })).toBeNull()
    expect(await syncPayment({ provider: 'stripe', externalId: 'x1' })).toBeNull()
    expect(await syncPayment({ provider: 'sumup', externalId: '' })).toBeNull()
    expect(await syncPayment({ provider: 'sumup', externalId: { not: 1 } })).toBeNull()
    expect(mockDriver.fetchPayment).not.toHaveBeenCalled()
  })

  test('Zahlung eines anderen Anbieters mit gleicher externalId wird nicht verwechselt', async () => {
    db.payments[0].provider = 'STRIPE'
    expect(await sync()).toBeNull()
  })

  test('markOrderPaid: nur der erste Aufruf gewinnt', async () => {
    expect(await markOrderPaid('o1')).toBe(true)
    expect(await markOrderPaid('o1')).toBe(false)
  })
})

describe('syncPayment: späte Zahlung nach FAILED', () => {
  const hours = (h) => new Date(Date.now() - h * 3600_000)
  const failed = (h = 1, ps = 'FAILED') => { db.orders[0].status = 'FAILED'; db.orders[0].createdAt = hours(h); db.payments[0].status = ps }

  test.each(['FAILED', 'CANCELLED', 'PENDING'])('Zahlung %s, Anbieter meldet PAID: FAILED -> PAID, Hook einmalig', async (ps) => {
    failed(1, ps)
    const hook = jest.fn()
    afterPaid.push(hook)
    expect(await sync()).toBe('PAID')
    expect(await sync()).toBe('PAID')
    expect(db.orders[0].status).toBe('PAID')
    expect(db.payments[0].status).toBe('PAID')
    expect(stock('f1')).toBe(8)
    expect(hook).toHaveBeenCalledTimes(1)
    expect(mockDriver.fetchPayment).toHaveBeenCalledTimes(1)
  })

  test('Anbieter meldet weiter FAILED: Bestellung bleibt FAILED', async () => {
    failed()
    mockDriver.fetchPayment.mockResolvedValue(remote({ status: 'FAILED' }))
    expect(await sync()).toBe('FAILED')
    expect(db.orders[0].status).toBe('FAILED')
  })

  test('PAID mit falschem Betrag belebt nicht', async () => {
    failed()
    mockDriver.fetchPayment.mockResolvedValue(remote({ amountCents: 1 }))
    expect(await sync()).toBe('FAILED')
    expect(db.orders[0].status).toBe('FAILED')
  })

  test('älter als 48 h: kein Abruf', async () => {
    failed(49)
    expect(await sync()).toBe('FAILED')
    expect(mockDriver.fetchPayment).not.toHaveBeenCalled()
  })

  test('markOrderPaid akzeptiert FAILED', async () => {
    db.orders[0].status = 'FAILED'
    expect(await markOrderPaid('o1')).toBe(true)
  })
})

describe('startPayment', () => {
  const order = { id: 'o1', reference: 'ORD-2026-000001', totalCents: 2400, currency: 'EUR', email: 'a@b.de', items: [{ title: 'Buch', label: 'HC', qty: 2, unitCents: 1000, sku: 'A', extra: 'x' }] }
  const urls = { returnUrl: 'https://s/r', cancelUrl: 'https://s/c', webhookUrl: 'https://s/w' }

  test('legt ShopPayment PENDING an und liefert { provider, client }', async () => {
    mockDriver.createPayment.mockResolvedValue({ externalId: 'ext9', client: { type: 'redirect', url: 'https://p' } })
    db.payments = []
    const out = await startPayment({ order, providerId: 'sumup', urls })
    expect(out).toEqual({ provider: 'sumup', client: { type: 'redirect', url: 'https://p' } })
    expect(db.payments[0]).toMatchObject({ orderId: 'o1', provider: 'SUMUP', externalId: 'ext9', status: 'PENDING', amountCents: 2400, currency: 'EUR' })
    const arg = mockDriver.createPayment.mock.calls[0][0]
    expect(arg.urls).toEqual(urls)
    expect(arg.order.items).toEqual([{ title: 'Buch', label: 'HC', qty: 2, unitCents: 1000 }])
  })

  test('nicht verfügbarer Anbieter wirft, Treiber wird nicht aufgerufen', async () => {
    await expect(startPayment({ order, providerId: 'stripe', urls })).rejects.toThrow()
    await expect(startPayment({ order, providerId: '__proto__', urls })).rejects.toThrow()
    expect(mockDriver.createPayment).not.toHaveBeenCalled()
  })

  test('Treiberfehler: keine Zahlung gespeichert', async () => {
    mockDriver.createPayment.mockRejectedValue(new Error('boom'))
    db.payments = []
    await expect(startPayment({ order, providerId: 'sumup', urls })).rejects.toThrow('boom')
    expect(db.payments).toHaveLength(0)
  })
})
