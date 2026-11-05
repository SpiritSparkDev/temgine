import { renderProductList, renderProductDetail, formatPriceCents, unitPriceFor } from '../templates'
import { t } from '../i18n'
import { hydrateCart } from './cartView'
import { hydrateCheckout } from './checkoutView'
import { hydrateOrder } from './orderView'
import { hydrateAccount } from './accountView'
import { hydrateReturn } from './returnView'
import { add, updateCartCounters, watchCartCounters, resolveLocale, fetchConfig } from './cart'

const orderStops = new WeakMap()
const STOCK_ALERTS = ['confirmed', 'removed', 'invalid']
const CSS_FILES = [
  { id: 'temgine-shop-css', href: '/assets/shop/shop.css' },
  { id: 'temgine-shop-account-css', href: '/assets/shop/shop-account.css' },
]

function ensureCss() {
  for (const { id, href } of CSS_FILES) {
    if (document.getElementById(id)) continue
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

// Texte sind reiner Text (nie HTML): über textContent ausgeben.
function showError(el, msg) {
  el.textContent = ''
  const p = document.createElement('p')
  p.className = 'shop-error'
  p.textContent = msg
  el.appendChild(p)
}

/** Sprache und Währung: Seiten-Sprache bzw. Shop-Standard aus /api/shop/public/config. */
async function shopContext() {
  const cfg = await fetchConfig()
  return { locale: resolveLocale(cfg.locale), currency: cfg.currency || 'EUR' }
}

async function hydrateProducts(el, category = '', ctx = null) {
  const c = ctx || await shopContext()
  try {
    const q = `${category ? `?category=${encodeURIComponent(category)}&` : '?'}lang=${c.locale}`
    const data = await getJson(`/api/shop/public/products${q}`)
    el.innerHTML = renderProductList(data, category, c)
    // ?stockalert= wird nur gegen feste Werte geprüft und per textContent ausgegeben.
    const alertKey = STOCK_ALERTS.includes(new URLSearchParams(window.location.search).get('stockalert'))
      ? `shop.stockAlert.${new URLSearchParams(window.location.search).get('stockalert')}` : ''
    if (alertKey) {
      const note = document.createElement('p')
      note.setAttribute('role', 'status')
      note.className = alertKey.endsWith('invalid') ? 'shop-error' : 'shop-success'
      note.textContent = t(c.locale, alertKey)
      el.insertBefore(note, el.firstChild)
    }
    if (!el.dataset.shopBound) {
      el.dataset.shopBound = '1'
      el.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('[data-shop-category]')
        if (btn) hydrateProducts(el, btn.getAttribute('data-shop-category') || '', c)
      })
    }
  } catch (_) {
    showError(el, t(c.locale, 'shop.loadProductsError'))
  }
}

async function hydrateProduct(el) {
  const c = await shopContext()
  const slug = el.getAttribute('data-slug') || ''
  if (!slug) { showError(el, t(c.locale, 'shop.productNotFound')); return }
  let product
  try {
    ;({ product } = await getJson(`/api/shop/public/products/${encodeURIComponent(slug)}?lang=${c.locale}`))
    el.innerHTML = renderProductDetail(product, c)
  } catch (e) {
    showError(el, t(c.locale, e.message === '404' ? 'shop.productNotFound' : 'shop.loadProductError'))
    return
  }
  const select = el.querySelector('[data-shop-format]')
  const priceEl = el.querySelector('[data-shop-price]')
  const qtyEl = el.querySelector('[data-shop-product-qty]')
  const formats = new Map((product.formats || []).map((f) => [f.sku, f]))
  const qty = () => Math.min(99, Math.max(1, Math.floor(Number(qtyEl && qtyEl.value)) || 1))
  // Zeigt Staffel-/Bündelinfo des gewählten Formats und den Stückpreis für die gewählte Menge.
  const update = () => {
    if (!select || !priceEl) return
    const f = formats.get(select.value)
    el.querySelectorAll('[data-shop-info]').forEach((b) => { b.hidden = b.getAttribute('data-shop-info') !== select.value })
    priceEl.textContent = f ? formatPriceCents(unitPriceFor(f, qty()), c.currency, c.locale) : ''
  }
  if (select) select.addEventListener('change', update)
  if (qtyEl) qtyEl.addEventListener('input', update)
  const addBtn = el.querySelector('[data-shop-add]')
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const sku = select ? select.value : ''
      if (!sku || addBtn.disabled) return
      add(sku, qty())
      const note = el.querySelector('[data-shop-added]')
      if (note) note.hidden = false
    })
  }
  const box = el.querySelector('[data-shop-product-extras]')
  if (box) {
    // Fehler im Erweiterungsmodul dürfen die Produktseite nicht beeinträchtigen.
    import('./productExtras')
      .then((m) => m.mountProductExtras(box, { product, locale: c.locale, currency: c.currency }))
      .catch(() => {})
  }
}

/** Füllt alle .shop-block[data-shop] unterhalb von root; aktualisiert außerdem die Warenkorb-Zähler. */
export function hydrateShop(root) {
  if (!root || typeof document === 'undefined') return
  watchCartCounters()
  updateCartCounters(root)
  const blocks = root.querySelectorAll('.shop-block[data-shop]')
  if (!blocks.length) return
  ensureCss()
  blocks.forEach((el) => {
    if (el.dataset.shopHydrated) return
    el.dataset.shopHydrated = '1'
    const kind = el.getAttribute('data-shop')
    if (kind === 'products') hydrateProducts(el)
    else if (kind === 'product') hydrateProduct(el)
    else if (kind === 'cart') hydrateCart(el)
    else if (kind === 'checkout') hydrateCheckout(el)
    else if (kind === 'account') hydrateAccount(el)
    else if (kind === 'return') hydrateReturn(el)
    else if (kind === 'order') {
      const prev = orderStops.get(el)
      if (prev) prev()
      orderStops.set(el, hydrateOrder(el))
    }
  })
}
