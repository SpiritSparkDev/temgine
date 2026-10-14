import { request } from './http'

export const id = 'paypal'
export const label = 'PayPal'

const BASES = { sandbox: 'https://api-m.sandbox.paypal.com', live: 'https://api-m.paypal.com' }
const TOKEN_RESERVE_MS = 60 * 1000

function mode(settings) {
  return settings.shop_paypal_mode === 'live' ? 'live' : 'sandbox'
}

// SHOP_PAYPAL_API_BASE only exists for local tests against a mock server; production always uses the real hosts.
export function apiBase(settings) {
  return process.env.SHOP_PAYPAL_API_BASE || BASES[mode(settings)]
}

// Access tokens live in module memory only (never logged, never in errors).
const tokenCache = new Map()

async function getToken(settings, force = false) {
  const base = apiBase(settings)
  const key = `${mode(settings)}|${settings.shop_paypal_client_id}|${base}`
  const hit = tokenCache.get(key)
  if (!force && hit && hit.expiresAt > Date.now()) return hit.token

  const basic = Buffer.from(`${settings.shop_paypal_client_id}:${settings.shop_paypal_client_secret}`).toString('base64')
  const { data } = await request(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  })
  if (!data || !data.access_token) throw new Error('PayPal: Antwort ohne Zugriffstoken')
  const ttl = Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : 0
  tokenCache.set(key, { token: data.access_token, expiresAt: Date.now() + ttl - TOKEN_RESERVE_MS })
  return data.access_token
}

// Authenticated call; one retry with a fresh token if PayPal rejects the cached one.
async function api(settings, path, { method = 'GET', headers = {}, body } = {}) {
  const run = async (force) => {
    const token = await getToken(settings, force)
    return request(`${apiBase(settings)}${path}`, { method, headers: { ...headers, Authorization: `Bearer ${token}` }, body })
  }
  try {
    return await run(false)
  } catch (e) {
    if (e.status !== 401) throw e
    return run(true)
  }
}

export async function testConnection({ settings }) {
  try {
    await getToken(settings, true)
    return { ok: true, info: `Verbunden (${mode(settings) === 'live' ? 'Live' : 'Sandbox'})` }
  } catch (e) {
    if (e.status === 401 || e.status === 403) return { ok: false, error: 'Zugangsdaten wurden von PayPal abgelehnt.' }
    if (e.code === 'TIMEOUT') return { ok: false, error: 'PayPal antwortet nicht (Zeitüberschreitung).' }
    return { ok: false, error: 'Verbindung zu PayPal fehlgeschlagen.' }
  }
}

// Integer cents -> 'xx.yy' without floating point.
function toDecimal(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('PayPal: ungültiger Betrag')
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

// 'xx.yy' -> integer cents without floating point, null if not a plain decimal.
function toCents(value) {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value))
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'))
}

export async function createPayment({ order, settings, urls }) {
  const currency = order.currency || 'EUR'
  const source = order.items || []
  if (!source.length) throw new Error('PayPal: Bestellung ohne Positionen')

  const items = source.map((it) => ({
    name: (it.label ? `${it.title} (${it.label})` : String(it.title)).slice(0, 127),
    quantity: String(it.qty),
    unit_amount: { currency_code: currency, value: toDecimal(it.unitCents) }
  }))
  const itemTotal = source.reduce((sum, it) => sum + it.qty * it.unitCents, 0)
  const discount = order.discountCents || 0
  const shipping = order.totalCents - itemTotal + discount
  if (!Number.isSafeInteger(itemTotal) || shipping < 0 || discount > itemTotal) throw new Error('PayPal: Positionssumme passt nicht zum Gesamtbetrag')

  const { data } = await api(settings, '/v2/checkout/orders', {
    method: 'POST',
    headers: { 'PayPal-Request-Id': order.reference },
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: order.reference,
          invoice_id: order.reference,
          amount: {
            currency_code: currency,
            value: toDecimal(order.totalCents),
            breakdown: {
              item_total: { currency_code: currency, value: toDecimal(itemTotal) },
              shipping: { currency_code: currency, value: toDecimal(shipping) },
              ...(discount > 0 ? { discount: { currency_code: currency, value: toDecimal(discount) } } : {})
            }
          },
          items
        }
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: urls.returnUrl,
            cancel_url: urls.cancelUrl,
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING'
          }
        }
      }
    }
  })
  if (!data || !data.id) throw new Error('PayPal: Antwort ohne Order-ID')
  const links = data.links || []
  const link = links.find((l) => l.rel === 'payer-action') || links.find((l) => l.rel === 'approve')
  if (!link || !link.href) throw new Error('PayPal: Antwort ohne Zahlungs-Link')
  return { externalId: data.id, client: { type: 'redirect', url: link.href } }
}

function evaluate(o) {
  const unit = (o.purchase_units && o.purchase_units[0]) || {}
  const capture = unit.payments && unit.payments.captures && unit.payments.captures[0]
  const reference = unit.custom_id
  const amountOf = (a) => (a ? { amountCents: toCents(a.value), currency: a.currency_code } : { amountCents: null, currency: undefined })

  if (capture) {
    if (capture.status === 'DECLINED' || capture.status === 'FAILED') return { status: 'FAILED', ...amountOf(capture.amount), reference }
    if (o.status === 'COMPLETED' && capture.status === 'COMPLETED') return { status: 'PAID', ...amountOf(capture.amount), reference }
  }
  const status = o.status === 'VOIDED' ? 'CANCELLED' : 'PENDING'
  return { status, ...amountOf(unit.amount), reference }
}

export async function fetchPayment({ externalId, settings }) {
  const path = `/v2/checkout/orders/${encodeURIComponent(externalId)}`
  let { data } = await api(settings, path)
  if (data && data.status === 'APPROVED') {
    try {
      // Fixed request id: concurrent/repeated syncs capture at most once.
      ;({ data } = await api(settings, `${path}/capture`, {
        method: 'POST',
        headers: { 'PayPal-Request-Id': `capture-${externalId}` },
        body: {}
      }))
    } catch (e) {
      // 422 (e.g. ORDER_ALREADY_CAPTURED): somebody else captured, read the order again.
      if (e.status !== 422) throw e
      ;({ data } = await api(settings, path))
    }
  }
  return evaluate(data || {})
}

const ORDER_EVENTS = ['CHECKOUT.ORDER.APPROVED']
const CAPTURE_EVENTS = ['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.DENIED']

export async function parseWebhook({ rawBody, headers, settings }) {
  let event
  try {
    event = JSON.parse(String(rawBody))
  } catch {
    return null
  }
  if (!event || typeof event !== 'object') return null

  let externalId = null
  if (ORDER_EVENTS.includes(event.event_type)) externalId = event.resource && event.resource.id
  else if (CAPTURE_EVENTS.includes(event.event_type)) {
    const r = event.resource
    externalId = r && r.supplementary_data && r.supplementary_data.related_ids && r.supplementary_data.related_ids.order_id
  } else return null
  if (typeof externalId !== 'string' || !externalId) return null

  const h = headers || {}
  const sig = {
    transmission_id: h['paypal-transmission-id'],
    transmission_time: h['paypal-transmission-time'],
    transmission_sig: h['paypal-transmission-sig'],
    cert_url: h['paypal-cert-url'],
    auth_algo: h['paypal-auth-algo']
  }
  if (Object.values(sig).some((v) => !v)) throw new Error('invalid signature')

  // Network/API errors propagate (-> 500, PayPal retries); only an explicit non-SUCCESS is a bad signature.
  const { data } = await api(settings, '/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: { ...sig, webhook_id: settings.shop_paypal_webhook_id, webhook_event: event }
  })
  if (!data || data.verification_status !== 'SUCCESS') throw new Error('invalid signature')
  return { externalId }
}

const REFUND_STATUS = { COMPLETED: 'SUCCEEDED', PENDING: 'PENDING', CANCELLED: 'FAILED', FAILED: 'FAILED' }

// Refund (not tested against the real API): capture id from the order, POST /v2/payments/captures/{id}/refund.
export async function refundPayment({ externalId, amountCents, currency, reason, settings, idempotencyKey }) {
  const { data: order } = await api(settings, `/v2/checkout/orders/${encodeURIComponent(externalId)}`)
  const unit = (order && order.purchase_units && order.purchase_units[0]) || {}
  const capture = unit.payments && unit.payments.captures && unit.payments.captures[0]
  if (!capture || !capture.id) throw new Error('PayPal: keine Zahlung (Capture) zur Bestellung gefunden')
  const body = { amount: { value: toDecimal(amountCents), currency_code: currency || 'EUR' } }
  if (reason) body.note_to_payer = String(reason).slice(0, 255)
  const { data } = await api(settings, `/v2/payments/captures/${encodeURIComponent(capture.id)}/refund`, {
    method: 'POST',
    headers: { 'PayPal-Request-Id': String(idempotencyKey || `refund-${externalId}-${amountCents}`) },
    body
  })
  if (!data || !data.id) throw new Error('PayPal: Antwort ohne Erstattung')
  return { externalId: data.id, status: REFUND_STATUS[data.status] || 'PENDING' }
}
