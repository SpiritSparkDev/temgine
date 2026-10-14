import { renderCart, buildCartView } from '../templates'
import { load, setQty, remove } from './cart'

export async function loadCartData(items, country = '') {
  const q = items.map((i) => `${encodeURIComponent(i.sku)}:${i.qty}`).join(',')
  const url = `/api/shop/cart?items=${q}${country ? `&country=${encodeURIComponent(country)}` : ''}`
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || 'Der Warenkorb konnte nicht geladen werden.')
    err.status = res.status
    err.sku = body.details && body.details.sku
    throw err
  }
  return body
}

export async function hydrateCart(el) {
  const draw = async () => {
    const items = load()
    if (!items.length) { el.innerHTML = renderCart(buildCartView(null, [])); return }
    try {
      el.innerHTML = renderCart(buildCartView(await loadCartData(items)))
    } catch (e) {
      el.innerHTML = renderCart(buildCartView(null, items, e.sku || '', e.sku ? e.message : 'Der Warenkorb konnte nicht geladen werden.'))
    }
  }
  el.addEventListener('change', (e) => {
    const sku = e.target.getAttribute && e.target.getAttribute('data-shop-qty')
    if (sku) { setQty(sku, e.target.value); draw() }
  })
  el.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('[data-shop-remove]')
    if (btn) { remove(btn.getAttribute('data-shop-remove')); draw() }
  })
  await draw()
}
