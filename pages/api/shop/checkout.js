import { randomBytes } from 'crypto'
import { getServerSession } from 'next-auth/next'
import { prisma } from '../../../lib/prisma'
import { authOptions } from '../auth/[...nextauth]'
import { rateLimit } from '../../../lib/rateLimit'
import { isShopEnabled } from '../../../lib/shop/config'
import { SHOP_ORDER_PREFIX_KEY } from '../../../lib/shop/keys'
import { loadShippingConfig } from '../../../lib/shop/shippingConfig'
import { priceOrder, ShopPricingError } from '../../../lib/shop/pricing'
import { validateCheckoutInput, sanitizeItems, formatReference, normalizePrefix } from '../../../lib/shop/checkout'

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

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const shippingConfig = await loadShippingConfig()
    const { errors, data } = validateCheckoutInput(body, { countries: shippingConfig.countries })
    const items = sanitizeItems(body.items)
    if (items === null) errors.items = 'Ungültiger Warenkorb.'
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: 'Eingabe ungültig', code: 'VALIDATION_ERROR', details: { fields: errors } })
    }

    const formats = items.length
      ? await prisma.shopFormat.findMany({
          where: { sku: { in: items.map((i) => i.sku) }, product: { active: true } },
          include: { product: { select: { title: true } } },
        })
      : []

    let priced
    try {
      priced = priceOrder({ items, formats, shipping: shippingConfig, country: data.shipping.country })
    } catch (e) {
      if (e instanceof ShopPricingError) {
        return res.status(422).json({ error: e.message, code: e.code, details: e.details || {} })
      }
      throw e
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

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.shopOrder.create({
        data: {
          reference: 'TMP-' + randomBytes(8).toString('hex'),
          email: data.email,
          billing: data.billing,
          shipping: data.shipping,
          subtotalCents: priced.subtotalCents,
          shippingCents: priced.shippingCents,
          totalCents: priced.totalCents,
          taxBreakdown: priced.taxBreakdown,
          acceptedTermsAt: now,
          acceptedWaiver: data.acceptWaiver,
          memberId,
          items: {
            create: priced.lines.map((l) => ({
              formatId: l.formatId, sku: l.sku, title: l.title, label: l.label, qty: l.qty,
              unitCents: l.unitCents, taxRateBp: l.taxRateBp, digital: l.digital, weightG: l.weightG ?? null,
            })),
          },
        },
      })
      return tx.shopOrder.update({
        where: { id: created.id },
        data: { reference: formatReference(prefix, now, created.number) },
      })
    })

    return res.status(201).json({ reference: order.reference, totalCents: order.totalCents, status: 'PENDING', payment: null })
  } catch (e) {
    console.error('[/api/shop/checkout Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
