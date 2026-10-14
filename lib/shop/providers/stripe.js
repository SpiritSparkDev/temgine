import crypto from 'crypto'
import { request } from './http'

export const id = 'stripe'
export const label = 'Stripe'

const TOLERANCE_S = 300
const NAME_MAX = 250
const EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired'
]

// Base URL; SHOP_STRIPE_API_BASE only exists for local tests against a mock server.
export function apiBase() {
  return process.env.SHOP_STRIPE_API_BASE || 'https://api.stripe.com'
}

function auth(settings) {
  return { Authorization: `Bearer ${settings.shop_stripe_secret_key}` }
}

// application/x-www-form-urlencoded with bracket notation; arrays use the index; null/undefined are skipped.
export function encodeForm(obj) {
  const parts = []
  const walk = (value, path) => {
    if (value === null || value === undefined) return
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`))
    } else if (typeof value === 'object') {
      for (const k of Object.keys(value)) walk(value[k], path ? `${path}[${encodeURIComponent(k)}]` : encodeURIComponent(k))
    } else {
      parts.push(`${path}=${encodeURIComponent(String(value))}`)
    }
  }
  walk(obj, '')
  return parts.join('&')
}

function lineItem(name, qty, cents) {
  return {
    quantity: qty,
    price_data: { currency: 'eur', unit_amount: cents, product_data: { name: String(name).slice(0, NAME_MAX) } }
  }
}

export function buildLineItems(order) {
  const items = (order.items || []).map((i) => lineItem(`${i.title} – ${i.label}`, i.qty, i.unitCents))
  const sum = (order.items || []).reduce((s, i) => s + i.qty * i.unitCents, 0)
  const shipping = order.totalCents - sum
  if (!Number.isInteger(order.totalCents) || !Number.isInteger(sum) || shipping < 0) {
    throw new Error('Stripe: Positionssumme passt nicht zum Gesamtbetrag')
  }
  if (shipping > 0) items.push(lineItem('Versand', 1, shipping))
  return items
}

export async function testConnection({ settings }) {
  try {
    const { data } = await request(`${apiBase()}/v1/balance`, { headers: auth(settings) })
    return { ok: true, info: `Konto erreichbar (${data && data.livemode ? 'Live-Modus' : 'Testmodus'})` }
  } catch (e) {
    if (e.status === 401 || e.status === 403) return { ok: false, error: 'API-Schlüssel wurde von Stripe abgelehnt.' }
    if (e.code === 'TIMEOUT') return { ok: false, error: 'Stripe antwortet nicht (Zeitüberschreitung).' }
    return { ok: false, error: 'Verbindung zu Stripe fehlgeschlagen.' }
  }
}

export async function createPayment({ order, settings, urls }) {
  const body = encodeForm({
    mode: 'payment',
    client_reference_id: order.reference,
    customer_email: order.email,
    success_url: urls.returnUrl,
    cancel_url: urls.cancelUrl,
    line_items: buildLineItems(order),
    metadata: { reference: order.reference },
    payment_intent_data: { metadata: { reference: order.reference } }
  })
  const { data } = await request(`${apiBase()}/v1/checkout/sessions`, {
    method: 'POST',
    headers: {
      ...auth(settings),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': order.reference
    },
    body
  })
  if (!data || !data.id || !data.url) throw new Error('Stripe: Antwort ohne Sitzung')
  return { externalId: data.id, client: { type: 'redirect', url: data.url } }
}

export async function fetchPayment({ externalId, settings }) {
  const { data } = await request(`${apiBase()}/v1/checkout/sessions/${encodeURIComponent(externalId)}`, {
    headers: auth(settings)
  })
  const d = data || {}
  const status = d.payment_status === 'paid' ? 'PAID' : d.status === 'expired' ? 'CANCELLED' : 'PENDING'
  return {
    status,
    amountCents: d.amount_total,
    currency: typeof d.currency === 'string' ? d.currency.toUpperCase() : d.currency,
    reference: d.client_reference_id
  }
}

function verifySignature(rawBody, header, secret, nowMs) {
  if (typeof header !== 'string' || !header || !secret) return false
  let t = null
  const sigs = []
  for (const part of header.split(',')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k === 't') t = v
    else if (k === 'v1') sigs.push(v)
  }
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false
  if (Math.abs(Math.floor(nowMs / 1000) - Number(t)) > TOLERANCE_S) return false
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest()
  return sigs.some((s) => {
    const got = Buffer.from(s, 'hex')
    return got.length === expected.length && crypto.timingSafeEqual(got, expected)
  })
}

// now (ms) is injectable for tests.
export async function parseWebhook({ rawBody, headers, settings, now = Date.now() }) {
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)
  const header = headers && headers['stripe-signature']
  if (!verifySignature(raw, header, settings.shop_stripe_webhook_secret, now)) throw new Error('invalid signature')
  let event
  try {
    event = JSON.parse(raw)
  } catch {
    return null
  }
  const obj = event && event.data && event.data.object
  if (!event || !EVENTS.includes(event.type) || !obj || typeof obj.id !== 'string' || !obj.id) return null
  return { externalId: obj.id }
}
