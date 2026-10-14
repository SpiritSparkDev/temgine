/**
 * __tests__/api/shopShipping.test.js
 * GET/PUT /api/shop/shipping
 */
jest.disableAutomock()

const mockPrisma = { setting: { findUnique: jest.fn(), upsert: jest.fn() } }
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_SETTINGS: ['ADMIN'] } }))
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }))

const { requireAuth } = require('../../lib/auth')
const { logAudit } = require('../../lib/audit')
const handler = require('../../pages/api/shop/shipping').default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}
const valid = () => ({
  countries: { DE: 'Deutschland' },
  freeShippingFromCents: null,
  zones: [{ id: 'DE', name: 'Deutschland', countries: ['DE'], taxRateBp: null, tiers: [{ maxG: 2000, priceCents: 490 }] }],
})

beforeEach(() => {
  jest.clearAllMocks()
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
  mockPrisma.setting.findUnique.mockImplementation(async ({ where }) => (where.key === 'shop_enabled' ? { value: 'true' } : null))
})

test('Recht nur ADMIN (SHOP_SETTINGS); Auth-Fehler wird durchgereicht', async () => {
  await handler({ method: 'GET' }, makeRes())
  expect(requireAuth.mock.calls[0][2]).toEqual(['ADMIN'])
  requireAuth.mockResolvedValue({ authorized: false, error: 'Zugriff verweigert', status: 403 })
  const res = makeRes()
  await handler({ method: 'PUT', body: valid() }, res)
  expect(res.status).toHaveBeenCalledWith(403)
  expect(mockPrisma.setting.upsert).not.toHaveBeenCalled()
})

test('Add-on aus -> 403 ADDON_DISABLED', async () => {
  mockPrisma.setting.findUnique.mockResolvedValue({ value: 'false' })
  const res = makeRes()
  await handler({ method: 'GET' }, res)
  expect(res.status).toHaveBeenCalledWith(403)
  expect(res.json).toHaveBeenCalledWith({ error: 'Add-on Shop nicht aktiviert', code: 'ADDON_DISABLED' })
})

test('GET liefert Standard, wenn nichts gespeichert; no-store', async () => {
  const res = makeRes()
  await handler({ method: 'GET' }, res)
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json.mock.calls[0][0].zones.map((z) => z.id)).toEqual(['DE', 'EU', 'WELT'])
})

test('PUT speichert, auditiert und gibt die Konfiguration zurück', async () => {
  const res = makeRes()
  await handler({ method: 'PUT', body: valid() }, res)
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith(valid())
  const call = mockPrisma.setting.upsert.mock.calls[0][0]
  expect(call.where).toEqual({ key: 'shop_shipping' })
  expect(JSON.parse(call.update.value)).toEqual(valid())
  expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.shipping.update', userId: 'u1' }))
})

test('PUT ungültig -> 422 mit details.errors, nichts gespeichert', async () => {
  const body = valid()
  body.zones[0].tiers = [{ maxG: 2000, priceCents: 1 }, { maxG: 1000, priceCents: 2 }]
  const res = makeRes()
  await handler({ method: 'PUT', body }, res)
  expect(res.status).toHaveBeenCalledWith(422)
  const out = res.json.mock.calls[0][0]
  expect(out.code).toBe('VALIDATION_ERROR')
  expect(out.details.errors.length).toBeGreaterThan(0)
  expect(mockPrisma.setting.upsert).not.toHaveBeenCalled()
  expect(logAudit).not.toHaveBeenCalled()
})

test('andere Methode -> 405', async () => {
  const res = makeRes()
  await handler({ method: 'DELETE' }, res)
  expect(res.status).toHaveBeenCalledWith(405)
})

test('PUT speichert Steuersatz je Zone und Versandkostenfrei-Grenze; ungültige Werte -> 422', async () => {
  const body = { ...valid(), freeShippingFromCents: 5000 }
  body.zones[0].taxRateBp = 1900
  const res = makeRes()
  await handler({ method: 'PUT', body }, res)
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json.mock.calls[0][0]).toMatchObject({ freeShippingFromCents: 5000, zones: [{ taxRateBp: 1900 }] })
  expect(JSON.parse(mockPrisma.setting.upsert.mock.calls[0][0].create.value).freeShippingFromCents).toBe(5000)

  mockPrisma.setting.upsert.mockClear()
  const bad = makeRes()
  await handler({ method: 'PUT', body: { ...valid(), freeShippingFromCents: 0 } }, bad)
  expect(bad.status).toHaveBeenCalledWith(422)
  expect(bad.json.mock.calls[0][0].details.errors.join()).toMatch(/Versandkostenfrei/)
  expect(mockPrisma.setting.upsert).not.toHaveBeenCalled()
})
