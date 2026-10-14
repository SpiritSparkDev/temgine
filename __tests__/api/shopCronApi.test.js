jest.disableAutomock()

jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_ORDERS_EDIT: ['EDIT'] } }))
jest.mock('../../lib/shop/config', () => ({ isShopEnabled: jest.fn() }))
jest.mock('../../lib/shop/settingsStore', () => ({ getSetting: jest.fn() }))
jest.mock('../../lib/shop/cron', () => ({ runShopJobs: jest.fn() }))

const { requireAuth } = require('../../lib/auth')
const { isShopEnabled } = require('../../lib/shop/config')
const { getSetting } = require('../../lib/shop/settingsStore')
const { runShopJobs } = require('../../lib/shop/cron')
const handler = require('../../pages/api/shop/cron').default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}
let ipN = 0
const mkReq = (headers = {}, method = 'POST') => ({ method, headers, socket: { remoteAddress: `10.0.0.${++ipN}` } })

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.SHOP_CRON_TOKEN
  process.env.SHOP_INTERNAL_CRON_TOKEN = 'internal-token'
  isShopEnabled.mockResolvedValue(true)
  getSetting.mockResolvedValue('')
  runShopJobs.mockResolvedValue({ reconciled: 1, expiredReservations: 2, cancelledOrders: 3 })
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

test('nur POST', async () => {
  const res = makeRes()
  await handler(mkReq({}, 'GET'), res)
  expect(res.status).toHaveBeenCalledWith(405)
})

test('gültiger Token startet die Jobs', async () => {
  const res = makeRes()
  await handler(mkReq({ 'x-shop-cron': 'internal-token' }), res)
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith({ ok: true, reconciled: 1, expiredReservations: 2, cancelledOrders: 3 })
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  expect(requireAuth).not.toHaveBeenCalled()
})

test('Einstellungs-Token gilt, leere und falsche Token nie', async () => {
  getSetting.mockResolvedValue('setting-token')
  let res = makeRes()
  await handler(mkReq({ 'x-shop-cron': 'setting-token' }), res)
  expect(res.status).toHaveBeenCalledWith(200)
  getSetting.mockResolvedValue('')
  delete process.env.SHOP_INTERNAL_CRON_TOKEN
  res = makeRes()
  await handler(mkReq({ 'x-shop-cron': '' }), res)
  expect(res.status).toHaveBeenCalledWith(401)
  res = makeRes()
  await handler(mkReq({ 'x-shop-cron': 'wrong' }), res)
  expect(res.status).toHaveBeenCalledWith(401)
  expect(runShopJobs).toHaveBeenCalledTimes(1)
})

test('Add-on aus: 404 bei Token, 403 bei Admin', async () => {
  isShopEnabled.mockResolvedValue(false)
  let res = makeRes()
  await handler(mkReq({ 'x-shop-cron': 'internal-token' }), res)
  expect(res.status).toHaveBeenCalledWith(404)
  res = makeRes()
  await handler(mkReq(), res)
  expect(res.status).toHaveBeenCalledWith(403)
  expect(runShopJobs).not.toHaveBeenCalled()
})

test('Admin-Session mit Recht; ohne Recht abgelehnt', async () => {
  let res = makeRes()
  await handler(mkReq(), res)
  expect(res.status).toHaveBeenCalledWith(200)
  expect(requireAuth.mock.calls[0][2]).toEqual(['EDIT'])
  requireAuth.mockResolvedValue({ authorized: false, status: 403, error: 'no' })
  res = makeRes()
  await handler(mkReq(), res)
  expect(res.status).toHaveBeenCalledWith(403)
})

test('Ratenbegrenzung: 7. Aufruf je IP wird abgewiesen', async () => {
  const req = mkReq({ 'x-shop-cron': 'internal-token' })
  let last
  for (let i = 0; i < 7; i++) { last = makeRes(); await handler(req, last) }
  expect(last.status).toHaveBeenCalledWith(429)
})
