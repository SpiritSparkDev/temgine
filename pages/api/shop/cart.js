import { prisma } from '../../../lib/prisma'
import { isShopEnabled } from '../../../lib/shop/config'
import { loadShippingConfig } from '../../../lib/shop/shippingConfig'
import { priceCart, quoteShipping, completeOrder, ShopPricingError } from '../../../lib/shop/pricing'
import { lookupCoupon } from '../../../lib/shop/coupons'
import { loadPricingFormats } from '../../../lib/shop/checkout'
import { reservedByOthers } from '../../../lib/shop/reservations'
import { loadShopSettings } from '../../../lib/shop/config'
import { shopCurrency } from '../../../lib/shop/settingsStore'

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
      const formats = await loadPricingFormats(prisma, items.map((i) => i.sku))
      const coupon = await lookupCoupon(req.query.coupon)
      const reserved = await reservedByOthers(formats.map((f) => f.id), { excludeOrderId: undefined })
      const cart = priceCart({ items, formats, reserved, coupon })
      const currency = shopCurrency(await loadShopSettings())
      const shipping = await loadShippingConfig()
      const country = typeof req.query.country === 'string' ? req.query.country.toUpperCase() : ''
      const afterDiscount = cart.subtotalCents - cart.discountCents
      const out = {
        lines: cart.lines.map(({ formatId, weightG, bundle, ...l }) => ({
          ...l,
          bundle: bundle ? bundle.map((b) => ({ sku: b.sku, title: b.title, label: b.label, qty: b.qty })) : null,
        })),
        subtotalCents: cart.subtotalCents,
        discountCents: cart.discountCents,
        coupon: cart.coupon,
        taxBreakdown: cart.taxBreakdown,
        shippingCents: null,
        shippingTaxBp: null,
        totalCents: null,
        currency,
        freeShipping: null,
      }
      const from = shipping.freeShippingFromCents ?? null
      if (from != null && cart.hasPhysical) out.freeShipping = { fromCents: from, remainingCents: Math.max(0, from - afterDiscount) }
      let quote = null
      if (!cart.hasPhysical) quote = { shippingCents: 0, shippingTaxBp: null, freeShipping: false }
      else if (country) {
        try {
          quote = quoteShipping(cart.lines, shipping, country, afterDiscount)
        } catch (e) {
          if (!(e instanceof ShopPricingError)) throw e
          out.shippingError = { code: e.code, message: e.message }
        }
      }
      if (quote) {
        const full = completeOrder(cart, quote, currency)
        out.shippingCents = full.shippingCents
        out.shippingTaxBp = full.shippingTaxBp
        out.taxBreakdown = full.taxBreakdown
        out.totalCents = full.totalCents
      }
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
