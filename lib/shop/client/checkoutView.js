import { renderCheckoutForm, renderSummary } from '../templates'
import { t } from '../i18n'
import { errorText } from './errors'
import { load, getCoupon, resolveLocale } from './cart'
import { loadCartWithCoupon } from './cartView'

const ADDR = ['name', 'street', 'zip', 'city', 'country']

/** Navigation gekapselt, damit Tests sie abfangen können (jsdom kann location.assign nicht mocken). */
export const nav = { go: (url) => window.location.assign(url) }

export const SDK_TIMEOUT_MS = 15000

// Das SumUp-SDK wird erst auf der Zahlungsstufe eingebunden. Ein vorhandenes Script ohne
// window.SumUpCard (abgebrochen/defekt) wird entfernt und neu angelegt; nach 15 s Abbruch.
function loadSdk(url) {
  if (window.SumUpCard) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const old = document.querySelector('script[data-shop-sdk]')
    if (old) old.remove()
    const s = document.createElement('script')
    s.src = url
    s.async = true
    s.setAttribute('data-shop-sdk', '1')
    let timer
    const fail = () => { clearTimeout(timer); s.remove(); reject(new Error('sdk')) }
    s.addEventListener('load', () => { clearTimeout(timer); if (window.SumUpCard) resolve(); else fail() })
    s.addEventListener('error', fail)
    timer = setTimeout(fail, SDK_TIMEOUT_MS)
    document.head.appendChild(s)
  })
}

// Nur https (oder http auf localhost) ist als Zahlungsziel erlaubt.
function safeRedirect(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))
  } catch (_) { return false }
}

const esc = (n) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(n) : String(n).replace(/["\\\]]/g, '\\$&'))

/** Rückkehr-URL zur Bestellseite, mit Zugriffstoken (accessToken aus der Checkout-Antwort). */
export const orderUrl = (reference, token) =>
  `/bestellung?ref=${encodeURIComponent(reference)}${token ? `&t=${encodeURIComponent(token)}` : ''}`

export async function hydrateCheckout(el) {
  if (!load().length) {
    const l = resolveLocale('')
    el.innerHTML = `<p class="shop-empty">${t(l, 'shop.cart.empty')}</p><p><a class="shop-link" href="/shop">${t(l, 'shop.cart.continue')}</a></p>`
    return
  }
  let countries
  let providers
  let cfg
  try {
    const res = await fetch('/api/shop/public/config')
    if (!res.ok) throw new Error('config')
    cfg = await res.json()
    countries = cfg.countries || []
    providers = Array.isArray(cfg.paymentProviders) ? cfg.paymentProviders : []
  } catch (_) {
    const p = document.createElement('p')
    p.className = 'shop-error'
    p.textContent = t(resolveLocale(''), 'shop.checkout.loadError')
    el.textContent = ''
    el.appendChild(p)
    return
  }
  const locale = resolveLocale(cfg.locale)
  const currency = cfg.currency || 'EUR'
  const L = (key, vars) => t(locale, key, vars)
  el.innerHTML = renderCheckoutForm(countries, providers, { locale, currency })
  const form = el.querySelector('[data-shop-form]')
  const submit = form.querySelector('[data-shop-submit]')
  const summaryEl = form.querySelector('[data-shop-summary]')
  const waiver = form.querySelector('[data-shop-waiver]')
  const diff = form.querySelector('[data-shop-diff]')
  const shipGroup = form.querySelector('[data-shop-shipping-group]')
  const formError = form.querySelector('[data-shop-formerror]')
  let ok = false
  let busy = false
  let done = false
  let digital = false
  let seq = 0

  const pay = el.querySelector('[data-shop-pay]')
  const sync = () => { submit.disabled = !ok || busy || done || !providers.length }
  const val = (n) => form.elements[n].value
  const countryName = () => (diff.checked ? 'shipping.country' : 'billing.country')

  async function refresh() {
    const my = ++seq
    ok = false; sync()
    try {
      const { data, couponError } = await loadCartWithCoupon(load(), val(countryName()), locale)
      if (my !== seq) return
      summaryEl.innerHTML = renderSummary(data, { locale, currency: data.currency || currency, couponMessage: couponError })
      digital = (data.lines || []).some((l) => l.digital)
      waiver.hidden = !digital
      ok = data.totalCents != null && !data.shippingError
    } catch (e) {
      if (my !== seq) return
      summaryEl.textContent = ''
      const p = document.createElement('p')
      p.className = 'shop-error'
      p.setAttribute('role', 'alert')
      p.textContent = e.message
      summaryEl.appendChild(p)
    }
    sync()
  }

  function clearErrors() {
    formError.hidden = true
    form.querySelectorAll('[aria-invalid]').forEach((i) => { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby') })
    form.querySelectorAll('[data-error-for]').forEach((s) => { s.hidden = true; s.textContent = '' })
  }
  // true, wenn ein Feld für den Schlüssel existiert
  function fieldError(name, msg) {
    const input = form.elements[name]
    let span = null
    try { span = form.querySelector(`[data-error-for="${esc(name)}"]`) } catch (_) { /* ungültiger Schlüssel: Meldung geht in den Formularfehler */ }
    if (input) {
      input.setAttribute('aria-invalid', 'true')
      if (span && span.id) input.setAttribute('aria-describedby', span.id)
    }
    if (span) { span.textContent = msg; span.hidden = false }
    return !!span
  }
  function focusFirstError() {
    const f = form.querySelector('[aria-invalid="true"]') || (formError.hidden ? null : formError)
    if (!f) return
    if (f === formError) f.setAttribute('tabindex', '-1')
    f.focus()
  }

  diff.addEventListener('change', () => {
    shipGroup.hidden = !diff.checked
    shipGroup.querySelectorAll('input, select').forEach((i) => {
      if (diff.checked) { i.required = true; i.setAttribute('aria-required', 'true') } else { i.required = false; i.removeAttribute('aria-required') }
    })
    refresh()
  })
  form.addEventListener('change', (e) => { if (e.target.name === countryName()) refresh() })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (busy || done || !ok) return
    busy = true; sync(); clearErrors()
    const addr = (p) => Object.fromEntries(ADDR.map((k) => [k, val(`${p}.${k}`).trim()]))
    const checked = form.querySelector('[name="provider"]:checked')
    const body = {
      provider: checked ? checked.value : providers[0].id,
      items: load(),
      email: val('email').trim(),
      billing: addr('billing'),
      acceptTerms: form.elements.acceptTerms.checked,
      acceptWaiver: digital ? form.elements.acceptWaiver.checked : false,
      locale,
    }
    const coupon = getCoupon()
    if (coupon) body.coupon = coupon
    if (diff.checked) body.shipping = addr('shipping')
    try {
      const res = await fetch('/api/shop/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      const client = data.payment && data.payment.client
      if (res.status === 201 && client && (client.type === 'widget' || client.type === 'redirect')) {
        done = true
        form.hidden = true
        pay.hidden = false
        const note = pay.querySelector('[data-shop-done]')
        note.textContent = L('shop.checkout.created', { reference: data.reference })
        if (client.type === 'redirect') {
          if (safeRedirect(client.url)) nav.go(client.url)
          else {
            form.hidden = false; pay.hidden = true; done = false
            formError.textContent = L('shop.checkout.payNotStarted')
            formError.hidden = false
          }
        } else startWidget(pay, client, data.reference, data.accessToken, L)
      } else if (res.status === 201) {
        formError.textContent = L('shop.checkout.payNotStarted')
        formError.hidden = false
      } else if (data.code === 'NO_PAYMENT_PROVIDER') {
        formError.textContent = L('shop.checkout.noProvider')
        formError.hidden = false
      } else if (res.status === 502 || data.code === 'PAYMENT_UNAVAILABLE') {
        formError.textContent = L('shop.checkout.payUnavailable')
        formError.hidden = false
      } else {
        const fields = (data.details && data.details.fields) || {}
        const rest = Object.keys(fields).filter((k) => !fieldError(k, fields[k])).map((k) => fields[k])
        if (!Object.keys(fields).length || rest.length) {
          formError.textContent = errorText(locale, rest.length ? { ...data, error: rest.join(' ') } : data, 'shop.checkout.orderError')
          formError.hidden = false
        }
      }
    } catch (_) {
      formError.textContent = L('shop.checkout.sendError')
      formError.hidden = false
    }
    busy = false; sync()
    focusFirstError()
  })

  refresh()
}

function startWidget(pay, client, reference, token, L) {
  const card = pay.querySelector('[data-shop-card]')
  const err = pay.querySelector('[data-shop-payerror]')
  const retry = pay.querySelector('[data-shop-retry]')
  const fail = (msg) => { err.textContent = msg; err.hidden = false; retry.hidden = false }

  async function mount() {
    err.hidden = true
    retry.hidden = true
    try {
      await loadSdk(client.sdkUrl)
    } catch (_) {
      fail(L('shop.checkout.sdkError'))
      return
    }
    card.hidden = false
    try {
      if (typeof window.SumUpCard.unmount === 'function') window.SumUpCard.unmount()
    } catch (_) { /* nichts eingehängt */ }
    window.SumUpCard.mount({
      id: 'shop-sumup-card',
      checkoutId: client.checkoutId,
      locale: client.locale,
      // success ist kein Zahlungsbeweis: der Server prüft den Status auf der Bestellseite.
      onResponse: (type) => {
        if (type === 'success') nav.go(orderUrl(reference, token))
        else if (type === 'error' || type === 'fail') fail(L('shop.checkout.payFailed'))
      },
    })
  }
  retry.onclick = mount
  mount()
}
