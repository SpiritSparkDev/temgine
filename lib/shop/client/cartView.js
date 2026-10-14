import { renderCart, buildCartView } from '../templates'
import { t } from '../i18n'
import { load, setQty, remove, getCoupon, setCoupon, resolveLocale, fetchConfig } from './cart'

export async function loadCartData(items, country = '', coupon = '') {
  const q = items.map((i) => `${encodeURIComponent(i.sku)}:${i.qty}`).join(',')
  let url = `/api/shop/cart?items=${q}`
  if (country) url += `&country=${encodeURIComponent(country)}`
  if (coupon) url += `&coupon=${encodeURIComponent(coupon)}`
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || t(resolveLocale(''), 'shop.cart.loadError'))
    err.status = res.status
    err.code = body.code || ''
    err.sku = body.details && body.details.sku
    throw err
  }
  return body
}

/** Verständliche Meldung zu einem COUPON_*-Fehlercode. */
export function couponErrorText(locale, code) {
  const key = `shop.coupon.${code}`
  const text = t(locale, key)
  return text === key ? t(locale, 'shop.coupon.error') : text
}

/**
 * Lädt den Warenkorb mit dem gemerkten Gutschein. Lehnt der Server den Gutschein ab (COUPON_*),
 * wird er vergessen, der Warenkorb ohne ihn geladen und die Meldung als couponError zurückgegeben.
 */
export async function loadCartWithCoupon(items, country, locale) {
  const code = getCoupon()
  try {
    return { data: await loadCartData(items, country, code), couponError: '' }
  } catch (e) {
    if (code && /^COUPON_/.test(e.code || '')) {
      setCoupon('')
      return { data: await loadCartData(items, country), couponError: couponErrorText(locale, e.code) }
    }
    throw e
  }
}

export async function hydrateCart(el) {
  let cfg = null
  const draw = async () => {
    const items = load()
    if (!items.length) { el.innerHTML = renderCart(buildCartView(null, []), { locale: resolveLocale('') }); return }
    if (!cfg) cfg = await fetchConfig()
    const locale = resolveLocale(cfg.locale)
    const opts = { locale, currency: cfg.currency }
    try {
      const { data, couponError } = await loadCartWithCoupon(items, '', locale)
      el.innerHTML = renderCart(buildCartView(data, [], '', '', { ...opts, couponMessage: couponError }), opts)
    } catch (e) {
      el.innerHTML = renderCart(buildCartView(null, items, e.sku || '', e.sku ? e.message : t(locale, 'shop.cart.loadError'), opts), opts)
    }
    const box = el.querySelector('[data-shop-cart-extras]')
    if (box) {
      // Fehler im Erweiterungsmodul dürfen den Warenkorb nicht beeinträchtigen.
      import('./cartExtras')
        .then((m) => m.mountCartExtras(box, { items, skus: items.map((i) => i.sku), locale }))
        .catch(() => {})
    }
  }
  const applyCoupon = () => {
    const input = el.querySelector('[data-shop-coupon-input]')
    const code = input ? input.value.trim().toUpperCase() : ''
    if (!code) return
    setCoupon(code)
    draw()
  }
  el.addEventListener('change', (e) => {
    const sku = e.target.getAttribute && e.target.getAttribute('data-shop-qty')
    if (sku) { setQty(sku, e.target.value); draw() }
  })
  el.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('[data-shop-remove]')
    if (btn) { remove(btn.getAttribute('data-shop-remove')); draw(); return }
    if (e.target.closest && e.target.closest('[data-shop-coupon-apply]')) applyCoupon()
    else if (e.target.closest && e.target.closest('[data-shop-coupon-remove]')) { setCoupon(''); draw() }
  })
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-shop-coupon-input]')) { e.preventDefault(); applyCoupon() }
  })
  await draw()
}
