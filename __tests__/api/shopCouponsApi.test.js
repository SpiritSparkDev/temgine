/**
 * __tests__/api/shopCouponsApi.test.js
 * GET/POST /api/shop/coupons und GET/PUT /api/shop/coupons/[id]
 */
jest.disableAutomock()

const mockPrisma = {
  setting: { findUnique: jest.fn() },
  shopCoupon: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
}
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_COUPONS_EDIT: ['ADMIN', 'MODERATOR'] } }))
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }))

const { requireAuth } = require('../../lib/auth')
const { logAudit } = require('../../lib/audit')
const list = require('../../pages/api/shop/coupons').default
const one = require('../../pages/api/shop/coupons/[id]').default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}
const call = async (h, req) => {
  const res = makeRes()
  await h(req, res)
  return { res, status: res.status.mock.calls.at(-1)?.[0], body: res.json.mock.calls.at(-1)?.[0] }
}
const row = (o = {}) => ({
  id: 'c1', code: 'SOMMER', type: 'PERCENT', value: 1000, minOrderCents: null, maxUses: 5, usedCount: 2,
  validFrom: null, validUntil: new Date('2026-12-31T00:00:00Z'), active: true, note: null,
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z'), ...o,
})

beforeEach(() => {
  jest.clearAllMocks()
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
  mockPrisma.setting.findUnique.mockResolvedValue({ value: 'true' })
})

describe('Zugriff', () => {
  test('Recht SHOP_COUPONS_EDIT, Auth-Fehler wird durchgereicht', async () => {
    await call(list, { method: 'GET' })
    expect(requireAuth.mock.calls[0][2]).toEqual(['ADMIN', 'MODERATOR'])
    requireAuth.mockResolvedValue({ authorized: false, error: 'Zugriff verweigert', status: 403 })
    const r = await call(list, { method: 'POST', body: {} })
    expect(r.status).toBe(403)
    expect(mockPrisma.shopCoupon.create).not.toHaveBeenCalled()
  })
  test('Add-on aus -> 403 ADDON_DISABLED, no-store', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue({ value: 'false' })
    const r = await call(one, { method: 'GET', query: { id: 'c1' } })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('ADDON_DISABLED')
    expect(r.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })
})

describe('/api/shop/coupons', () => {
  test('GET: Liste mit usedCount und ISO-Datum', async () => {
    mockPrisma.shopCoupon.findMany.mockResolvedValue([row()])
    const r = await call(list, { method: 'GET' })
    expect(r.status).toBe(200)
    expect(r.body.coupons[0]).toMatchObject({ code: 'SOMMER', usedCount: 2, maxUses: 5, validUntil: '2026-12-31T00:00:00.000Z' })
  })
  test('POST: legt an (201) und schreibt Audit', async () => {
    mockPrisma.shopCoupon.create.mockImplementation(async ({ data }) => row({ ...data, id: 'new', usedCount: 0 }))
    const r = await call(list, { method: 'POST', body: { code: 'neu-10', type: 'FIXED', value: 500 } })
    expect(r.status).toBe(201)
    expect(mockPrisma.shopCoupon.create.mock.calls[0][0].data).toMatchObject({ code: 'NEU-10', type: 'FIXED', value: 500, active: true })
    expect(r.body.coupon.code).toBe('NEU-10')
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.coupon.create', resourceId: 'new', userId: 'u1' }))
  })
  test('POST: 422 mit Fehlerliste, 409 DUPLICATE bei gleichem Code', async () => {
    let r = await call(list, { method: 'POST', body: { code: 'x', type: 'PERCENT', value: 0 } })
    expect(r.status).toBe(422)
    expect(r.body).toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(r.body.details.errors.length).toBeGreaterThan(0)
    expect(mockPrisma.shopCoupon.create).not.toHaveBeenCalled()
    mockPrisma.shopCoupon.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }))
    r = await call(list, { method: 'POST', body: { code: 'SOMMER', type: 'PERCENT', value: 500 } })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('DUPLICATE')
  })
  test('andere Methoden -> 405 (kein Löschen)', async () => {
    expect((await call(list, { method: 'DELETE' })).status).toBe(405)
  })
})

describe('/api/shop/coupons/[id]', () => {
  test('GET und 404', async () => {
    mockPrisma.shopCoupon.findUnique.mockResolvedValue(row())
    expect((await call(one, { method: 'GET', query: { id: 'c1' } })).body.coupon.id).toBe('c1')
    mockPrisma.shopCoupon.findUnique.mockResolvedValue(null)
    const r = await call(one, { method: 'GET', query: { id: 'zz' } })
    expect(r.status).toBe(404)
    expect(r.body.code).toBe('NOT_FOUND')
  })
  test('PUT: Code nicht änderbar, Felder änderbar, Audit', async () => {
    mockPrisma.shopCoupon.findUnique.mockResolvedValue(row())
    mockPrisma.shopCoupon.update.mockImplementation(async ({ data }) => row(data))
    const r = await call(one, { method: 'PUT', query: { id: 'c1' }, body: { code: 'ANDERS', type: 'PERCENT', value: 2000, maxUses: 9 } })
    expect(r.status).toBe(200)
    const arg = mockPrisma.shopCoupon.update.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'c1' })
    expect(arg.data).not.toHaveProperty('code')
    expect(arg.data).toMatchObject({ value: 2000, maxUses: 9 })
    expect(r.body.coupon.code).toBe('SOMMER')
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.coupon.update', resourceId: 'c1' }))
  })
  test('PUT nur mit active schaltet um und lässt den Rest unverändert', async () => {
    mockPrisma.shopCoupon.findUnique.mockResolvedValue(row())
    mockPrisma.shopCoupon.update.mockImplementation(async ({ data }) => row(data))
    const r = await call(one, { method: 'PUT', query: { id: 'c1' }, body: { active: false } })
    expect(r.status).toBe(200)
    const data = mockPrisma.shopCoupon.update.mock.calls[0][0].data
    expect(data).toMatchObject({ active: false, type: 'PERCENT', value: 1000, maxUses: 5 })
    expect(data.validUntil.toISOString()).toBe('2026-12-31T00:00:00.000Z')
    expect(data).not.toHaveProperty('usedCount')
  })
  test('PUT ungültig -> 422; DELETE -> 405', async () => {
    mockPrisma.shopCoupon.findUnique.mockResolvedValue(row())
    const r = await call(one, { method: 'PUT', query: { id: 'c1' }, body: { value: 0 } })
    expect(r.status).toBe(422)
    expect(mockPrisma.shopCoupon.update).not.toHaveBeenCalled()
    expect((await call(one, { method: 'DELETE', query: { id: 'c1' } })).status).toBe(405)
  })
})
