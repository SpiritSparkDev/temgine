jest.disableAutomock()

const paypal = require('../lib/shop/providers/paypal')

const SECRET = 'PP_SECRET_xyz'
const TOKEN = 'A21_TOKEN_abc'
const WEBHOOK_ID = 'WH-ID-123'
const SB = 'https://api-m.sandbox.paypal.com'
const LIVE = 'https://api-m.paypal.com'
let n = 0
let settings
const res = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) })
const tokenRes = () => res(200, { access_token: TOKEN, expires_in: 3600 })
const calls = () => global.fetch.mock.calls
const callsTo = (part) => calls().filter(([u]) => u.includes(part))

// routes: { 'GET /v2/...': response | [responses in order] | function }
function route(map) {
  const queues = {}
  global.fetch.mockImplementation(async (url, init) => {
    if (url.endsWith('/v1/oauth2/token')) return tokenRes()
    const key = `${init.method} ${url.replace(/^https:\/\/[^/]+/, '')}`
    let r = map[key]
    if (Array.isArray(r)) {
      queues[key] = queues[key] || 0
      r = r[Math.min(queues[key]++, r.length - 1)]
    }
    if (!r) throw new Error('unmocked ' + key)
    return typeof r === 'function' ? r(url, init) : r
  })
}

beforeEach(() => {
  n += 1
  settings = { shop_paypal_client_id: `CID${n}`, shop_paypal_client_secret: SECRET, shop_paypal_webhook_id: WEBHOOK_ID, shop_paypal_mode: 'sandbox' }
  global.fetch = jest.fn()
  delete process.env.SHOP_PAYPAL_API_BASE
})

test('Metadaten und apiBase', () => {
  expect(paypal.id).toBe('paypal')
  expect(paypal.label).toBe('PayPal')
  expect(paypal.apiBase({})).toBe(SB)
  expect(paypal.apiBase({ shop_paypal_mode: 'live' })).toBe(LIVE)
  process.env.SHOP_PAYPAL_API_BASE = 'http://localhost:9999'
  expect(paypal.apiBase({ shop_paypal_mode: 'live' })).toBe('http://localhost:9999')
})

test('Token-Request: Basic-Auth, grant_type, Cache-Wiederverwendung', async () => {
  route({ 'GET /v2/checkout/orders/X': res(200, { status: 'CREATED', purchase_units: [{ custom_id: 'R' }] }) })
  await paypal.fetchPayment({ externalId: 'X', settings })
  await paypal.fetchPayment({ externalId: 'X', settings })
  const tok = callsTo('/v1/oauth2/token')
  expect(tok).toHaveLength(1)
  const [url, init] = tok[0]
  expect(url).toBe(`${SB}/v1/oauth2/token`)
  expect(init.method).toBe('POST')
  expect(init.headers.Authorization).toBe('Basic ' + Buffer.from(`${settings.shop_paypal_client_id}:${SECRET}`).toString('base64'))
  expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
  expect(init.body).toBe('grant_type=client_credentials')
  expect(callsTo('/v2/')[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`)
})

test('Token: anderer Modus = eigener Cache-Eintrag; Ablauf mit Reserve holt neu', async () => {
  route({ 'GET /v2/checkout/orders/X': res(200, { status: 'CREATED', purchase_units: [{}] }) })
  await paypal.fetchPayment({ externalId: 'X', settings })
  await paypal.fetchPayment({ externalId: 'X', settings: { ...settings, shop_paypal_mode: 'live' } })
  expect(callsTo('/v1/oauth2/token')).toHaveLength(2)
  expect(callsTo('/v1/oauth2/token')[1][0]).toBe(`${LIVE}/v1/oauth2/token`)
  const now = Date.now()
  const spy = jest.spyOn(Date, 'now').mockReturnValue(now + 3600 * 1000 - 30 * 1000)
  await paypal.fetchPayment({ externalId: 'X', settings })
  spy.mockRestore()
  expect(callsTo('/v1/oauth2/token')).toHaveLength(3)
})

test('Token wird bei 401 einmal frisch geholt', async () => {
  let first = true
  route({
    'GET /v2/checkout/orders/X': () => {
      if (first) {
        first = false
        return res(401, {})
      }
      return res(200, { status: 'CREATED', purchase_units: [{}] })
    }
  })
  expect((await paypal.fetchPayment({ externalId: 'X', settings })).status).toBe('PENDING')
  expect(callsTo('/v1/oauth2/token')).toHaveLength(2)
})

test('testConnection ok (Sandbox/Live) und umgeht den Cache', async () => {
  global.fetch.mockResolvedValue(tokenRes())
  expect(await paypal.testConnection({ settings })).toEqual({ ok: true, info: 'Verbunden (Sandbox)' })
  expect(await paypal.testConnection({ settings: { ...settings, shop_paypal_mode: 'live' } })).toEqual({ ok: true, info: 'Verbunden (Live)' })
  await paypal.testConnection({ settings })
  expect(global.fetch).toHaveBeenCalledTimes(3)
})

test('testConnection Fehler: deutsch, ohne Secret/Token', async () => {
  for (const status of [401, 500]) {
    global.fetch.mockResolvedValue(res(status, { secret: SECRET, access_token: TOKEN }))
    const r = await paypal.testConnection({ settings })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/PayPal/)
    expect(JSON.stringify(r)).not.toContain(SECRET)
    expect(JSON.stringify(r)).not.toContain(TOKEN)
  }
  global.fetch.mockRejectedValue(new Error('boom ' + SECRET))
  const r = await paypal.testConnection({ settings })
  expect(r.ok).toBe(false)
  expect(JSON.stringify(r)).not.toContain(SECRET)
  global.fetch.mockResolvedValue(res(200, {}))
  expect((await paypal.testConnection({ settings })).ok).toBe(false)
})

describe('createPayment', () => {
  const urls = { returnUrl: 'https://s.de/bestellung?ref=ORD-2026-000001', cancelUrl: 'https://s.de/kasse', webhookUrl: 'https://s.de/api/shop/webhooks/paypal' }
  const order = {
    reference: 'ORD-2026-000001',
    totalCents: 3499,
    currency: 'EUR',
    email: 'a@b.de',
    items: [
      { title: 'Dark Space', label: 'Hardcover', qty: 2, unitCents: 1499 },
      { title: 'Heft', label: '', qty: 1, unitCents: 5 }
    ]
  }

  test('exakter Request inkl. Request-Id, Breakdown und Links', async () => {
    route({
      'POST /v2/checkout/orders': res(201, {
        id: 'ORD-PP-1',
        links: [{ rel: 'self', href: 'https://x/self' }, { rel: 'payer-action', href: 'https://paypal.com/pay?token=1' }, { rel: 'approve', href: 'https://paypal.com/approve' }]
      })
    })
    const out = await paypal.createPayment({ order, settings, urls })
    expect(out).toEqual({ externalId: 'ORD-PP-1', client: { type: 'redirect', url: 'https://paypal.com/pay?token=1' } })
    const [url, init] = callsTo('/v2/checkout/orders')[0]
    expect(url).toBe(`${SB}/v2/checkout/orders`)
    expect(init.method).toBe('POST')
    expect(init.headers['PayPal-Request-Id']).toBe('ORD-2026-000001')
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: 'ORD-2026-000001',
          invoice_id: 'ORD-2026-000001',
          amount: {
            currency_code: 'EUR',
            value: '34.99',
            breakdown: {
              item_total: { currency_code: 'EUR', value: '30.03' },
              shipping: { currency_code: 'EUR', value: '4.96' }
            }
          },
          items: [
            { name: 'Dark Space (Hardcover)', quantity: '2', unit_amount: { currency_code: 'EUR', value: '14.99' } },
            { name: 'Heft', quantity: '1', unit_amount: { currency_code: 'EUR', value: '0.05' } }
          ]
        }
      ],
      payment_source: {
        paypal: {
          experience_context: { return_url: urls.returnUrl, cancel_url: urls.cancelUrl, user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING' }
        }
      }
    })
  })

  test('Fallback auf approve-Link, Versand 0.00', async () => {
    route({ 'POST /v2/checkout/orders': res(201, { id: 'P2', links: [{ rel: 'approve', href: 'https://paypal.com/approve' }] }) })
    const o = { ...order, totalCents: 3003 }
    const out = await paypal.createPayment({ order: o, settings, urls })
    expect(out.client.url).toBe('https://paypal.com/approve')
    const body = JSON.parse(callsTo('/v2/checkout/orders')[0][1].body)
    expect(body.purchase_units[0].amount.breakdown.shipping.value).toBe('0.00')
  })

  test('Namen werden auf 127 Zeichen gekürzt', async () => {
    route({ 'POST /v2/checkout/orders': res(201, { id: 'P3', links: [{ rel: 'approve', href: 'u' }] }) })
    const o = { reference: 'R', totalCents: 100, items: [{ title: 'x'.repeat(300), label: 'y', qty: 1, unitCents: 100 }] }
    await paypal.createPayment({ order: o, settings, urls })
    expect(JSON.parse(callsTo('/v2/checkout/orders')[0][1].body).purchase_units[0].items[0].name).toHaveLength(127)
  })

  test('Summe passt nicht / keine Positionen / ungültiger Betrag: Fehler vor dem Request', async () => {
    global.fetch.mockResolvedValue(tokenRes())
    await expect(paypal.createPayment({ order: { ...order, totalCents: 3000 }, settings, urls })).rejects.toThrow(/Positionssumme/)
    await expect(paypal.createPayment({ order: { ...order, items: [] }, settings, urls })).rejects.toThrow()
    await expect(paypal.createPayment({ order: { reference: 'R', totalCents: 10, items: [{ title: 't', qty: 1, unitCents: 1.5 }] }, settings, urls })).rejects.toThrow()
    expect(callsTo('/v2/')).toHaveLength(0)
  })

  test('Antwort ohne ID oder Link wirft; HTTP-Fehler ohne Secret/Token', async () => {
    route({ 'POST /v2/checkout/orders': res(201, { id: 'P', links: [] }) })
    await expect(paypal.createPayment({ order, settings, urls })).rejects.toThrow(/Link/)
    route({ 'POST /v2/checkout/orders': res(201, {}) })
    await expect(paypal.createPayment({ order, settings, urls })).rejects.toThrow(/Order-ID/)
    route({ 'POST /v2/checkout/orders': res(422, { token: TOKEN, secret: SECRET }) })
    const err = await paypal.createPayment({ order, settings, urls }).catch((e) => e)
    expect(err.status).toBe(422)
    expect(err.message).not.toContain(TOKEN)
    expect(err.message).not.toContain(SECRET)
  })
})

describe('fetchPayment', () => {
  const O = '/v2/checkout/orders/ORD1'
  const cap = (status, value = '34.99') => ({ id: 'CAP1', status, amount: { currency_code: 'EUR', value } })
  const order = (status, captures, amount = '34.99') => ({
    id: 'ORD1',
    status,
    purchase_units: [{ custom_id: 'ORD-2026-000001', amount: { currency_code: 'EUR', value: amount }, ...(captures ? { payments: { captures } } : {}) }]
  })
  const fetchIt = () => paypal.fetchPayment({ externalId: 'ORD1', settings })

  test.each([['CREATED'], ['SAVED'], ['PAYER_ACTION_REQUIRED'], ['WEIRD']])('Order %s -> PENDING, kein Capture', async (s) => {
    route({ [`GET ${O}`]: res(200, order(s)) })
    expect(await fetchIt()).toEqual({ status: 'PENDING', amountCents: 3499, currency: 'EUR', reference: 'ORD-2026-000001' })
    expect(callsTo('/capture')).toHaveLength(0)
  })

  test('VOIDED -> CANCELLED', async () => {
    route({ [`GET ${O}`]: res(200, order('VOIDED')) })
    expect((await fetchIt()).status).toBe('CANCELLED')
  })

  test('APPROVED -> Capture (Request-Id) -> COMPLETED -> PAID mit Betrag aus Capture', async () => {
    route({ [`GET ${O}`]: res(200, order('APPROVED')), [`POST ${O}/capture`]: res(201, order('COMPLETED', [cap('COMPLETED', '34.90')])) })
    expect(await fetchIt()).toEqual({ status: 'PAID', amountCents: 3490, currency: 'EUR', reference: 'ORD-2026-000001' })
    const [url, init] = callsTo('/capture')[0]
    expect(url).toBe(`${SB}${O}/capture`)
    expect(init.method).toBe('POST')
    expect(init.headers['PayPal-Request-Id']).toBe('capture-ORD1')
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  test.each([['DECLINED'], ['FAILED']])('APPROVED -> Capture %s -> FAILED', async (cs) => {
    route({ [`GET ${O}`]: res(200, order('APPROVED')), [`POST ${O}/capture`]: res(201, order('COMPLETED', [cap(cs)])) })
    expect((await fetchIt()).status).toBe('FAILED')
  })

  test('Capture PENDING (Prüfung durch PayPal) -> PENDING', async () => {
    route({ [`GET ${O}`]: res(200, order('APPROVED')), [`POST ${O}/capture`]: res(201, order('COMPLETED', [cap('PENDING')])) })
    expect((await fetchIt()).status).toBe('PENDING')
  })

  test('COMPLETED: nur PAID mit Capture COMPLETED, kein erneuter Capture', async () => {
    route({ [`GET ${O}`]: res(200, order('COMPLETED', [cap('COMPLETED')])) })
    expect((await fetchIt()).status).toBe('PAID')
    expect(callsTo('/capture')).toHaveLength(0)
    route({ [`GET ${O}`]: res(200, order('COMPLETED')) })
    expect((await fetchIt()).status).toBe('PENDING')
    route({ [`GET ${O}`]: res(200, order('COMPLETED', [cap('DECLINED')])) })
    expect((await fetchIt()).status).toBe('FAILED')
  })

  test('Capture 422 (ORDER_ALREADY_CAPTURED) -> erneut GET und auswerten', async () => {
    route({
      [`GET ${O}`]: [res(200, order('APPROVED')), res(200, order('COMPLETED', [cap('COMPLETED')]))],
      [`POST ${O}/capture`]: res(422, { details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] })
    })
    expect((await fetchIt()).status).toBe('PAID')
    expect(callsTo(O).filter(([, i]) => i.method === 'GET')).toHaveLength(2)
  })

  test('Wiederholter Aufruf nach Capture führt nicht erneut zum Capture', async () => {
    route({ [`GET ${O}`]: res(200, order('COMPLETED', [cap('COMPLETED')])) })
    await fetchIt()
    await fetchIt()
    expect(callsTo('/capture')).toHaveLength(0)
  })

  test('Anderer Capture-Fehler (500) und GET-Fehler werden geworfen, ohne Secret/Token', async () => {
    route({ [`GET ${O}`]: res(200, order('APPROVED')), [`POST ${O}/capture`]: res(500, { token: TOKEN }) })
    const err = await fetchIt().catch((e) => e)
    expect(err.status).toBe(500)
    expect(err.message).not.toContain(TOKEN)
    expect(err.message).not.toContain(SECRET)
    route({ [`GET ${O}`]: res(404, {}) })
    await expect(fetchIt()).rejects.toMatchObject({ status: 404 })
  })

  test('URL-kodierte ID; Betrag gleitkomma-sicher', async () => {
    route({ 'GET /v2/checkout/orders/a%2Fb': res(200, order('COMPLETED', [cap('COMPLETED', '0.29')])) })
    const r = await paypal.fetchPayment({ externalId: 'a/b', settings })
    expect(r.amountCents).toBe(29)
  })
})

describe('parseWebhook', () => {
  const H = {
    'paypal-transmission-id': 'tid',
    'paypal-transmission-time': '2026-10-14T10:00:00Z',
    'paypal-transmission-sig': 'sig',
    'paypal-cert-url': 'https://api.paypal.com/cert.pem',
    'paypal-auth-algo': 'SHA256withRSA'
  }
  const approved = { event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'ORD9' } }
  const parse = (event, headers = H) => paypal.parseWebhook({ rawBody: typeof event === 'string' ? event : JSON.stringify(event), headers, settings })
  const verifyRoute = (r) => route({ 'POST /v1/notifications/verify-webhook-signature': r })

  test('SUCCESS: Header und Ereignis werden weitergereicht', async () => {
    verifyRoute(res(200, { verification_status: 'SUCCESS' }))
    expect(await parse(approved)).toEqual({ externalId: 'ORD9' })
    const [url, init] = callsTo('verify-webhook-signature')[0]
    expect(url).toBe(`${SB}/v1/notifications/verify-webhook-signature`)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(init.body)).toEqual({
      transmission_id: 'tid',
      transmission_time: '2026-10-14T10:00:00Z',
      transmission_sig: 'sig',
      cert_url: 'https://api.paypal.com/cert.pem',
      auth_algo: 'SHA256withRSA',
      webhook_id: WEBHOOK_ID,
      webhook_event: approved
    })
  })

  test('FAILURE -> invalid signature', async () => {
    verifyRoute(res(200, { verification_status: 'FAILURE' }))
    await expect(parse(approved)).rejects.toThrow('invalid signature')
    verifyRoute(res(200, {}))
    await expect(parse(approved)).rejects.toThrow('invalid signature')
  })

  test('fehlende Header -> invalid signature ohne API-Aufruf', async () => {
    global.fetch.mockResolvedValue(tokenRes())
    const { 'paypal-cert-url': _drop, ...partial } = H
    await expect(parse(approved, partial)).rejects.toThrow('invalid signature')
    await expect(parse(approved, {})).rejects.toThrow('invalid signature')
    expect(callsTo('verify-webhook-signature')).toHaveLength(0)
  })

  test('Netzwerk-/HTTP-Fehler bei der Prüfung wird nicht als ungültige Signatur gewertet', async () => {
    global.fetch.mockImplementation(async (url) => {
      if (url.endsWith('/v1/oauth2/token')) return tokenRes()
      throw new Error('socket ' + SECRET)
    })
    const err = await parse(approved).catch((e) => e)
    expect(err.message).not.toBe('invalid signature')
    expect(err.code).toBe('NETWORK')
    expect(err.message).not.toContain(SECRET)
    verifyRoute(res(500, {}))
    await expect(parse(approved)).rejects.toMatchObject({ status: 500 })
  })

  test('Capture-Ereignisse liefern die Order-ID', async () => {
    verifyRoute(res(200, { verification_status: 'SUCCESS' }))
    for (const t of ['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.DENIED']) {
      const ev = { event_type: t, resource: { id: 'CAP1', supplementary_data: { related_ids: { order_id: 'ORD7' } } } }
      expect(await parse(ev)).toEqual({ externalId: 'ORD7' })
    }
  })

  test.each([
    ['anderes Ereignis', { event_type: 'BILLING.PLAN.CREATED', resource: { id: 'x' } }],
    ['Capture ohne Order-ID', { event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAP1' } }],
    ['Approved ohne ID', { event_type: 'CHECKOUT.ORDER.APPROVED', resource: {} }],
    ['ID kein String', { event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 5 } }],
    ['Müll', 'kein json'],
    ['null', 'null']
  ])('%s -> null, ohne API-Aufruf', async (_n, ev) => {
    global.fetch.mockResolvedValue(tokenRes())
    expect(await parse(ev)).toBeNull()
    expect(callsTo('verify-webhook-signature')).toHaveLength(0)
  })

  test('Buffer als Rohbody', async () => {
    verifyRoute(res(200, { verification_status: 'SUCCESS' }))
    expect(await paypal.parseWebhook({ rawBody: Buffer.from(JSON.stringify(approved)), headers: H, settings })).toEqual({ externalId: 'ORD9' })
  })
})
