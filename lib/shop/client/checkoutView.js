import { renderCheckoutForm, renderSummary } from '../templates'
import { load } from './cart'
import { loadCartData } from './cartView'

const ADDR = ['name', 'street', 'zip', 'city', 'country']

export async function hydrateCheckout(el) {
  if (!load().length) {
    el.innerHTML = '<p class="shop-empty">Ihr Warenkorb ist leer.</p><p><a class="shop-link" href="/shop">Weiter einkaufen</a></p>'
    return
  }
  let countries
  try {
    const res = await fetch('/api/shop/public/config')
    if (!res.ok) throw new Error('config')
    countries = (await res.json()).countries || []
  } catch (_) {
    el.innerHTML = '<p class="shop-error">Die Kasse konnte nicht geladen werden.</p>'
    return
  }
  el.innerHTML = renderCheckoutForm(countries)
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

  const sync = () => { submit.disabled = !ok || busy || done }
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
    const body = {
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
      if (res.status === 201) {
        done = true
        const note = form.querySelector('[data-shop-done]')
        note.textContent = `Bestellung ${data.reference} angelegt. Die Zahlung wird in einem nächsten Schritt angebunden.`
        note.hidden = false
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
