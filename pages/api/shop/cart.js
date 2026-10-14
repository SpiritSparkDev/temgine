import { prisma } from '../../../lib/prisma'
import { isShopEnabled } from '../../../lib/shop/config'
import { loadShippingConfig } from '../../../lib/shop/shippingConfig'
import { priceCart, priceShipping, ShopPricingError } from '../../../lib/shop/pricing'

const MAX_ITEMS = 50

function decode(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** "SKU:qty,SKU:qty" -> [{ sku, qty }] (wirft ShopPricingError) */
function parseItems(raw) {
  const parts = (typeof raw === 'string' ? raw : '').split(',').filter((p) => p !== '')
  if (parts.length === 0) throw new ShopPricingError('CART_EMPTY', 'Warenkorb ist leer.')
  if (parts.length > MAX_ITEMS) throw new ShopPricingError('CART_TOO_LARGE', `Maximal ${MAX_ITEMS} Positionen.`)
  return parts.map((p) => {
    const i = p.lastIndexOf(':')
    const sku = decode(i < 0 ? p : p.slice(0, i))
    const q = i < 0 ? '' : p.slice(i + 1)
    if (!/^\d+$/.test(q)) throw new ShopPricingError('QTY_INVALID', `Ungültige Menge für ${sku}.`, { sku })
    return { sku, qty: Number(q) }
  })
}

/** Öffentlich: Warenkorb berechnen. GET /api/shop/cart?items=SKU:qty,...&country=DE */
export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })

    try {
      const items = parseItems(req.query.items)
      const formats = await prisma.shopFormat.findMany({
        where: { sku: { in: items.map((i) => i.sku) }, product: { active: true } },
        include: { product: { select: { title: true, active: true } } },
      })
      const cart = priceCart({ items, formats })
      const country = typeof req.query.country === 'string' ? req.query.country.toUpperCase() : ''
      const out = {
        lines: cart.lines.map(({ formatId, weightG, ...l }) => l),
        subtotalCents: cart.subtotalCents,
        taxBreakdown: cart.taxBreakdown,
        shippingCents: null,
        totalCents: null,
      }
      if (!cart.hasPhysical) out.shippingCents = 0
      else if (country) {
        try {
          out.shippingCents = priceShipping(cart.lines, await loadShippingConfig(), country)
        } catch (e) {
          if (!(e instanceof ShopPricingError)) throw e
          out.shippingError = { code: e.code, message: e.message }
        }
      }
      if (out.shippingCents !== null) out.totalCents = cart.subtotalCents + out.shippingCents
      return res.status(200).json(out)
    } catch (e) {
      if (!(e instanceof ShopPricingError)) throw e
      return res.status(422).json({ error: e.message, code: e.code, details: e.details })
    }
  } catch (e) {
    console.error('[/api/shop/cart Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
