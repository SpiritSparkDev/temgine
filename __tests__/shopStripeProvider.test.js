jest.disableAutomock()

const crypto = require('crypto')
const stripe = require('../lib/shop/providers/stripe')

const KEY = 'sk_test_SECRETKEY123'
const WH = 'whsec_WEBHOOKSECRET456'
const settings = { shop_stripe_secret_key: KEY, shop_stripe_webhook_secret: WH }
const res = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) })

beforeEach(() => {
  global.fetch = jest.fn()
  delete process.env.SHOP_STRIPE_API_BASE
})

test('Metadaten', () => {
  expect(stripe.id).toBe('stripe')
  expect(stripe.label).toBe('Stripe')
})

describe('encodeForm', () => {
  test('verschachtelt, Arrays mit Index, null/undefined weggelassen', () => {
    expect(stripe.encodeForm({ a: 1, b: { c: 'x', d: null, e: undefined }, l: [{ q: 2 }, { q: 3 }] })).toBe('a=1&b[c]=x&l[0][q]=2&l[1][q]=3')
  })
  test('Umlaute, Leerzeichen, Sonderzeichen und Klammern in Werten', () => {
    expect(stripe.encodeForm({ n: 'Größe & Maß [A]=1' })).toBe('n=Gr%C3%B6%C3%9Fe%20%26%20Ma%C3%9F%20%5BA%5D%3D1')
  })
  test('0 und false bleiben erhalten', () => {
    expect(stripe.encodeForm({ a: 0, b: false })).toBe('a=0&b=false')
  })
})

describe('testConnection', () => {
  test('Testmodus / Live-Modus, GET /v1/balance mit Bearer', async () => {
    global.fetch.mockResolvedValue(res(200, { livemode: false }))
    expect(await stripe.testConnection({ settings })).toEqual({ ok: true, info: 'Konto erreichbar (Testmodus)' })
    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toBe('https://api.stripe.com/v1/balance')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    global.fetch.mockResolvedValue(res(200, { livemode: true }))
    expect((await stripe.testConnection({ settings })).info).toBe('Konto erreichbar (Live-Modus)')
  })
  test('Fehler: deutsch, ohne Key', async () => {
    for (const status of [401, 500]) {
      global.fetch.mockResolvedValue(res(status, { key: KEY }))
      const r = await stripe.testConnection({ settings })
      expect(r.ok).toBe(false)
      expect(r.error).toMatch(/Stripe/)
      expect(JSON.stringify(r)).not.toContain(KEY)
      expect(JSON.stringify(r)).not.toContain(WH)
    }
    global.fetch.mockRejectedValue(new Error(KEY))
    const r = await stripe.testConnection({ settings })
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain(KEY)
  })
  test('SHOP_STRIPE_API_BASE überschreibt den Host', async () => {
    process.env.SHOP_STRIPE_API_BASE = 'http://localhost:9999'
    global.fetch.mockResolvedValue(res(200, {}))
    await stripe.testConnection({ settings })
    expect(global.fetch.mock.calls[0][0]).toBe('http://localhost:9999/v1/balance')
  })
})

describe('createPayment', () => {
  const urls = { returnUrl: 'https://s.de/bestellung?ref=ORD-1', cancelUrl: 'https://s.de/kasse', webhookUrl: 'https://s.de/w' }
  const order = {
    reference: 'ORD-2026-000001',
    totalCents: 2480,
    currency: 'EUR',
    email: 'a+b@b.de',
    items: [{ title: 'Würfel [Set]', label: 'Rot', qty: 2, unitCents: 990 }]
  }

  test('exakte Request-Form inkl. Versandposition', async () => {
    global.fetch.mockResolvedValue(res(200, { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }))
    const out = await stripe.createPayment({ order, settings, urls })
    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(init.headers['Idempotency-Key']).toBe('ORD-2026-000001')
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    const p = new URLSearchParams(init.body)
    expect(Object.fromEntries(p)).toEqual({
      mode: 'payment',
      client_reference_id: 'ORD-2026-000001',
      customer_email: 'a+b@b.de',
      success_url: urls.returnUrl,
      cancel_url: urls.cancelUrl,
      'line_items[0][quantity]': '2',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': '990',
      'line_items[0][price_data][product_data][name]': 'Würfel [Set] – Rot',
      'line_items[1][quantity]': '1',
      'line_items[1][price_data][currency]': 'eur',
      'line_items[1][price_data][unit_amount]': '500',
      'line_items[1][price_data][product_data][name]': 'Versand',
      'metadata[reference]': 'ORD-2026-000001',
      'payment_intent_data[metadata][reference]': 'ORD-2026-000001'
    })
    expect(out).toEqual({ externalId: 'cs_1', client: { type: 'redirect', url: 'https://checkout.stripe.com/c/pay/cs_1' } })
  })

  test('ohne Versand keine Versandposition', async () => {
    global.fetch.mockResolvedValue(res(200, { id: 'cs_1', url: 'u' }))
    await stripe.createPayment({ order: { ...order, totalCents: 1980 }, settings, urls })
    const p = new URLSearchParams(global.fetch.mock.calls[0][1].body)
    expect(p.has('line_items[1][quantity]')).toBe(false)
  })

  test('Summe stimmt exakt: Positionen + Versand = totalCents', async () => {
    global.fetch.mockResolvedValue(res(200, { id: 'cs_1', url: 'u' }))
    await stripe.createPayment({ order, settings, urls })
    const p = new URLSearchParams(global.fetch.mock.calls[0][1].body)
    let sum = 0
    for (let i = 0; p.has(`line_items[${i}][quantity]`); i++) {
      sum += Number(p.get(`line_items[${i}][quantity]`)) * Number(p.get(`line_items[${i}][price_data][unit_amount]`))
    }
    expect(sum).toBe(order.totalCents)
  })

  test('Positionen größer als Gesamtbetrag: Fehler, kein Request', async () => {
    await expect(stripe.createPayment({ order: { ...order, totalCents: 1000 }, settings, urls })).rejects.toThrow(/Stripe/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('Produktname wird auf 250 Zeichen gekürzt', async () => {
    global.fetch.mockResolvedValue(res(200, { id: 'cs_1', url: 'u' }))
    const long = { ...order, totalCents: 990, items: [{ title: 'T'.repeat(400), label: 'L', qty: 1, unitCents: 990 }] }
    await stripe.createPayment({ order: long, settings, urls })
    const p = new URLSearchParams(global.fetch.mock.calls[0][1].body)
    expect(p.get('line_items[0][price_data][product_data][name]')).toHaveLength(250)
  })

  test('Antwort ohne ID/URL wirft; HTTP-Fehler ohne Key', async () => {
    global.fetch.mockResolvedValue(res(200, {}))
    await expect(stripe.createPayment({ order, settings, urls })).rejects.toThrow()
    global.fetch.mockResolvedValue(res(400, { error: KEY }))
    const err = await stripe.createPayment({ order, settings, urls }).catch((e) => e)
    expect(err.status).toBe(400)
    expect(err.message).not.toContain(KEY)
    expect(err.message).not.toContain(WH)
  })
})

describe('fetchPayment', () => {
  test('paid -> PAID, URL-kodierte ID, Währung groß', async () => {
    global.fetch.mockResolvedValue(res(200, { payment_status: 'paid', status: 'complete', amount_total: 2480, currency: 'eur', client_reference_id: 'ORD-1' }))
    const r = await stripe.fetchPayment({ externalId: 'cs/1 x', settings })
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.stripe.com/v1/checkout/sessions/cs%2F1%20x')
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(r).toEqual({ status: 'PAID', amountCents: 2480, currency: 'EUR', reference: 'ORD-1' })
  })
  test.each([
    [{ payment_status: 'unpaid', status: 'open' }, 'PENDING'],
    [{ payment_status: 'unpaid', status: 'complete' }, 'PENDING'],
    [{ payment_status: 'unpaid', status: 'expired' }, 'CANCELLED'],
    [{ payment_status: 'no_payment_required', status: 'complete' }, 'PENDING'],
    [{}, 'PENDING']
  ])('%j -> %s', async (body, want) => {
    global.fetch.mockResolvedValue(res(200, { amount_total: 1, currency: 'eur', client_reference_id: 'R', ...body }))
    expect((await stripe.fetchPayment({ externalId: 'x', settings })).status).toBe(want)
  })
  test('HTTP-Fehler wirft mit status', async () => {
    global.fetch.mockResolvedValue(res(404, {}))
    await expect(stripe.fetchPayment({ externalId: 'x', settings })).rejects.toMatchObject({ status: 404 })
  })
})

describe('parseWebhook', () => {
  const NOW = 1_800_000_000_000
  const t = Math.floor(NOW / 1000)
  const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_9' } } })
  const sig = (b, ts = t, secret = WH) => crypto.createHmac('sha256', secret).update(`${ts}.${b}`, 'utf8').digest('hex')
  const parse = (rawBody, header, extra = {}) => stripe.parseWebhook({ rawBody, headers: header === undefined ? {} : { 'stripe-signature': header }, settings, now: NOW, ...extra })
  const bad = (p) => expect(p).rejects.toThrow('invalid signature')

  test('gültige Signatur -> externalId (String und Buffer)', async () => {
    expect(await parse(body, `t=${t},v1=${sig(body)}`)).toEqual({ externalId: 'cs_9' })
    expect(await parse(Buffer.from(body), `t=${t},v1=${sig(body)}`)).toEqual({ externalId: 'cs_9' })
  })
  test('Umlaute im Body (UTF-8)', async () => {
    const b = JSON.stringify({ type: 'checkout.session.expired', data: { object: { id: 'cs_ü' }, note: 'Größe' } })
    expect(await parse(b, `t=${t},v1=${sig(b)}`)).toEqual({ externalId: 'cs_ü' })
  })
  test('falsches Secret', async () => {
    await bad(parse(body, `t=${t},v1=${sig(body, t, 'whsec_other')}`))
  })
  test('manipulierter Body', async () => {
    await bad(parse(body.replace('cs_9', 'cs_8'), `t=${t},v1=${sig(body)}`))
  })
  test('manipulierter Zeitstempel', async () => {
    await bad(parse(body, `t=${t + 1},v1=${sig(body)}`))
  })
  test('alter und zukünftiger Zeitstempel (Toleranz 300 s)', async () => {
    await bad(parse(body, `t=${t - 301},v1=${sig(body, t - 301)}`))
    await bad(parse(body, `t=${t + 301},v1=${sig(body, t + 301)}`))
    expect(await parse(body, `t=${t - 300},v1=${sig(body, t - 300)}`)).toEqual({ externalId: 'cs_9' })
  })
  test('fehlender oder kaputter Header', async () => {
    await bad(parse(body))
    await bad(parse(body, ''))
    await bad(parse(body, 'müll'))
    await bad(parse(body, `v1=${sig(body)}`))
    await bad(parse(body, `t=${t}`))
    await bad(parse(body, `t=abc,v1=${sig(body)}`))
  })
  test('mehrere v1: eine gültige reicht (egal an welcher Stelle)', async () => {
    expect(await parse(body, `t=${t},v1=${'0'.repeat(64)},v1=${sig(body)}`)).toEqual({ externalId: 'cs_9' })
    expect(await parse(body, `t=${t},v1=${sig(body)},v1=${'0'.repeat(64)},v0=abc`)).toEqual({ externalId: 'cs_9' })
    await bad(parse(body, `t=${t},v1=${'0'.repeat(64)},v1=${'1'.repeat(64)}`))
  })
  test('Längenunterschied und Nicht-Hex ohne Ausnahme außer invalid signature', async () => {
    await bad(parse(body, `t=${t},v1=${sig(body).slice(0, 62)}`))
    await bad(parse(body, `t=${t},v1=${sig(body)}00`))
    await bad(parse(body, `t=${t},v1=zz`))
    await bad(parse(body, `t=${t},v1=`))
  })
  test('fehlendes Webhook-Secret', async () => {
    await bad(parse(body, `t=${t},v1=${sig(body, t, '')}`, { settings: {} }))
  })
  test('Fehlermeldung enthält weder Key noch Secret', async () => {
    const err = await parse(body, `t=${t},v1=bad`).catch((e) => e)
    expect(err.message).not.toContain(KEY)
    expect(err.message).not.toContain(WH)
  })
  test.each([
    ['checkout.session.completed', true],
    ['checkout.session.async_payment_succeeded', true],
    ['checkout.session.async_payment_failed', true],
    ['checkout.session.expired', true],
    ['payment_intent.succeeded', false],
    ['charge.refunded', false]
  ])('Ereignis %s', async (type, expected) => {
    const b = JSON.stringify({ type, data: { object: { id: 'cs_1' } } })
    expect(await parse(b, `t=${t},v1=${sig(b)}`)).toEqual(expected ? { externalId: 'cs_1' } : null)
  })
  test('gültig signiert, aber ohne Objekt-ID / kein JSON -> null', async () => {
    const b1 = JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } })
    expect(await parse(b1, `t=${t},v1=${sig(b1)}`)).toBeNull()
    expect(await parse('müll', `t=${t},v1=${sig('müll')}`)).toBeNull()
  })
})
