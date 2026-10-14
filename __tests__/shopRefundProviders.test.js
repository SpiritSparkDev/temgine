/**
 * refundPayment der drei Treiber gegen gemocktes fetch.
 * NICHT gegen die echten APIs getestet.
 */
jest.disableAutomock()

const sumup = require('../lib/shop/providers/sumup')
const stripe = require('../lib/shop/providers/stripe')
const paypal = require('../lib/shop/providers/paypal')

const res = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) })
const urlsOf = () => global.fetch.mock.calls.map(([u, i]) => `${i.method} ${u}`)

beforeEach(() => {
  global.fetch = jest.fn()
  delete process.env.SHOP_STRIPE_API_BASE
  delete process.env.SHOP_PAYPAL_API_BASE
})

describe('SumUp', () => {
  const KEY = 'sup_sk_REFUNDKEY'
  const settings = { shop_sumup_api_key: KEY, shop_sumup_merchant_code: 'MC1' }
  const base = { externalId: 'chk1', amountCents: 1250, currency: 'EUR', settings }

  test('Transaktion aus dem Checkout, Erstattung mit Betrag als Zahl in Euro', async () => {
    global.fetch
      .mockResolvedValueOnce(res(200, { transactions: [{ id: 'tFail', status: 'FAILED' }, { id: 'tx-1', status: 'SUCCESSFUL' }] }))
      .mockResolvedValueOnce(res(200, {}))
    expect(await sumup.refundPayment(base)).toEqual({ externalId: 'tx-1', status: 'SUCCEEDED' })
    expect(urlsOf()).toEqual([
      'GET https://api.sumup.com/v0.1/checkouts/chk1',
      'POST https://api.sumup.com/v1.0/merchants/MC1/payments/tx-1/refunds',
    ])
    const [, init] = global.fetch.mock.calls[1]
    expect(JSON.parse(init.body)).toEqual({ amount: 12.5 })
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
  })

  test('keine Transaktion -> Fehler', async () => {
    global.fetch.mockResolvedValueOnce(res(200, { transactions: [] }))
    await expect(sumup.refundPayment(base)).rejects.toThrow(/Transaktion/)
  })

  test.each([409, 422, 400])('HTTP %i von SumUp -> FAILED', async (status) => {
    global.fetch.mockResolvedValueOnce(res(200, { transactions: [{ id: 't', status: 'SUCCESSFUL' }] })).mockResolvedValueOnce(res(status, { max_refundable_amount: 1 }))
    expect((await sumup.refundPayment(base)).status).toBe('FAILED')
  })

  test('5xx und Netzwerkfehler werfen, ohne Key in der Meldung', async () => {
    global.fetch.mockResolvedValueOnce(res(200, { transactions: [{ id: 't' }] })).mockResolvedValueOnce(res(500, {}))
    const e = await sumup.refundPayment(base).catch((x) => x)
    expect(e.status).toBe(500)
    expect(e.message).not.toContain(KEY)
    global.fetch.mockReset().mockRejectedValue(new Error(KEY))
    const e2 = await sumup.refundPayment(base).catch((x) => x)
    expect(e2.message).not.toContain(KEY)
  })
})

describe('Stripe', () => {
  const KEY = 'sk_test_REFUNDKEY'
  const settings = { shop_stripe_secret_key: KEY }
  const base = { externalId: 'cs_1', amountCents: 700, currency: 'EUR', reason: 'Kulanz', settings, idempotencyKey: 'rf-abc' }

  test('payment_intent aus der Session, POST /v1/refunds mit Cent, metadata, Idempotency-Key', async () => {
    global.fetch
      .mockResolvedValueOnce(res(200, { payment_intent: 'pi_9', client_reference_id: 'ORD-1' }))
      .mockResolvedValueOnce(res(200, { id: 're_1', status: 'succeeded' }))
    expect(await stripe.refundPayment(base)).toEqual({ externalId: 're_1', status: 'SUCCEEDED' })
    expect(urlsOf()).toEqual(['GET https://api.stripe.com/v1/checkout/sessions/cs_1', 'POST https://api.stripe.com/v1/refunds'])
    const [, init] = global.fetch.mock.calls[1]
    expect(init.body).toBe('payment_intent=pi_9&amount=700&metadata[reference]=ORD-1')
    expect(init.headers['Idempotency-Key']).toBe('rf-abc')
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
  })

  test('Idempotency-Key ohne Vorgabe deterministisch', async () => {
    global.fetch.mockResolvedValue(res(200, { payment_intent: 'pi', id: 're', status: 'pending' }))
    await stripe.refundPayment({ ...base, idempotencyKey: undefined })
    await stripe.refundPayment({ ...base, idempotencyKey: undefined })
    const keys = global.fetch.mock.calls.filter(([u]) => u.endsWith('/v1/refunds')).map(([, i]) => i.headers['Idempotency-Key'])
    expect(keys[0]).toBe('refund-cs_1-700')
    expect(keys[1]).toBe(keys[0])
  })

  test.each([
    ['succeeded', 'SUCCEEDED'], ['pending', 'PENDING'], ['requires_action', 'PENDING'], ['failed', 'FAILED'], ['canceled', 'FAILED'], ['neu', 'PENDING'],
  ])('Status %s -> %s', async (s, want) => {
    global.fetch.mockResolvedValueOnce(res(200, { payment_intent: 'pi' })).mockResolvedValueOnce(res(200, { id: 're', status: s }))
    expect((await stripe.refundPayment(base)).status).toBe(want)
  })

  test('Session ohne PaymentIntent und API-Fehler', async () => {
    global.fetch.mockResolvedValueOnce(res(200, {}))
    await expect(stripe.refundPayment(base)).rejects.toThrow(/PaymentIntent/)
    global.fetch.mockReset().mockResolvedValueOnce(res(200, { payment_intent: 'pi' })).mockResolvedValueOnce(res(400, { error: { message: KEY } }))
    const e = await stripe.refundPayment(base).catch((x) => x)
    expect(e.status).toBe(400)
    expect(e.message).not.toContain(KEY)
  })

  test('SHOP_STRIPE_API_BASE überschreibt den Host', async () => {
    process.env.SHOP_STRIPE_API_BASE = 'http://localhost:9999'
    global.fetch.mockResolvedValue(res(200, { payment_intent: 'pi', id: 're', status: 'succeeded' }))
    await stripe.refundPayment(base)
    expect(urlsOf()[1]).toBe('POST http://localhost:9999/v1/refunds')
  })
})

describe('PayPal', () => {
  let settings
  let n = 0
  const order = { purchase_units: [{ payments: { captures: [{ id: 'CAP1', status: 'COMPLETED' }] } }] }
  const base = () => ({ externalId: 'ORD9', amountCents: 1205, currency: 'EUR', reason: 'Kulanz', settings, idempotencyKey: 'rf-1' })
  const route = (refundRes, orderRes = res(200, order)) => global.fetch.mockImplementation(async (url, init) => {
    if (url.endsWith('/v1/oauth2/token')) return res(200, { access_token: 'TOK', expires_in: 3600 })
    if (init.method === 'GET') return orderRes
    return refundRes
  })

  beforeEach(() => {
    n++
    settings = { shop_paypal_mode: 'sandbox', shop_paypal_client_id: `cid${n}`, shop_paypal_client_secret: 'PP_SECRET' }
  })

  test('Capture-ID aus der Order, Refund mit Betrag als Dezimalstring, note_to_payer, PayPal-Request-Id', async () => {
    route(res(201, { id: 'RF1', status: 'COMPLETED' }))
    expect(await paypal.refundPayment(base())).toEqual({ externalId: 'RF1', status: 'SUCCEEDED' })
    const call = global.fetch.mock.calls.find(([u]) => u.includes('/refund'))
    expect(call[0]).toBe('https://api-m.sandbox.paypal.com/v2/payments/captures/CAP1/refund')
    expect(JSON.parse(call[1].body)).toEqual({ amount: { value: '12.05', currency_code: 'EUR' }, note_to_payer: 'Kulanz' })
    expect(call[1].headers['PayPal-Request-Id']).toBe('rf-1')
    expect(call[1].headers.Authorization).toBe('Bearer TOK')
  })

  test('live-Host und ohne Grund kein note_to_payer', async () => {
    settings.shop_paypal_mode = 'live'
    route(res(201, { id: 'RF1', status: 'PENDING' }))
    expect((await paypal.refundPayment({ ...base(), reason: undefined })).status).toBe('PENDING')
    const call = global.fetch.mock.calls.find(([u]) => u.includes('/refund'))
    expect(call[0].startsWith('https://api-m.paypal.com/')).toBe(true)
    expect(JSON.parse(call[1].body).note_to_payer).toBeUndefined()
  })

  test.each([['COMPLETED', 'SUCCEEDED'], ['PENDING', 'PENDING'], ['CANCELLED', 'FAILED'], ['FAILED', 'FAILED']])('Status %s -> %s', async (s, want) => {
    route(res(201, { id: 'RF', status: s }))
    expect((await paypal.refundPayment(base())).status).toBe(want)
  })

  test('Order ohne Capture -> Fehler, kein Refund-Aufruf', async () => {
    route(res(201, {}), res(200, { purchase_units: [{}] }))
    await expect(paypal.refundPayment(base())).rejects.toThrow(/Capture/)
    expect(global.fetch.mock.calls.some(([u]) => u.includes('/refund'))).toBe(false)
  })

  test('API-Fehler wirft ohne Geheimnisse', async () => {
    route(res(422, { name: 'PP_SECRET' }))
    const e = await paypal.refundPayment(base()).catch((x) => x)
    expect(e.status).toBe(422)
    expect(e.message).not.toContain('PP_SECRET')
  })

  test('SHOP_PAYPAL_API_BASE überschreibt den Host', async () => {
    process.env.SHOP_PAYPAL_API_BASE = 'http://localhost:9998'
    route(res(201, { id: 'RF', status: 'COMPLETED' }))
    await paypal.refundPayment(base())
    expect(global.fetch.mock.calls.every(([u]) => u.startsWith('http://localhost:9998/'))).toBe(true)
  })
})
