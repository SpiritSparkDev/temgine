import { renderProductList, renderProductDetail } from '../templates'
import { hydrateCart } from './cartView'
import { hydrateCheckout } from './checkoutView'
import { hydrateOrder } from './orderView'
import { add, updateCartCounters, watchCartCounters } from './cart'

const CSS_ID = 'temgine-shop-css'
const CSS_HREF = '/assets/shop/shop.css'

function ensureCss() {
  if (document.getElementById(CSS_ID)) return
  const link = document.createElement('link')
  link.id = CSS_ID
  link.rel = 'stylesheet'
  link.href = CSS_HREF
  document.head.appendChild(link)
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

const errorHtml = (msg) => `<p class="shop-error">${msg}</p>`

async function hydrateProducts(el, category = '') {
  try {
    const q = category ? `?category=${encodeURIComponent(category)}` : ''
    const data = await getJson(`/api/shop/public/products${q}`)
    el.innerHTML = renderProductList(data, category)
    if (!el.dataset.shopBound) {
      el.dataset.shopBound = '1'
      el.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('[data-shop-category]')
        if (btn) hydrateProducts(el, btn.getAttribute('data-shop-category') || '')
      })
    }
  } catch (_) {
    el.innerHTML = errorHtml('Die Produkte konnten nicht geladen werden.')
  }
}

async function hydrateProduct(el) {
  const slug = el.getAttribute('data-slug') || ''
  if (!slug) { el.innerHTML = errorHtml('Produkt nicht gefunden.'); return }
  try {
    const { product } = await getJson(`/api/shop/public/products/${encodeURIComponent(slug)}`)
    el.innerHTML = renderProductDetail(product)
  } catch (e) {
    el.innerHTML = errorHtml(e.message === '404' ? 'Produkt nicht gefunden.' : 'Das Produkt konnte nicht geladen werden.')
    return
  }
  const select = el.querySelector('[data-shop-format]')
  const priceEl = el.querySelector('[data-shop-price]')
  if (select && priceEl) {
    select.addEventListener('change', () => {
      const opt = select.options[select.selectedIndex]
      priceEl.textContent = opt ? opt.getAttribute('data-price') || '' : ''
    })
  }
  const addBtn = el.querySelector('[data-shop-add]')
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const sku = select ? select.value : ''
      if (!sku || addBtn.disabled) return
      add(sku, 1)
      const note = el.querySelector('[data-shop-added]')
      if (note) note.hidden = false
    })
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
    else if (kind === 'order') hydrateOrder(el)
  })
}
