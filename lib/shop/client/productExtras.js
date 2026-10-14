// Produktseite: Wunschliste, "Benachrichtige mich", Hinweis aus ?stockalert=, verwandte Produkte (Paket F2).
// F1 ruft mountProductExtras(container, { product, locale }) nach dem Rendern der Produktseite auf.
import { t } from '../i18n'
import { formatMoney } from '../money'
import { esc, localeOf, loginUrl, api } from './ui'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALERT_KEYS = { confirmed: 'account.alert.confirmed', removed: 'account.alert.removed', invalid: 'account.alert.invalid' }

export function mountProductExtras(container, { product, locale } = {}) {
  if (!container || !product) return
  const loc = locale || localeOf(container)
  const L = (k, v) => t(loc, k, v)
  let box = container.querySelector('[data-shop-extras]')
  if (!box) {
    box = document.createElement('div')
    box.className = 'shop-extras'
    box.setAttribute('data-shop-extras', '')
    container.appendChild(box)
  }

  const parts = []
  const alertKey = ALERT_KEYS[new URLSearchParams(window.location.search).get('stockalert')]
  if (alertKey) parts.push(`<p class="${alertKey.endsWith('invalid') ? 'shop-error' : 'shop-success'}" data-extras-alert>${esc(L(alertKey))}</p>`)
  parts.push('<div data-extras-wish></div>')

  const unavailable = (product.formats || []).filter((f) => f.inStock === false && f.priceCents != null)
  if (unavailable.length) {
    const opts = unavailable.map((f) => `<option value="${esc(f.sku)}">${esc(f.label)}</option>`).join('')
    parts.push(`<form class="shop-notify" data-extras-notify novalidate>
<h3>${esc(L('account.notifyTitle'))}</h3><p class="shop-hint">${esc(L('account.notifyText'))}</p>
${unavailable.length > 1 ? `<div class="shop-field"><label for="nt-sku">${esc(L('account.notifyFormat'))}</label><select id="nt-sku">${opts}</select></div>` : `<input type="hidden" id="nt-sku" value="${esc(unavailable[0].sku)}">`}
<div class="shop-field"><label for="nt-email">${esc(L('account.email'))}</label><input id="nt-email" type="email" maxlength="200" autocomplete="email" required></div>
<p class="shop-error" data-notify-error hidden></p><p class="shop-success" data-notify-ok hidden>${esc(L('account.notifyDone'))}</p>
<button type="submit" class="shop-add">${esc(L('account.notifySubmit'))}</button></form>`)
  }

  const related = Array.isArray(product.related) ? product.related : []
  if (related.length) {
    parts.push(`<section class="shop-related"><h3>${esc(L('account.relatedTitle'))}</h3>${cardsHtml(related, loc)}</section>`)
  }
  box.innerHTML = parts.join('')

  const wishBox = box.querySelector('[data-extras-wish]')
  let inList = false
  const drawWish = (loggedIn) => {
    wishBox.innerHTML = loggedIn
      ? `<button type="button" class="shop-remove" data-wish-toggle aria-pressed="${inList}">${esc(L(inList ? 'account.wishlistOn' : 'account.wishlistAdd'))}</button><span class="shop-error" data-wish-error hidden>${esc(L('account.wishlistFailed'))}</span>`
      : `<p class="shop-hint">${esc(L('account.wishlistLogin'))} <a href="${esc(loginUrl())}">${esc(L('account.loginLink'))}</a></p>`
  }
  api(`/api/shop/account/wishlist?lang=${encodeURIComponent(loc)}`).then((r) => {
    if (r.status === 401) { drawWish(false); return }
    if (!r.ok) return
    inList = (r.body.items || []).some((i) => i.slug === product.slug)
    drawWish(true)
  }).catch(() => {})

  box.addEventListener('click', async (e) => {
    const btn = e.target.closest && e.target.closest('[data-wish-toggle]')
    if (!btn) return
    try {
      const r = inList
        ? await api(`/api/shop/account/wishlist?productSlug=${encodeURIComponent(product.slug)}`, { method: 'DELETE' })
        : await api('/api/shop/account/wishlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productSlug: product.slug }) })
      if (r.status === 401) { drawWish(false); return }
      if (!r.ok) throw new Error(String(r.status))
      inList = !inList
      drawWish(true)
    } catch (_) {
      box.querySelector('[data-wish-error]').hidden = false
    }
  })

  const form = box.querySelector('[data-extras-notify]')
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const errEl = form.querySelector('[data-notify-error]')
      const okEl = form.querySelector('[data-notify-ok]')
      errEl.hidden = true
      okEl.hidden = true
      const email = form.querySelector('#nt-email').value.trim()
      if (!EMAIL_RE.test(email)) { errEl.textContent = L('account.notifyInvalid'); errEl.hidden = false; return }
      try {
        const r = await api('/api/shop/public/stock-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku: form.querySelector('#nt-sku').value, email, locale: loc }) })
        if (r.ok || r.status === 404 || r.status === 409) okEl.hidden = false // neutrale Bestaetigung, keine Auskunft ueber Zustand
        else { errEl.textContent = r.status === 422 ? L('account.notifyInvalid') : L('account.notifyFailed'); errEl.hidden = false }
      } catch (_) {
        errEl.textContent = L('account.notifyFailed')
        errEl.hidden = false
      }
    })
  }
}

/** Kleine Produktkarten { slug, title, image, fromPriceCents }. Auch von cartExtras genutzt. */
export function cardsHtml(list, loc) {
  return `<ul class="shop-mini-grid">${list.map((p) => `<li class="shop-mini-card"><a href="/shop/${encodeURIComponent(p.slug)}">${/^\/uploads\/[A-Za-z0-9._/-]+$/.test(p.image || '') ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ''}<span class="shop-mini-title">${esc(p.title)}</span>${p.fromPriceCents != null ? `<span class="shop-price">${esc(t(loc, 'account.fromPrice', { price: formatMoney(p.fromPriceCents, 'EUR', loc) }))}</span>` : ''}</a></li>`).join('')}</ul>`
}
