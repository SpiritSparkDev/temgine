// Warenkorb: "Dazu passt" (Paket F2). F1 ruft mountCartExtras(container, { items, locale }) nach dem Rendern des Warenkorbs auf.
import { t } from '../i18n'
import { esc, localeOf, api } from './ui'
import { cardsHtml } from './productExtras'

export async function mountCartExtras(container, { items, skus, locale } = {}) {
  if (!container) return
  const loc = locale || localeOf(container)
  const list = (skus || (items || []).map((i) => i && i.sku)).filter((s) => typeof s === 'string' && s)
  const old = container.querySelector('[data-shop-reco]')
  if (old) old.remove()
  if (!list.length) return
  try {
    const r = await api(`/api/shop/public/recommendations?skus=${list.map(encodeURIComponent).join(',')}&lang=${encodeURIComponent(loc)}`)
    const products = r.ok && Array.isArray(r.body.products) ? r.body.products : []
    if (!products.length) return
    const box = document.createElement('section')
    box.className = 'shop-related'
    box.setAttribute('data-shop-reco', '')
    box.innerHTML = `<h3>${esc(t(loc, 'account.recoTitle'))}</h3>${cardsHtml(products, loc)}`
    container.appendChild(box)
  } catch (_) { /* Empfehlungen sind optional */ }
}
