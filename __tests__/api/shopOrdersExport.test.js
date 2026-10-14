/**
 * __tests__/api/shopOrdersExport.test.js
 * GET /api/shop/orders/export
 */

jest.disableAutomock()

const mockPrisma = { shopOrder: { findMany: jest.fn() } }
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_ORDERS_VIEW: ['VIEW'] } }))
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }))
jest.mock('../../lib/shop/guard', () => ({ requireShopEnabled: jest.fn() }))

const { requireAuth } = require('../../lib/auth')
const { logAudit } = require('../../lib/audit')
const { requireShopEnabled } = require('../../lib/shop/guard')
const handler = require('../../pages/api/shop/orders/export').default

function makeRes() {
  const res = { headers: {} }
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.send = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn((k, v) => { res.headers[k] = v; return res })
  return res
}

const order = (over = {}) => ({
  reference: 'ORD-2026-000001', status: 'PAID', email: 'a@b.de', billing: { name: '=Evil', country: 'DE' },
  subtotalCents: 2490, discountCents: 0, couponCode: null, shippingCents: 500, totalCents: 2990, currency: 'EUR',
  taxBreakdown: { 700: 163, 1900: 80 }, refundedCents: 0, trackingNumber: null,
  paidAt: new Date(2026, 9, 10, 12), createdAt: new Date(2026, 9, 10, 11),
  invoice: { number: 'RE-2026-000001' }, payments: [{ provider: 'STRIPE', status: 'PAID' }],
  items: [{ sku: 'S1', title: 'Buch', label: 'HC', qty: 2, unitCents: 1245, discountCents: 100, taxRateBp: 700 }],
  ...over,
})

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
  requireShopEnabled.mockResolvedValue(true)
  mockPrisma.shopOrder.findMany.mockResolvedValue([order()])
})

const run = async (query, method = 'GET') => {
  const res = makeRes()
  await handler({ method, query }, res)
  return res
}

describe('validation', () => {
  test.each([
    [{ status: 'NOPE' }],
    [{ from: '2026-02-30' }],
    [{ to: '14.10.2026' }],
    [{ from: '2026-10-10', to: '2026-10-01' }],
    [{ from: '2025-01-01', to: '2026-01-02' }],
    [{ detail: 'all' }],
  ])('400 for %j', async (query) => {
    const res = await run(query)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json.mock.calls[0][0].code).toBe('VALIDATION_ERROR')
    expect(mockPrisma.shopOrder.findMany).not.toHaveBeenCalled()
  })

  test('366 days are allowed; inclusive end day, status and take limit', async () => {
    const res = await run({ status: 'PAID', from: '2025-10-14', to: '2026-10-14' })
    expect(res.status).toHaveBeenCalledWith(200)
    const arg = mockPrisma.shopOrder.findMany.mock.calls[0][0]
    expect(arg.take).toBe(10000)
    expect(arg.where.status).toBe('PAID')
    expect(arg.where.OR[0].paidAt).toEqual({ gte: new Date(2025, 9, 14), lt: new Date(2026, 9, 15) })
    expect(arg.where.OR[1].createdAt).toEqual(arg.where.OR[0].paidAt)
  })

  test('auth, add-on and method', async () => {
    requireAuth.mockResolvedValueOnce({ authorized: false, error: 'Nein', status: 403 })
    expect((await run({})).status).toHaveBeenCalledWith(403)
    expect(requireAuth.mock.calls[0][2]).toEqual(['VIEW'])
    requireShopEnabled.mockResolvedValueOnce(false)
    expect((await run({})).send).not.toHaveBeenCalled()
    expect((await run({}, 'POST')).status).toHaveBeenCalledWith(405)
  })
})

describe('output', () => {
  test('headers, BOM, audit', async () => {
    const res = await run({})
    expect(res.headers['Content-Type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['Content-Disposition']).toMatch(/^attachment; filename="bestellungen-\d{4}-\d{2}-\d{2}\.csv"$/)
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(res.send.mock.calls[0][0].startsWith('﻿')).toBe(true)
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.orders.export', userId: 'u1' }))
  })

  test('orders: one VAT column per rate, German numbers, formula guard, date', async () => {
    const lines = (await run({})).send.mock.calls[0][0].replace('﻿', '').split('\r\n')
    expect(lines[0]).toBe('Bestellnummer;Datum;Status;E-Mail;Name;Land;Zwischensumme;Rabatt;Gutschein;Versand;Gesamt;MwSt. 7 %;MwSt. 19 %;Währung;Zahlungsart;Rechnungsnummer;Erstattet;Sendungsnummer')
    expect(lines[1]).toBe("ORD-2026-000001;2026-10-10;PAID;a@b.de;'=Evil;DE;24,90;0,00;;5,00;29,90;1,63;0,80;EUR;STRIPE;RE-2026-000001;0,00;")
  })

  test('order without a rate leaves the cell empty; createdAt fallback', async () => {
    mockPrisma.shopOrder.findMany.mockResolvedValue([order(), order({ reference: 'R2', taxBreakdown: { 700: 10 }, paidAt: null, payments: [] })])
    const lines = (await run({})).send.mock.calls[0][0].split('\r\n')
    expect(lines[2]).toContain(';0,10;;EUR;;')
    expect(lines[2]).toContain(';2026-10-10;')
  })

  test('detail=items: one row per item', async () => {
    const res = await run({ detail: 'items' })
    expect(mockPrisma.shopOrder.findMany.mock.calls[0][0].include.items).toBe(true)
    const lines = res.send.mock.calls[0][0].replace('﻿', '').split('\r\n')
    expect(lines[0]).toBe('Bestellnummer;SKU;Titel;Format;Menge;Einzelpreis;Rabatt;MwSt.-Satz (%);Zeilensumme')
    expect(lines[1]).toBe('ORD-2026-000001;S1;Buch;HC;2;12,45;1,00;7;23,90')
  })
})
