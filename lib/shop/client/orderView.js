import { renderOrder, formatPriceCents } from '../templates'
import { t, normalizeLocale } from '../i18n'
import { clear, resolveLocale } from './cart'

export const POLL_MAX = 5
export const POLL_MS = 3000

/** Timer über ein Objekt, damit Tests ihn ersetzen können. */
export const timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) }

// Nur relative Pfade (kein //host) bzw. https-Adressen werden als Link ausgegeben.
const relUrl = (u) => (typeof u === 'string' && /^\/(?!\/)[^\s\\]*$/.test(u) ? u : '')
const httpsUrl = (u) => {
  try {
    const p = new URL(u)
    return p.protocol === 'https:' ? p.href : ''
  } catch (_) { return '' }
}

function fmtDate(iso, locale) {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'medium' }).format(d)
}

function downloadsView(list, locale) {
  return (Array.isArray(list) ? list : [])
    .map((d) => {
      const url = relUrl(d && d.url)
      if (!url) return null
      const info = []
      if (typeof d.remaining === 'number') info.push(t(locale, 'shop.order.remaining', { n: d.remaining }))
      const date = fmtDate(d.expiresAt, locale)
      if (date) info.push(t(locale, 'shop.order.expires', { date }))
      return { url, filename: d.filename || url, info: info.join(', ') }
    })
    .filter(Boolean)
}

function trackingView(data) {
  const number = data.trackingNumber || ''
  const carrier = data.trackingCarrier || ''
  const url = httpsUrl(data.trackingUrl)
  return number || carrier || url ? { carrier, number, url } : null
}

/** Füllt el; liefert eine Funktion, die das Nachfragen abbricht. */
export function hydrateOrder(el) {
  let timer = null
  let stopped = false
  // Reihenfolge: API-locale (nach dem ersten Abruf), html lang, Deutsch.
  let locale = resolveLocale('')
  const L = (key) => t(locale, key)
  const show = (view) => { el.innerHTML = renderOrder(view, { locale }) }
  const bad = (message) => show({ tone: 'error', message, checkoutLink: true })
  const stop = () => { stopped = true; if (timer != null) timers.clear(timer) }

  const params = new URLSearchParams(window.location.search)
  const ref = params.get('ref') || ''
  const token = params.get('t') || ''
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(ref)) { bad(L('shop.order.noRef')); return stop }
  if (!/^[A-Za-z0-9._-]{8,200}$/.test(token)) { bad(L('shop.order.noToken')); return stop }

  async function check(attempt) {
    if (stopped) return
    if (!el.isConnected) { stop(); return }
    let status
    let data
    try {
      const res = await fetch(`/api/shop/public/orders/${encodeURIComponent(ref)}?t=${encodeURIComponent(token)}`)
      status = res.status
      data = res.ok ? await res.json() : null
    } catch (_) {
      if (!stopped) bad(L('shop.order.error'))
      return
    }
    if (stopped) return
    if (!data) { bad(status === 404 ? L('shop.order.unknown') : L('shop.order.error')); return }
    locale = normalizeLocale(data.locale, '') || locale
    const st = String(data.status || '').toUpperCase()
    if (data.paid || st === 'PAID' || st === 'SHIPPED') {
      clear()
      const shipped = st === 'SHIPPED'
      show({
        tone: 'success',
        message: shipped ? `${L('shop.order.thanks')} ${L('shop.order.shipped')}` : L('shop.order.thanks'),
        reference: data.reference,
        amount: formatPriceCents(data.totalCents, data.currency || 'EUR', locale),
        downloads: downloadsView(data.downloads, locale),
        invoiceUrl: relUrl(data.invoiceUrl),
        tracking: shipped ? trackingView(data) : null,
        shopLink: true,
      })
    } else if (st === 'PENDING') {
      if (attempt >= POLL_MAX) { show({ tone: 'hint', message: L('shop.order.slow'), reference: data.reference, checkoutLink: true }); return }
      show({ tone: 'hint', message: L('shop.order.pending'), reference: data.reference })
      timer = timers.set(() => check(attempt + 1), POLL_MS)
    } else if (st === 'REFUNDED') {
      show({ tone: 'hint', message: L('shop.order.refunded'), reference: data.reference, shopLink: true })
    } else {
      bad(L('shop.order.failed'))
    }
  }

  check(0)
  return stop
}
