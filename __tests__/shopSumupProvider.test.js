jest.disableAutomock()

const sumup = require('../lib/shop/providers/sumup')

const KEY = 'sup_sk_TESTKEY123'
const MC = 'MCODE9'
const settings = { shop_sumup_api_key: KEY, shop_sumup_merchant_code: MC }
const res = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) })

beforeEach(() => {
  global.fetch = jest.fn()
})

test('Metadaten', () => {
  expect(sumup.id).toBe('sumup')
  expect(sumup.label).toBe('SumUp')
})

test('testConnection ok: GET /me mit Bearer', async () => {
  global.fetch.mockResolvedValue(res(200, { merchant_profile: { merchant_code: 'MXYZ' } }))
  expect(await sumup.testConnection({ settings })).toEqual({ ok: true, info: 'Merchant: MXYZ' })
  const [url, init] = global.fetch.mock.calls[0]
  expect(url).toBe('https://api.sumup.com/v0.1/me')
  expect(init.method).toBe('GET')
  expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
})

test('testConnection Fehler: deutsch, ohne Key/Merchant-Code', async () => {
  for (const status of [401, 500]) {
    global.fetch.mockResolvedValue(res(status, { key: KEY }))
    const r = await sumup.testConnection({ settings })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/SumUp/)
    expect(JSON.stringify(r)).not.toContain(KEY)
    expect(JSON.stringify(r)).not.toContain(MC)
  }
  global.fetch.mockRejectedValue(new Error('boom'))
  expect((await sumup.testConnection({ settings })).ok).toBe(false)
})

test('createPayment: exakte Request-Form und Client', async () => {
  global.fetch.mockResolvedValue(res(201, { id: 'chk-1' }))
  const order = { reference: 'ORD-2026-000001', totalCents: 1480, currency: 'EUR', email: 'a@b.de', items: [] }
  const out = await sumup.createPayment({ order, settings, urls: { webhookUrl: 'https://s.de/api/shop/webhooks/sumup' } })
  const [url, init] = global.fetch.mock.calls[0]
  expect(url).toBe('https://api.sumup.com/v0.1/checkouts')
  expect(init.method).toBe('POST')
  expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
  expect(init.headers['Content-Type']).toBe('application/json')
  expect(JSON.parse(init.body)).toEqual({
    checkout_reference: 'ORD-2026-000001',
    amount: 14.8,
    currency: 'EUR',
    merchant_code: MC,
    description: 'Bestellung ORD-2026-000001',
    return_url: 'https://s.de/api/shop/webhooks/sumup'
  })
  expect(out).toEqual({
    externalId: 'chk-1',
    client: { type: 'widget', sdkUrl: 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js', checkoutId: 'chk-1', locale: 'de-DE' }
  })
})

test.each([[1100, 11], [1480, 14.8], [33, 0.33], [1, 0.01], [99999, 999.99]])('Cent %i -> Euro %f', async (cents, euro) => {
  global.fetch.mockResolvedValue(res(201, { id: 'c' }))
  await sumup.createPayment({ order: { reference: 'R', totalCents: cents, currency: 'EUR' }, settings, urls: { webhookUrl: 'u' } })
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).amount).toBe(euro)
})

test('createPayment ohne ID wirft, Fehlermeldung ohne Geheimnisse', async () => {
  global.fetch.mockResolvedValue(res(200, {}))
  await expect(sumup.createPayment({ order: { reference: 'R', totalCents: 100 }, settings, urls: {} })).rejects.toThrow()
  global.fetch.mockResolvedValue(res(400, { message: 'bad' }))
  const err = await sumup.createPayment({ order: { reference: 'R', totalCents: 100 }, settings, urls: {} }).catch((e) => e)
  expect(err.status).toBe(400)
  expect(err.message).not.toContain(KEY)
  expect(err.message).not.toContain(MC)
})

test('fetchPayment: URL-kodierte ID, Betrag gleitkomma-sicher', async () => {
  global.fetch.mockResolvedValue(res(200, { status: 'PAID', amount: 14.8, currency: 'EUR', checkout_reference: 'ORD-1' }))
  const r = await sumup.fetchPayment({ externalId: 'a/b c?x', settings })
  expect(global.fetch.mock.calls[0][0]).toBe('https://api.sumup.com/v0.1/checkouts/a%2Fb%20c%3Fx')
  expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${KEY}`)
  expect(r).toEqual({ status: 'PAID', amountCents: 1480, currency: 'EUR', reference: 'ORD-1' })
})

test('fetchPayment: 0.29 und 1.1 ergeben exakte Cent', async () => {
  global.fetch.mockResolvedValue(res(200, { status: 'PAID', amount: 0.29, currency: 'EUR' }))
  expect((await sumup.fetchPayment({ externalId: 'x', settings })).amountCents).toBe(29)
  global.fetch.mockResolvedValue(res(200, { status: 'PAID', amount: 1.1, currency: 'EUR' }))
  expect((await sumup.fetchPayment({ externalId: 'x', settings })).amountCents).toBe(110)
})

test.each([['PAID', 'PAID'], ['FAILED', 'FAILED'], ['PENDING', 'PENDING'], ['WEIRD', 'PENDING'], [undefined, 'PENDING']])('Status %s -> %s', async (raw, want) => {
  global.fetch.mockResolvedValue(res(200, { status: raw, amount: 1, currency: 'EUR', checkout_reference: 'R' }))
  expect((await sumup.fetchPayment({ externalId: 'x', settings })).status).toBe(want)
})

test('fetchPayment HTTP-Fehler wirft mit status', async () => {
  global.fetch.mockResolvedValue(res(404, {}))
  await expect(sumup.fetchPayment({ externalId: 'x', settings })).rejects.toMatchObject({ status: 404 })
})

test('Timeout: Fehler ohne Key/Merchant-Code', async () => {
  global.fetch.mockImplementation((u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('x')))))
  jest.useFakeTimers()
  const p = sumup.fetchPayment({ externalId: 'x', settings }).catch((e) => e)
  await jest.advanceTimersByTimeAsync(10001)
  const err = await p
  jest.useRealTimers()
  expect(err.code).toBe('TIMEOUT')
  expect(err.message).not.toContain(KEY)
  expect(err.message).not.toContain(MC)
})

describe('parseWebhook', () => {
  const parse = (rawBody) => sumup.parseWebhook({ rawBody, headers: {}, settings })
  test('checkout_id wird übernommen', async () => {
    expect(await parse(JSON.stringify({ event_type: 'checkout.status.changed', payload: { checkout_id: 'c1' } }))).toEqual({ externalId: 'c1' })
    expect(await parse(Buffer.from('{"payload":{"checkout_id":"c2"}}'))).toEqual({ externalId: 'c2' })
  })
  test.each([['müll'], [''], ['{}'], ['null'], ['{"payload":{}}'], ['{"payload":{"checkout_id":5}}'], ['{"payload":{"checkout_id":""}}']])('%j -> null', async (raw) => {
    expect(await parse(raw)).toBeNull()
  })
})
