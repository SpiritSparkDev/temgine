import { randomBytes } from 'crypto'
import { getServerSession } from 'next-auth/next'
import { prisma } from '../../../lib/prisma'
import { authOptions } from '../auth/[...nextauth]'
import { rateLimit } from '../../../lib/rateLimit'
import { isShopEnabled, loadShopSettings } from '../../../lib/shop/config'
import { listAvailableProviders } from '../../../lib/shop/providers'
import { startPayment, markOrderPaid, onOrderPaid } from '../../../lib/shop/payments'
import { resolveBaseUrl } from '../../../lib/seo'
import { SHOP_ORDER_PREFIX_KEY } from '../../../lib/shop/keys'
import { loadShippingConfig } from '../../../lib/shop/shippingConfig'
import { priceOrder, ShopPricingError } from '../../../lib/shop/pricing'
import { validateCheckoutInput, sanitizeItems, formatReference, normalizePrefix, pickLocale, loadPricingFormats } from '../../../lib/shop/checkout'
import { lookupCoupon, assertCouponCapacity } from '../../../lib/shop/coupons'
import { reservedByOthers, reserveStock, releaseReservations } from '../../../lib/shop/reservations'
import { logOrderEvent } from '../../../lib/shop/events'
import { randomToken } from '../../../lib/shop/tokens'
import { shopCurrency, shopLocale } from '../../../lib/shop/settingsStore'

/** NEXTAUTH_URL (absolut, http/https, ohne Pfad) hat Vorrang vor dem Host-Header, der von außen gesetzt sein kann. */
export function shopBaseUrl(req) {
  try {
    const u = new URL(process.env.NEXTAUTH_URL || '')
    if ((u.protocol === 'https:' || u.protocol === 'http:') && u.pathname === '/' && !u.search && !u.hash) return u.origin
  } catch {}
  return resolveBaseUrl(req)
}

const limiter = rateLimit({ windowMs: 15 * 60_000, max: 10 })

export const config = { api: { bodyParser: { sizeLimit: '32kb' } } }

/** Öffentlich: POST /api/shop/checkout legt eine PENDING-Bestellung an (Preise rechnet allein der Server). */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })

    const { ok, retryAfter } = limiter.check(req)
    if (!ok) {
      res.setHeader('Retry-After', retryAfter)
      return res.status(429).json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.', code: 'RATE_LIMIT_EXCEEDED', retryAfter })
    }

    const settings = await loadShopSettings()
    const providers = listAvailableProviders(settings)
    if (!providers.length) {
      return res.status(409).json({ error: 'Zurzeit ist keine Zahlungsart verfügbar.', code: 'NO_PAYMENT_PROVIDER' })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const shippingConfig = await loadShippingConfig()
    const { errors, data } = validateCheckoutInput(body, { countries: shippingConfig.countries })
    const items = sanitizeItems(body.items)
    // Die Zahlungsart ist nur bei einem Betrag > 0 nötig; der Fehler wird deshalb erst nach der Preisberechnung gemeldet.
    let providerId = null
    let providerError = null
    if (body.provider === undefined || body.provider === null) {
      if (providers.length === 1) providerId = providers[0].id
      else providerError = 'Bitte eine Zahlungsart wählen.'
    } else if (typeof body.provider === 'string' && providers.some((p) => p.id === body.provider)) {
      providerId = body.provider
    } else {
      providerError = 'Bitte eine Zahlungsart wählen.'
    }
    if (items === null) errors.items = 'Ungültiger Warenkorb.'
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: 'Eingabe ungültig', code: 'VALIDATION_ERROR', details: { fields: errors } })
    }

    // Preise, Rabatt und Versand rechnet allein der Server; vom Client kommen nur SKU, Menge und der Gutscheincode.
    const currency = shopCurrency(settings)
    const locale = pickLocale(body.locale, shopLocale(settings))
    let priced
    let coupon = null
    try {
      const formats = items.length ? await loadPricingFormats(prisma, items.map((i) => i.sku)) : []
      coupon = await lookupCoupon(body.coupon)
      await assertCouponCapacity(prisma, coupon)
      const reserved = await reservedByOthers(formats.map((f) => f.id), {})
      priced = priceOrder({ items, formats, shipping: shippingConfig, country: data.shipping.country, coupon, reserved, currency })
    } catch (e) {
      if (e instanceof ShopPricingError) {
        return res.status(422).json({ error: e.message, code: e.code, details: e.details || {} })
      }
      throw e
    }

    if (providerError && priced.totalCents > 0) {
      return res.status(422).json({ error: 'Eingabe ungültig', code: 'VALIDATION_ERROR', details: { fields: { provider: providerError } } })
    }

    if (priced.lines.some((l) => l.digital) && !data.acceptWaiver) {
      return res.status(422).json({
        error: 'Eingabe ungültig',
        code: 'VALIDATION_ERROR',
        details: { fields: { acceptWaiver: 'Bitte das vorzeitige Erlöschen des Widerrufsrechts bestätigen.' } },
      })
    }

    // Optionale Mitglieder-Verknüpfung: nur bei Mitglieds-Session, jeder Fehler = Gast
    let memberId = null
    try {
      const session = await getServerSession(req, res, authOptions)
      if (session?.user?.accountType === 'member' && session.user.id) {
        const member = await prisma.member.findUnique({ where: { id: session.user.id }, select: { id: true } })
        memberId = member ? member.id : null
      }
    } catch {
      memberId = null
    }

    const prefixRow = await prisma.setting.findUnique({ where: { key: SHOP_ORDER_PREFIX_KEY } })
    const prefix = normalizePrefix(prefixRow?.value)
    const now = new Date()
    const accessToken = randomToken(24)

    let order
    try {
      order = await prisma.$transaction(async (tx) => {
        const created = await tx.shopOrder.create({
          data: {
            reference: 'TMP-' + randomBytes(8).toString('hex'),
            email: data.email,
            billing: data.billing,
            shipping: data.shipping,
            subtotalCents: priced.subtotalCents,
            shippingCents: priced.shippingCents,
            shippingTaxBp: priced.shippingTaxBp,
            discountCents: priced.discountCents,
            couponCode: priced.coupon?.code ?? null,
            totalCents: priced.totalCents,
            currency,
            locale,
            accessToken,
            taxBreakdown: priced.taxBreakdown,
            acceptedTermsAt: now,
            acceptedWaiver: data.acceptWaiver,
            memberId,
            items: {
              create: priced.lines.map((l) => ({
                formatId: l.formatId, sku: l.sku, title: l.title, label: l.label, qty: l.qty,
                unitCents: l.unitCents, taxRateBp: l.taxRateBp, digital: l.digital, weightG: l.weightG ?? null,
                discountCents: l.discountCents, bundleItems: l.bundle ?? undefined,
              })),
            },
          },
        })
        const finalOrder = await tx.shopOrder.update({
          where: { id: created.id },
          data: { reference: formatReference(prefix, now, created.number) },
        })
        await reserveStock(tx, { orderId: created.id, lines: priced.lines, now })
        await logOrderEvent(created.id, 'CREATED', `Bestellung ${finalOrder.reference} angelegt`, { client: tx })
        return finalOrder
      })
    } catch (e) {
      // Bestand in der Transaktion (Zeilensperre) nicht mehr gedeckt: alles zurückgerollt
      if (e instanceof ShopPricingError) return res.status(422).json({ error: e.message, code: e.code, details: e.details || {} })
      throw e
    }

    const base = shopBaseUrl(req)
    const statusUrl = `${base}/bestellung?ref=${encodeURIComponent(order.reference)}&t=${accessToken}`

    // Nichts zu zahlen (z. B. 100-%-Gutschein): kein Anbieter, Bestellung direkt auf PAID
    if (order.totalCents === 0) {
      if (await markOrderPaid(order.id)) await onOrderPaid({ ...order, status: 'PAID' })
      return res.status(201).json({ reference: order.reference, totalCents: 0, status: 'PAID', accessToken, paid: true, redirectUrl: statusUrl })
    }

    let payment
    try {
      payment = await startPayment({
        order: { ...order, currency: order.currency || currency, email: data.email, items: priced.lines },
        providerId,
        urls: {
          returnUrl: statusUrl,
          cancelUrl: `${base}/kasse`,
          webhookUrl: `${base}/api/shop/webhooks/${providerId}`,
        },
      })
    } catch (e) {
      console.error('[/api/shop/checkout] Zahlung konnte nicht gestartet werden:', order.reference, e.message)
      const failed = await prisma.shopOrder.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } }).catch(() => ({ count: 0 }))
      if (failed.count) {
        await releaseReservations(order.id).catch(() => {})
        await logOrderEvent(order.id, 'FAILED', 'Zahlung konnte nicht gestartet werden')
      }
      return res.status(502).json({ error: 'Die Zahlung konnte nicht gestartet werden. Bitte später erneut versuchen.', code: 'PAYMENT_UNAVAILABLE' })
    }

    return res.status(201).json({ reference: order.reference, totalCents: order.totalCents, status: 'PENDING', accessToken, payment })
  } catch (e) {
    console.error('[/api/shop/checkout Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
