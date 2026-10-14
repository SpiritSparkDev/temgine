// Block shop-account (Seite meine-bestellungen): Bestellliste, Detail, Wunschliste. Nur fuer eingeloggte Mitglieder.
import { t } from '../i18n'
import { formatMoney } from '../money'
import { esc, localeOf, httpsUrl, apiPath, loginUrl, api } from './ui'

const fmtDate = (iso, locale) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE')
}

const statusText = (locale, s) => t(locale, `account.status.${s}`) === `account.status.${s}` ? esc(s) : esc(t(locale, `account.status.${s}`))

function trackingHtml(tr, locale) {
  if (!tr) return ''
  const parts = []
  if (tr.carrier) parts.push(esc(tr.carrier))
  if (tr.number) parts.push(esc(t(locale, 'account.tracking', { number: tr.number })))
  const url = httpsUrl(tr.url)
  if (url) parts.push(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(t(locale, 'account.track'))}</a>`)
  return parts.join(' · ')
}

function listHtml(orders, locale) {
  if (!orders.length) return `<p class="shop-empty">${esc(t(locale, 'account.noOrders'))}</p>`
  const rows = orders.map((o) => `<tr>
<td data-label="${esc(t(locale, 'account.orderNumber'))}"><button type="button" class="shop-link-btn shop-account-open" data-account-open="${esc(o.reference)}">${esc(o.reference)}</button></td>
<td data-label="${esc(t(locale, 'account.date'))}">${esc(fmtDate(o.createdAt, locale))}</td>
<td data-label="${esc(t(locale, 'account.status'))}">${statusText(locale, o.status)}</td>
<td data-label="${esc(t(locale, 'account.total'))}">${esc(formatMoney(o.totalCents, o.currency || 'EUR', locale))}</td>
<td data-label="${esc(t(locale, 'account.shipment'))}">${trackingHtml(o.tracking, locale)}</td>
</tr>`).join('')
  return `<table class="shop-account-table"><thead><tr><th>${esc(t(locale, 'account.orderNumber'))}</th><th>${esc(t(locale, 'account.date'))}</th><th>${esc(t(locale, 'account.status'))}</th><th>${esc(t(locale, 'account.total'))}</th><th>${esc(t(locale, 'account.shipment'))}</th></tr></thead><tbody>${rows}</tbody></table>`
}

function detailHtml(o, locale) {
  const money = (c) => esc(formatMoney(c, o.currency || 'EUR', locale))
  const items = (o.items || []).map((i) => `<li><span>${esc(i.qty)} × ${esc(i.title)}${i.label ? ` (${esc(i.label)})` : ''}</span><span>${money(i.unitCents * i.qty - (i.discountCents || 0))}</span></li>`).join('')
  const sums = [`<div class="shop-sum"><span>${esc(t(locale, 'account.subtotal'))}</span><span>${money(o.subtotalCents)}</span></div>`]
  if (o.discountCents > 0) sums.push(`<div class="shop-sum"><span>${esc(o.couponCode ? t(locale, 'account.coupon', { code: o.couponCode }) : t(locale, 'account.discount'))}</span><span>-${money(o.discountCents)}</span></div>`)
  sums.push(`<div class="shop-sum"><span>${esc(t(locale, 'account.shipping'))}</span><span>${money(o.shippingCents)}</span></div>`)
  sums.push(`<div class="shop-sum shop-total"><strong>${esc(t(locale, 'account.total'))}</strong><strong>${money(o.totalCents)}</strong></div>`)
  if (o.refundedCents > 0) sums.push(`<div class="shop-sum"><span>${esc(t(locale, 'account.refunded'))}</span><span>${money(o.refundedCents)}</span></div>`)
  for (const [bp, amount] of Object.entries(o.taxBreakdown || {})) {
    sums.push(`<div class="shop-sum shop-hint"><span>${esc(t(locale, 'account.vatIncluded', { rate: (Number(bp) / 100).toLocaleString(locale === 'en' ? 'en-GB' : 'de-DE') }))}</span><span>${money(amount)}</span></div>`)
  }
  const dl = (o.downloads || []).map((d) => {
    const url = apiPath(d.url)
    return url ? `<li><a href="${esc(url)}">${esc(d.filename)}</a> <span class="shop-hint">${esc(t(locale, 'account.downloadsRemaining', { n: d.remaining }))}</span></li>` : ''
  }).join('')
  const inv = apiPath(o.invoiceUrl)
  const track = trackingHtml(o.tracking, locale)
  return `<p><button type="button" class="shop-remove" data-account-back>${esc(t(locale, 'account.back'))}</button></p>
<h3>${esc(o.reference)}</h3>
<p>${esc(fmtDate(o.createdAt, locale))} · ${statusText(locale, o.status)}</p>
<h4>${esc(t(locale, 'account.items'))}</h4><ul class="shop-summary-lines">${items}</ul>
${sums.join('')}
${track ? `<p class="shop-account-tracking">${track}</p>` : ''}
${dl ? `<h4>${esc(t(locale, 'account.downloads'))}</h4><ul class="shop-summary-lines">${dl}</ul>` : ''}
${inv ? `<p><a class="shop-add shop-link-btn" href="${esc(inv)}">${esc(t(locale, 'account.invoice'))}</a></p>` : ''}`
}

function wishlistHtml(items, locale) {
  const body = items.length
    ? `<ul class="shop-account-wishlist">${items.map((i) => `<li><a href="/shop/${encodeURIComponent(i.slug)}">${esc(i.title)}</a>${i.fromPriceCents != null ? ` <span class="shop-price">${esc(t(locale, 'account.fromPrice', { price: formatMoney(i.fromPriceCents, 'EUR', locale) }))}</span>` : ''} <button type="button" class="shop-remove" data-wish-remove="${esc(i.slug)}">${esc(t(locale, 'account.remove'))}</button></li>`).join('')}</ul>`
    : `<p class="shop-empty">${esc(t(locale, 'account.wishlistEmpty'))}</p>`
  return `<h3>${esc(t(locale, 'account.wishlistTitle'))}</h3>${body}`
}

export async function hydrateAccount(el) {
  if (!el) return
  const locale = localeOf(el)
  const msg = (key, cls = 'shop-hint') => { el.innerHTML = `<p class="${cls}">${esc(t(locale, key))}</p>` }
  const loginHtml = () => { el.innerHTML = `<p class="shop-hint">${esc(t(locale, 'account.loginRequired'))}</p><p><a class="shop-add shop-link-btn" href="${esc(loginUrl())}">${esc(t(locale, 'account.loginLink'))}</a></p>` }

  let wish = []
  async function drawWishlist() {
    const box = el.querySelector('[data-account-wishlist]')
    if (!box) return
    try {
      const r = await api(`/api/shop/account/wishlist?lang=${locale}`)
      if (r.ok) { wish = r.body.items || []; box.innerHTML = wishlistHtml(wish, locale) }
    } catch (_) { /* Wunschliste ist optional */ }
  }

  async function drawList() {
    msg('account.loading')
    let r
    try { r = await api('/api/shop/account/orders') } catch (_) { msg('account.error', 'shop-error'); return }
    if (r.status === 401) { loginHtml(); return }
    if (!r.ok) { msg('account.error', 'shop-error'); return }
    el.innerHTML = `<h2>${esc(t(locale, 'account.ordersTitle'))}</h2>${listHtml(r.body.orders || [], locale)}<div data-account-wishlist></div>`
    await drawWishlist()
  }

  async function drawDetail(reference) {
    msg('account.loading')
    let r
    try { r = await api(`/api/shop/account/orders/${encodeURIComponent(reference)}`) } catch (_) { msg('account.error', 'shop-error'); return }
    if (r.status === 401) { loginHtml(); return }
    if (r.status === 404) { el.innerHTML = `<p class="shop-error">${esc(t(locale, 'account.notFound'))}</p><p><button type="button" class="shop-remove" data-account-back>${esc(t(locale, 'account.back'))}</button></p>`; return }
    if (!r.ok || !r.body.order) { msg('account.error', 'shop-error'); return }
    el.innerHTML = detailHtml(r.body.order, locale)
  }

  el.addEventListener('click', async (e) => {
    const target = e.target.closest && e.target.closest('[data-account-open],[data-account-back],[data-wish-remove]')
    if (!target) return
    if (target.hasAttribute('data-account-open')) drawDetail(target.getAttribute('data-account-open'))
    else if (target.hasAttribute('data-account-back')) drawList()
    else {
      try {
        await api(`/api/shop/account/wishlist?productSlug=${encodeURIComponent(target.getAttribute('data-wish-remove'))}`, { method: 'DELETE' })
      } catch (_) { /* Liste wird unten neu geladen */ }
      await drawWishlist()
    }
  })

  await drawList()
}
