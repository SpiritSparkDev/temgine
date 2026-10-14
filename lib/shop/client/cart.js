const KEY = 'temgine_shop_cart'
export const CART_EVENT = 'temgine:shop-cart-changed'

const clampQty = (q) => Math.min(99, Math.max(1, Math.floor(Number(q)) || 1))

export function load() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((i) => i && typeof i.sku === 'string' && i.sku)
      .map((i) => ({ sku: i.sku, qty: clampQty(i.qty) }))
  } catch (_) {
    return []
  }
}

function save(items) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items.map(({ sku, qty }) => ({ sku, qty }))))
  } catch (_) {
    // Storage nicht verfügbar: Warenkorb bleibt leer
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { count: count(items) } }))
}

export function count(items = load()) {
  return items.reduce((n, i) => n + i.qty, 0)
}

export function add(sku, qty = 1) {
  if (!sku) return load()
  const items = load()
  const hit = items.find((i) => i.sku === sku)
  if (hit) hit.qty = clampQty(hit.qty + qty)
  else items.push({ sku, qty: clampQty(qty) })
  save(items)
  return items
}

export function setQty(sku, qty) {
  const items = load()
  const hit = items.find((i) => i.sku === sku)
  if (!hit) return items
  hit.qty = clampQty(qty)
  save(items)
  return items
}

export function remove(sku) {
  const items = load().filter((i) => i.sku !== sku)
  save(items)
  return items
}

export function clear() {
  save([])
}

/** Setzt den Zähler in allen [data-shop-cart-count]-Elementen. */
export function updateCartCounters(root) {
  const scope = root || document
  const n = String(count())
  scope.querySelectorAll('[data-shop-cart-count]').forEach((el) => { el.textContent = n })
}

let listening = false
export function watchCartCounters() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener(CART_EVENT, () => updateCartCounters(document))
}
