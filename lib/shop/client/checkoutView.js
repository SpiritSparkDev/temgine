import { renderCheckoutForm, renderSummary } from '../templates'
import { load } from './cart'
import { loadCartData } from './cartView'

const ADDR = ['name', 'street', 'zip', 'city', 'country']

/** Navigation gekapselt, damit Tests sie abfangen können (jsdom kann location.assign nicht mocken). */
export const nav = { go: (url) => window.location.assign(url) }

const MSG_NO_PROVIDER = 'Zurzeit ist keine Zahlungsart verfügbar.'

// Das SumUp-SDK wird erst auf der Zahlungsstufe und nur einmal eingebunden.
function loadSdk(url) {
  if (window.SumUpCard) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let s = document.querySelector('script[data-shop-sdk]')
    if (!s) {
      s = document.createElement('script')
      s.src = url
      s.async = true
      s.setAttribute('data-shop-sdk', '1')
      document.head.appendChild(s)
    }
    s.addEventListener('load', () => resolve())
    s.addEventListener('error', () => { s.remove(); reject(new Error('sdk')) })
  })
}

export async function hydrateCheckout(el) {
  if (!load().length) {
    el.innerHTML = '<p class="shop-empty">Ihr Warenkorb ist leer.</p><p><a class="shop-link" href="/shop">Weiter einkaufen</a></p>'
    return
  }
  let countries
  let providers
  try {
    const res = await fetch('/api/shop/public/config')
    if (!res.ok) throw new Error('config')
    const cfg = await res.json()
    countries = cfg.countries || []
    providers = Array.isArray(cfg.paymentProviders) ? cfg.paymentProviders : []
  } catch (_) {
    el.innerHTML = '<p class="shop-error">Die Kasse konnte nicht geladen werden.</p>'
    return
  }
  el.innerHTML = renderCheckoutForm(countries, providers)
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

  const pay = el.querySelector('[data-shop-pay]')
  const sync = () => { submit.disabled = !ok || busy || done || !providers.length }
  const val = (n) => form.elements[n].value
  const countryName = () => (diff.checked ? 'shipping.country' : 'billing.country')

  async function refresh() {
    ok = false; sync()
    try {
      const data = await loadCartData(load(), val(countryName()))
      summaryEl.innerHTML = renderSummary(data)
      digital = (data.lines || []).some((l) => l.digital)
      waiver.hidden = !digital
      ok = data.totalCents != null && !data.shippingError
    } catch (e) {
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
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'))
    form.querySelectorAll('[data-error-for]').forEach((s) => { s.hidden = true; s.textContent = '' })
  }
  // true, wenn ein Feld für den Schlüssel existiert
  function fieldError(name, msg) {
    const input = form.elements[name]
    const span = form.querySelector(`[data-error-for="${name}"]`)
    if (input) input.setAttribute('aria-invalid', 'true')
    if (span) { span.textContent = msg; span.hidden = false }
    return !!span
  }

  diff.addEventListener('change', () => { shipGroup.hidden = !diff.checked; refresh() })
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
    }
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
        note.textContent = `Bestellung ${data.reference} angelegt.`
        if (client.type === 'redirect') nav.go(client.url)
        else startWidget(pay, client, data.reference)
      } else if (res.status === 201) {
        formError.textContent = 'Die Zahlung konnte nicht gestartet werden.'
        formError.hidden = false
      } else if (data.code === 'NO_PAYMENT_PROVIDER') {
        formError.textContent = MSG_NO_PROVIDER
        formError.hidden = false
      } else if (res.status === 502 || data.code === 'PAYMENT_UNAVAILABLE') {
        formError.textContent = 'Die Zahlung ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.'
        formError.hidden = false
      } else {
        const fields = (data.details && data.details.fields) || {}
        const rest = Object.keys(fields).filter((k) => !fieldError(k, fields[k])).map((k) => fields[k])
        if (!Object.keys(fields).length || rest.length) {
          formError.textContent = rest.length ? rest.join(' ') : (data.error || 'Die Bestellung konnte nicht angelegt werden.')
          formError.hidden = false
        }
      }
    } catch (_) {
      formError.textContent = 'Die Bestellung konnte nicht gesendet werden. Bitte versuchen Sie es erneut.'
      formError.hidden = false
    }
    busy = false; sync()
  })

  refresh()
}

function startWidget(pay, client, reference) {
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
      fail('Das Zahlungsformular konnte nicht geladen werden. Bitte prüfen Sie Ihre Verbindung.')
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
        if (type === 'success') nav.go('/bestellung?ref=' + encodeURIComponent(reference))
        else if (type === 'error' || type === 'fail') fail('Die Zahlung war nicht erfolgreich. Bitte versuchen Sie es erneut.')
      },
    })
  }
  retry.onclick = mount
  mount()
}
