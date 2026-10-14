import { request } from './http'

export const id = 'sumup'
export const label = 'SumUp'

const BASE = 'https://api.sumup.com'
const SDK_URL = 'https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js'

function auth(settings) {
  return { Authorization: `Bearer ${settings.shop_sumup_api_key}` }
}

export async function testConnection({ settings }) {
  try {
    const { data } = await request(`${BASE}/v0.1/me`, { headers: auth(settings) })
    const code = data && data.merchant_profile && data.merchant_profile.merchant_code
    return { ok: true, info: `Merchant: ${code || settings.shop_sumup_merchant_code || '-'}` }
  } catch (e) {
    if (e.status === 401 || e.status === 403) return { ok: false, error: 'API-Key wurde von SumUp abgelehnt.' }
    if (e.code === 'TIMEOUT') return { ok: false, error: 'SumUp antwortet nicht (Zeitüberschreitung).' }
    return { ok: false, error: 'Verbindung zu SumUp fehlgeschlagen.' }
  }
}

export async function createPayment({ order, settings, urls }) {
  const { data } = await request(`${BASE}/v0.1/checkouts`, {
    method: 'POST',
    headers: auth(settings),
    body: {
      checkout_reference: order.reference,
      amount: Number((order.totalCents / 100).toFixed(2)),
      currency: order.currency || 'EUR',
      merchant_code: settings.shop_sumup_merchant_code,
      description: `Bestellung ${order.reference}`,
      return_url: urls.webhookUrl
    }
  })
  if (!data || !data.id) throw new Error('SumUp: Antwort ohne Checkout-ID')
  return {
    externalId: data.id,
    client: { type: 'widget', sdkUrl: SDK_URL, checkoutId: data.id, locale: 'de-DE' }
  }
}

export async function fetchPayment({ externalId, settings }) {
  const { data } = await request(`${BASE}/v0.1/checkouts/${encodeURIComponent(externalId)}`, {
    headers: auth(settings)
  })
  const d = data || {}
  const status = d.status === 'PAID' || d.status === 'FAILED' ? d.status : 'PENDING'
  return {
    status,
    amountCents: Math.round(Number(d.amount) * 100),
    currency: d.currency,
    reference: d.checkout_reference
  }
}

// SumUp signs nothing: the body is only a hint, fetchPayment decides.
export async function parseWebhook({ rawBody }) {
  try {
    const payload = JSON.parse(String(rawBody))
    const cid = payload && payload.payload && payload.payload.checkout_id
    return typeof cid === 'string' && cid ? { externalId: cid } : null
  } catch {
    return null
  }
}

// Refund (not tested against the real API). Docs: POST /v1.0/merchants/{merchant_code}/payments/{transaction_id}/refunds,
// body { amount } as a number in major units. The transaction id comes from GET /v0.1/checkouts/{id} -> transactions.
export async function refundPayment({ externalId, amountCents, settings }) {
  const { data } = await request(`${BASE}/v0.1/checkouts/${encodeURIComponent(externalId)}`, { headers: auth(settings) })
  const txs = (data && Array.isArray(data.transactions) && data.transactions) || []
  const tx = txs.find((t) => t && t.status === 'SUCCESSFUL') || txs[0]
  const txId = tx && (tx.id || tx.transaction_id)
  if (!txId) throw new Error('SumUp: keine Transaktion zur Zahlung gefunden')
  const merchant = settings.shop_sumup_merchant_code
  try {
    await request(`${BASE}/v1.0/merchants/${encodeURIComponent(merchant)}/payments/${encodeURIComponent(txId)}/refunds`, {
      method: 'POST',
      headers: auth(settings),
      body: { amount: Number((amountCents / 100).toFixed(2)) }
    })
  } catch (e) {
    // 4xx = SumUp rejected the refund (not refundable, amount too high, no permission)
    if (e.status >= 400 && e.status < 500) return { externalId: String(txId), status: 'FAILED' }
    throw e
  }
  // The API answers with an empty body and no refund id: the transaction id is the reference.
  return { externalId: String(txId), status: 'SUCCEEDED' }
}
