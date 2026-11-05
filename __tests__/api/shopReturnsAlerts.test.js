/**
 * __tests__/api/shopReturnsAlerts.test.js
 * Rückgaben (öffentlich + Admin) und Benachrichtigung bei Wiederverfügbarkeit.
 */
process.env.TRUST_PROXY = 'true' // Tests unterscheiden Clients ueber x-forwarded-for

jest.disableAutomock()

const mockPrisma = {
  shopOrder: { findUnique: jest.fn() },
  shopReturnRequest: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  shopFormat: { findUnique: jest.fn() },
  shopStockAlert: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
}
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_RETURNS_EDIT: ['RET'] } }))
jest.mock('../../lib/shop/guard', () => ({ requireShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/config', () => ({ isShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/events', () => ({ logOrderEvent: jest.fn() }))
jest.mock('../../lib/shop/settingsStore', () => ({ getSetting: jest.fn() }))
jest.mock('../../lib/shop/reservations', () => ({ reservedByOthers: jest.fn() }))
jest.mock('../../lib/shop/orderMails', () => ({ sendReturnMail: jest.fn(), sendStockAlertMail: jest.fn() }))

const { requireAuth } = require('../../lib/auth')
const { requireShopEnabled } = require('../../lib/shop/guard')
const { isShopEnabled } = require('../../lib/shop/config')
const { logOrderEvent } = require('../../lib/shop/events')
const { getSetting } = require('../../lib/shop/settingsStore')
const { reservedByOthers } = require('../../lib/shop/reservations')
const { sendReturnMail, sendStockAlertMail } = require('../../lib/shop/orderMails')
const { notifyRestock } = require('../../lib/shop/stockAlerts')
const pubReturns = require('../../pages/api/shop/public/returns').default
const pubAlerts = require('../../pages/api/shop/public/stock-alerts').default
const confirm = require('../../pages/api/shop/public/stock-alerts/confirm').default
const unsub = require('../../pages/api/shop/public/stock-alerts/unsubscribe').default
const list = require('../../pages/api/shop/returns').default
const detail = require('../../pages/api/shop/returns/[id]').default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.end = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}
let ipN = 0
const post = (body, ip) => ({ method: 'POST', body, headers: { 'x-forwarded-for': ip || `10.0.0.${++ipN}` }, query: {} })

const NOW = Date.now()
const order = (o = {}) => ({
  id: 'o1', reference: 'ORD-2026-000001', email: 'Kunde@Example.de', status: 'PAID', paidAt: new Date(NOW - 86400000),
  shippedAt: null, createdAt: new Date(NOW - 2 * 86400000), items: [{ sku: 'A', qty: 2, title: 'Buch', label: 'HC' }], ...o,
})
const valid = { reference: 'ORD-2026-000001', email: '  kunde@example.DE ', reason: 'Beschädigt angekommen' }

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
  requireShopEnabled.mockResolvedValue(true)
  isShopEnabled.mockResolvedValue(true)
  getSetting.mockResolvedValue(null)
  reservedByOthers.mockResolvedValue(new Map())
  mockPrisma.shopOrder.findUnique.mockResolvedValue(order())
  mockPrisma.shopReturnRequest.count.mockResolvedValue(0)
  mockPrisma.shopReturnRequest.create.mockImplementation(async ({ data }) => ({ id: 'r1', status: 'NEW', ...data }))
})

describe('POST /public/returns', () => {
  test('creates request, logs event, sends mail, normalizes email', async () => {
    const res = makeRes()
    await pubReturns(post({ ...valid, items: [{ sku: 'A', qty: 1 }] }), res)
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({ id: 'r1', status: 'NEW' })
    const data = mockPrisma.shopReturnRequest.create.mock.calls[0][0].data
    expect(data).toMatchObject({ orderId: 'o1', email: 'kunde@example.de', items: [{ sku: 'A', qty: 1 }] })
    expect(logOrderEvent).toHaveBeenCalledWith('o1', 'RETURN', expect.any(String), expect.anything())
    expect(sendReturnMail).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), expect.objectContaining({ id: 'o1' }), 'received')
  })

  test('wrong email and unknown reference give identical 404', async () => {
    const r1 = makeRes()
    await pubReturns(post({ ...valid, email: 'anderer@example.de' }), r1)
    mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
    const r2 = makeRes()
    await pubReturns(post(valid), r2)
    expect(r1.status).toHaveBeenCalledWith(404)
    expect(r2.status).toHaveBeenCalledWith(404)
    expect(r1.json.mock.calls[0]).toEqual(r2.json.mock.calls[0])
    expect(mockPrisma.shopReturnRequest.create).not.toHaveBeenCalled()
  })

  test('only PAID or SHIPPED orders', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order({ status: 'PENDING' }))
    const res = makeRes()
    await pubReturns(post(valid), res)
    expect(res.status).toHaveBeenCalledWith(422)
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order({ status: 'SHIPPED' }))
    const ok = makeRes()
    await pubReturns(post(valid), ok)
    expect(ok.status).toHaveBeenCalledWith(201)
  })

  test('return period counts from shippedAt, else paidAt', async () => {
    getSetting.mockResolvedValue('14')
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order({ paidAt: new Date(NOW - 20 * 86400000), shippedAt: new Date(NOW - 5 * 86400000) }))
    const ok = makeRes()
    await pubReturns(post(valid), ok)
    expect(ok.status).toHaveBeenCalledWith(201)
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order({ paidAt: new Date(NOW - 20 * 86400000) }))
    const over = makeRes()
    await pubReturns(post(valid), over)
    expect(over.status).toHaveBeenCalledWith(422)
    expect(over.json.mock.calls[0][0].code).toBe('RETURN_PERIOD_OVER')
  })

  test('items: unknown sku, qty too high, too many entries', async () => {
    for (const items of [[{ sku: 'X', qty: 1 }], [{ sku: 'A', qty: 3 }], [{ sku: 'A', qty: 0 }], Array(51).fill({ sku: 'A', qty: 1 })]) {
      const res = makeRes()
      await pubReturns(post({ ...valid, items }), res)
      expect(res.status).toHaveBeenCalledWith(422)
    }
    expect(mockPrisma.shopReturnRequest.create).not.toHaveBeenCalled()
  })

  test('reason length 5..2000, control chars removed', async () => {
    for (const reason of ['abc', 'x'.repeat(2001), undefined]) {
      const res = makeRes()
      await pubReturns(post({ ...valid, reason }), res)
      expect(res.status).toHaveBeenCalledWith(422)
    }
    await pubReturns(post({ ...valid, reason: 'Defekt\u0000\u0007 bitte' }), makeRes())
    expect(mockPrisma.shopReturnRequest.create.mock.calls[0][0].data.reason).toBe('Defekt bitte')
  })

  test('max 3 open requests per order', async () => {
    mockPrisma.shopReturnRequest.count.mockResolvedValue(3)
    const res = makeRes()
    await pubReturns(post(valid), res)
    expect(res.status).toHaveBeenCalledWith(429)
    expect(mockPrisma.shopReturnRequest.count.mock.calls[0][0].where.status).toEqual({ in: ['NEW', 'APPROVED'] })
  })

  test('mail failure does not fail the request', async () => {
    sendReturnMail.mockRejectedValue(new Error('smtp'))
    const res = makeRes()
    await pubReturns(post(valid), res)
    expect(res.status).toHaveBeenCalledWith(201)
  })

  test('rate limit: 6th request from one IP gets 429; add-on off = 404', async () => {
    let last
    for (let i = 0; i < 6; i++) {
      last = makeRes()
      await pubReturns(post(valid, '9.9.9.9'), last)
    }
    expect(last.status).toHaveBeenCalledWith(429)
    isShopEnabled.mockResolvedValue(false)
    const off = makeRes()
    await pubReturns(post(valid), off)
    expect(off.status).toHaveBeenCalledWith(404)
  })
})

describe('admin returns', () => {
  const ret = (status = 'NEW') => ({ id: 'r1', orderId: 'o1', status, adminNote: null, items: [], reason: 'x', email: 'k@e.de', order: order() })

  test('auth/add-on guard', async () => {
    requireAuth.mockResolvedValue({ authorized: false, error: 'no', status: 403 })
    const res = makeRes()
    await list({ method: 'GET', query: {} }, res)
    expect(res.status).toHaveBeenCalledWith(403)
    requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
    requireShopEnabled.mockResolvedValue(false)
    await detail({ method: 'GET', query: { id: 'r1' } }, makeRes())
    expect(mockPrisma.shopReturnRequest.findUnique).not.toHaveBeenCalled()
    expect(requireAuth.mock.calls[1][2]).toEqual(['RET'])
  })

  test('list: paging, excerpt, reference', async () => {
    mockPrisma.shopReturnRequest.count.mockResolvedValue(30)
    mockPrisma.shopReturnRequest.findMany.mockResolvedValue([{ id: 'r1', orderId: 'o1', email: 'a@b.de', status: 'NEW', createdAt: 1, reason: 'y'.repeat(500), order: { reference: 'ORD-1' } }])
    const res = makeRes()
    await list({ method: 'GET', query: { status: 'NEW', page: '2' } }, res)
    const call = mockPrisma.shopReturnRequest.findMany.mock.calls[0][0]
    expect(call).toMatchObject({ skip: 25, take: 25, orderBy: { createdAt: 'desc' }, where: { status: 'NEW' } })
    const body = res.json.mock.calls[0][0]
    expect(body.pages).toBe(2)
    expect(body.returns[0].reference).toBe('ORD-1')
    expect(body.returns[0].reasonExcerpt.length).toBe(120)
  })

  test('GET detail resolves items against the order; empty = whole order', async () => {
    mockPrisma.shopReturnRequest.findUnique.mockResolvedValue({ ...ret(), order: order() })
    const res = makeRes()
    await detail({ method: 'GET', query: { id: 'r1' } }, res)
    const r = res.json.mock.calls[0][0].return
    expect(r.wholeOrder).toBe(true)
    expect(r.items).toEqual([{ sku: 'A', qty: 2, title: 'Buch', label: 'HC', orderedQty: 2 }])
    expect(r.order.reference).toBe('ORD-2026-000001')
  })

  test('PUT transitions: allowed sends mail kind and logs; conditional updateMany', async () => {
    const cases = [['NEW', 'APPROVED', 'approved'], ['APPROVED', 'RECEIVED', 'received_goods'], ['RECEIVED', 'REFUNDED', 'refunded'], ['APPROVED', 'REJECTED', 'rejected']]
    for (const [from, to, kind] of cases) {
      jest.clearAllMocks()
      mockPrisma.shopReturnRequest.findUnique.mockResolvedValue(ret(from))
      mockPrisma.shopReturnRequest.updateMany.mockResolvedValue({ count: 1 })
      const res = makeRes()
      await detail({ method: 'PUT', query: { id: 'r1' }, body: { status: to } }, res)
      expect(mockPrisma.shopReturnRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'r1', status: from }, data: { status: to } })
      expect(sendReturnMail).toHaveBeenCalledWith(expect.anything(), expect.anything(), kind)
      expect(logOrderEvent).toHaveBeenCalledWith('o1', 'RETURN', expect.any(String), expect.objectContaining({ userId: 'u1' }))
    }
  })

  test('PUT invalid transition 409, lost race 409, no mail', async () => {
    mockPrisma.shopReturnRequest.findUnique.mockResolvedValue(ret('NEW'))
    const bad = makeRes()
    await detail({ method: 'PUT', query: { id: 'r1' }, body: { status: 'REFUNDED' } }, bad)
    expect(bad.status).toHaveBeenCalledWith(409)
    expect(bad.json.mock.calls[0][0].code).toBe('INVALID_TRANSITION')
    mockPrisma.shopReturnRequest.updateMany.mockResolvedValue({ count: 0 })
    const race = makeRes()
    await detail({ method: 'PUT', query: { id: 'r1' }, body: { status: 'APPROVED' } }, race)
    expect(race.status).toHaveBeenCalledWith(409)
    expect(sendReturnMail).not.toHaveBeenCalled()
  })

  test('PUT adminNote only: no mail, no event; too long = 422; mail error is swallowed', async () => {
    mockPrisma.shopReturnRequest.findUnique.mockResolvedValue(ret('NEW'))
    mockPrisma.shopReturnRequest.updateMany.mockResolvedValue({ count: 1 })
    await detail({ method: 'PUT', query: { id: 'r1' }, body: { adminNote: 'Notiz' } }, makeRes())
    expect(mockPrisma.shopReturnRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { adminNote: 'Notiz' } })
    expect(sendReturnMail).not.toHaveBeenCalled()
    expect(logOrderEvent).not.toHaveBeenCalled()
    const long = makeRes()
    await detail({ method: 'PUT', query: { id: 'r1' }, body: { adminNote: 'x'.repeat(2001) } }, long)
    expect(long.status).toHaveBeenCalledWith(422)
    sendReturnMail.mockRejectedValue(new Error('smtp'))
    const res = makeRes()
    await detail({ method: 'PUT', query: { id: 'r1' }, body: { status: 'APPROVED' } }, res)
    expect(res.status).not.toHaveBeenCalledWith(500)
  })
})

describe('POST /public/stock-alerts', () => {
  const fmt = (o = {}) => ({ id: 'f1', sku: 'A', stock: 0, digital: false, product: { id: 'p1', active: true, title: 'T' }, ...o })
  const body = { sku: 'A', email: 'Fan@Example.de' }

  beforeEach(() => {
    mockPrisma.shopFormat.findUnique.mockResolvedValue(fmt())
    mockPrisma.shopStockAlert.findUnique.mockResolvedValue(null)
    mockPrisma.shopStockAlert.count.mockResolvedValue(0)
    mockPrisma.shopStockAlert.create.mockImplementation(async ({ data }) => ({ id: 'a1', ...data }))
  })

  test('creates entry with tokens and sends confirm mail, answer 202', async () => {
    const res = makeRes()
    await pubAlerts(post({ ...body, locale: 'en' }), res)
    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
    const data = mockPrisma.shopStockAlert.create.mock.calls[0][0].data
    expect(data.email).toBe('fan@example.de')
    expect(data.locale).toBe('en')
    expect(data.confirmToken).toMatch(/^[0-9a-f]{48}$/)
    expect(data.unsubscribeToken).not.toBe(data.confirmToken)
    expect(sendStockAlertMail).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), expect.anything(), expect.anything(), 'confirm')
  })

  test('409 STILL_AVAILABLE for unlimited, positive free stock, digital; reservations count', async () => {
    for (const f of [fmt({ stock: null }), fmt({ stock: 5 }), fmt({ digital: true })]) {
      mockPrisma.shopFormat.findUnique.mockResolvedValue(f)
      const res = makeRes()
      await pubAlerts(post(body), res)
      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json.mock.calls[0][0].code).toBe('STILL_AVAILABLE')
    }
    mockPrisma.shopFormat.findUnique.mockResolvedValue(fmt({ stock: 3 }))
    reservedByOthers.mockResolvedValue(new Map([['f1', 3]]))
    const res = makeRes()
    await pubAlerts(post(body), res)
    expect(res.status).toHaveBeenCalledWith(202)
  })

  test('unknown sku / inactive product = 404; bad email = 422', async () => {
    mockPrisma.shopFormat.findUnique.mockResolvedValue(null)
    const a = makeRes()
    await pubAlerts(post(body), a)
    expect(a.status).toHaveBeenCalledWith(404)
    mockPrisma.shopFormat.findUnique.mockResolvedValue(fmt({ product: { active: false } }))
    const b = makeRes()
    await pubAlerts(post(body), b)
    expect(b.status).toHaveBeenCalledWith(404)
    const c = makeRes()
    await pubAlerts(post({ ...body, email: 'kaputt' }), c)
    expect(c.status).toHaveBeenCalledWith(422)
  })

  test('existing confirmed entry: 202, no mail, no new row, no leak', async () => {
    mockPrisma.shopStockAlert.findUnique.mockResolvedValue({ id: 'a1', confirmedAt: new Date(), notifiedAt: null })
    const res = makeRes()
    await pubAlerts(post(body), res)
    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
    expect(sendStockAlertMail).not.toHaveBeenCalled()
    expect(mockPrisma.shopStockAlert.create).not.toHaveBeenCalled()
  })

  test('existing confirmed and already notified: re-armed without mail', async () => {
    mockPrisma.shopStockAlert.findUnique.mockResolvedValue({ id: 'a1', confirmedAt: new Date(), notifiedAt: new Date() })
    await pubAlerts(post(body), makeRes())
    expect(mockPrisma.shopStockAlert.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { notifiedAt: null } })
    expect(sendStockAlertMail).not.toHaveBeenCalled()
  })

  test('existing unconfirmed entry: confirm mail again, no new row', async () => {
    mockPrisma.shopStockAlert.findUnique.mockResolvedValue({ id: 'a1', confirmedAt: null })
    const res = makeRes()
    await pubAlerts(post(body), res)
    expect(res.status).toHaveBeenCalledWith(202)
    expect(sendStockAlertMail).toHaveBeenCalledTimes(1)
    expect(mockPrisma.shopStockAlert.create).not.toHaveBeenCalled()
  })

  test('5 unconfirmed per email: 202 but nothing created', async () => {
    mockPrisma.shopStockAlert.count.mockResolvedValue(5)
    const res = makeRes()
    await pubAlerts(post(body), res)
    expect(res.status).toHaveBeenCalledWith(202)
    expect(mockPrisma.shopStockAlert.create).not.toHaveBeenCalled()
  })

  test('mail error still 202; rate limit 429 on 6th', async () => {
    sendStockAlertMail.mockRejectedValue(new Error('smtp'))
    let last
    for (let i = 0; i < 6; i++) {
      last = makeRes()
      await pubAlerts(post(body, '8.8.8.8'), last)
      if (i === 0) expect(last.status).toHaveBeenCalledWith(202)
    }
    expect(last.status).toHaveBeenCalledWith(429)
  })
})

describe('confirm / unsubscribe routes', () => {
  const run = async (h, token) => {
    const res = makeRes()
    await h({ method: 'GET', query: { token } }, res)
    return res
  }
  test('confirm sets confirmedAt and redirects; unknown token -> invalid', async () => {
    mockPrisma.shopStockAlert.findUnique.mockResolvedValueOnce({ id: 'a1', confirmedAt: null })
    const ok = await run(confirm, 'tok')
    expect(mockPrisma.shopStockAlert.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { confirmedAt: expect.any(Date) } })
    expect(ok.setHeader).toHaveBeenCalledWith('Location', '/shop?stockalert=confirmed')
    expect(ok.status).toHaveBeenCalledWith(302)
    mockPrisma.shopStockAlert.findUnique.mockResolvedValueOnce(null)
    const bad = await run(confirm, 'nope')
    expect(bad.setHeader).toHaveBeenCalledWith('Location', '/shop?stockalert=invalid')
    const none = await run(confirm, undefined)
    expect(none.setHeader).toHaveBeenCalledWith('Location', '/shop?stockalert=invalid')
  })

  test('confirm twice does not write again', async () => {
    mockPrisma.shopStockAlert.findUnique.mockResolvedValue({ id: 'a1', confirmedAt: new Date() })
    const res = await run(confirm, 'tok')
    expect(mockPrisma.shopStockAlert.update).not.toHaveBeenCalled()
    expect(res.setHeader).toHaveBeenCalledWith('Location', '/shop?stockalert=confirmed')
  })

  test('unsubscribe deletes entry', async () => {
    mockPrisma.shopStockAlert.deleteMany.mockResolvedValueOnce({ count: 1 })
    const ok = await run(unsub, 'tok')
    expect(mockPrisma.shopStockAlert.deleteMany).toHaveBeenCalledWith({ where: { unsubscribeToken: 'tok' } })
    expect(ok.setHeader).toHaveBeenCalledWith('Location', '/shop?stockalert=removed')
    mockPrisma.shopStockAlert.deleteMany.mockResolvedValueOnce({ count: 0 })
    const bad = await run(unsub, 'tok')
    expect(bad.setHeader).toHaveBeenCalledWith('Location', '/shop?stockalert=invalid')
  })

  test('add-on off = 404', async () => {
    isShopEnabled.mockResolvedValue(false)
    const res = await run(confirm, 'tok')
    expect(res.status).toHaveBeenCalledWith(404)
  })
})

describe('notifyRestock', () => {
  const alert = (id, stock, o = {}) => ({ id, email: `${id}@e.de`, format: { id: 'f1', stock, product: { active: true } }, ...o })

  test('mails only orderable formats, sets notifiedAt only on success, returns count', async () => {
    mockPrisma.shopStockAlert.findMany.mockResolvedValue([alert('a', 4), alert('b', 0), alert('c', null), alert('d', 2)])
    sendStockAlertMail.mockImplementation(async (a) => { if (a.id === 'd') throw new Error('smtp') })
    const n = await notifyRestock(['f1'])
    expect(n).toBe(2)
    expect(sendStockAlertMail.mock.calls.map((c) => c[0].id)).toEqual(['a', 'c', 'd'])
    expect(sendStockAlertMail.mock.calls[0][3]).toBe('notify')
    expect(mockPrisma.shopStockAlert.update.mock.calls.map((c) => c[0].where.id)).toEqual(['a', 'c'])
    const where = mockPrisma.shopStockAlert.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ confirmedAt: { not: null }, notifiedAt: null, formatId: { in: ['f1'] } })
    expect(where.createdAt.gte).toBeInstanceOf(Date)
  })

  test('empty input returns 0 without queries', async () => {
    expect(await notifyRestock([])).toBe(0)
    expect(mockPrisma.shopStockAlert.findMany).not.toHaveBeenCalled()
  })
})
