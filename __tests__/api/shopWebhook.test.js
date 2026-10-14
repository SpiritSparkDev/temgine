jest.disableAutomock()
jest.mock('../../lib/shop/config', () => ({ isShopEnabled: jest.fn(), loadShopSettings: jest.fn(async () => ({ s: 1 })) }))
const mockDriver = { parseWebhook: jest.fn() }
jest.mock('../../lib/shop/providers', () => ({ getProvider: (id) => (id === 'sumup' ? mockDriver : null) }))
jest.mock('../../lib/shop/payments', () => ({ syncPayment: jest.fn() }))

const { EventEmitter } = require('events')
const { isShopEnabled } = require('../../lib/shop/config')
const { syncPayment } = require('../../lib/shop/payments')
const mod = require('../../pages/api/shop/webhooks/[provider]')
const handler = mod.default

function makeRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  return res
}
// Request als Stream; Chunks kommen asynchron
function makeReq(chunks, { method = 'POST', provider = 'sumup', headers = {} } = {}) {
  const req = new EventEmitter()
  Object.assign(req, { method, query: { provider }, headers })
  setTimeout(() => {
    for (const c of chunks) req.emit('data', Buffer.from(c))
    req.emit('end')
  }, 0)
  return req
}
const call = async (chunks, opts) => {
  const res = makeRes()
  await handler(makeReq(chunks, opts), res)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
  isShopEnabled.mockResolvedValue(true)
  mockDriver.parseWebhook.mockResolvedValue({ externalId: 'x1' })
  syncPayment.mockResolvedValue('PAID')
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

test('bodyParser is disabled', () => expect(mod.config.api.bodyParser).toBe(false))

test('reads the raw body unchanged (multiple chunks) and passes headers and settings', async () => {
  const res = await call(['{"a":', ' 1}'], { headers: { 'x-sig': 's' } })
  expect(res.status).toHaveBeenCalledWith(200)
  expect(mockDriver.parseWebhook).toHaveBeenCalledWith({ rawBody: '{"a": 1}', headers: { 'x-sig': 's' }, settings: { s: 1 } })
  expect(syncPayment).toHaveBeenCalledWith({ provider: 'sumup', externalId: 'x1' })
})

test('add-on off = 404, nothing parsed', async () => {
  isShopEnabled.mockResolvedValue(false)
  expect((await call(['{}'])).status).toHaveBeenCalledWith(404)
  expect(mockDriver.parseWebhook).not.toHaveBeenCalled()
})

test('unknown provider = 404 (also prototype names)', async () => {
  for (const p of ['nope', '__proto__', 'constructor']) expect((await call(['{}'], { provider: p })).status).toHaveBeenCalledWith(404)
  expect(syncPayment).not.toHaveBeenCalled()
})

test('non-POST = 405', async () => {
  expect((await call([], { method: 'GET' })).status).toHaveBeenCalledWith(405)
})

test('invalid signature = 400 and no sync', async () => {
  mockDriver.parseWebhook.mockRejectedValue(new Error('invalid signature'))
  const res = await call(['{}'])
  expect(res.status).toHaveBeenCalledWith(400)
  expect(syncPayment).not.toHaveBeenCalled()
})

test('unrelated event or unknown id = 200', async () => {
  mockDriver.parseWebhook.mockResolvedValue(null)
  expect((await call(['{}'])).status).toHaveBeenCalledWith(200)
  expect(syncPayment).not.toHaveBeenCalled()
  mockDriver.parseWebhook.mockResolvedValue({ externalId: 'unknown' })
  syncPayment.mockResolvedValue(null)
  expect((await call(['{}'])).status).toHaveBeenCalledWith(200)
})

test('body over 256 KB (streamed) = 413 without parsing', async () => {
  const big = 'x'.repeat(100 * 1024)
  const res = await call([big, big, big])
  expect(res.status).toHaveBeenCalledWith(413)
  expect(mockDriver.parseWebhook).not.toHaveBeenCalled()
})

test('declared content-length over the limit = 413 immediately', async () => {
  const res = await call(['{}'], { headers: { 'content-length': String(256 * 1024 + 1) } })
  expect(res.status).toHaveBeenCalledWith(413)
})

test('body exactly at the limit is accepted', async () => {
  const res = await call(['x'.repeat(256 * 1024)])
  expect(res.status).toHaveBeenCalledWith(200)
})

test('temporary errors = 500 so the provider retries', async () => {
  syncPayment.mockRejectedValue(new Error('db down'))
  expect((await call(['{}'])).status).toHaveBeenCalledWith(500)
  mockDriver.parseWebhook.mockRejectedValue(new Error('other'))
  expect((await call(['{}'])).status).toHaveBeenCalledWith(500)
})

test('responses are no-store and leak nothing', async () => {
  const res = await call(['{}'])
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  expect(res.json).toHaveBeenCalledWith({ received: true })
})
