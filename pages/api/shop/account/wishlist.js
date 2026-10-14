import { prisma } from '../../../../lib/prisma'
import { rateLimit } from '../../../../lib/rateLimit'
import { isShopEnabled } from '../../../../lib/shop/config'
import { getMemberFromRequest, loginRequired } from '../../../../lib/shop/account'
import { isOrderable } from '../../../../lib/shop/catalog'

const MAX_ITEMS = 200
const writeLimiter = rateLimit({ windowMs: 60_000, max: 60, keyFn: (req) => `shop-wishlist:${req.memberId}` })

function view(row, lang) {
  const p = row.product
  const images = Array.isArray(p.images) ? p.images : []
  const prices = p.formats.filter(isOrderable).map((f) => f.priceCents)
  const en = lang === 'en' ? p.translations?.en : null
  return {
    slug: p.slug,
    title: (en && en.title) || p.title,
    image: images[0] || null,
    fromPriceCents: prices.length ? Math.min(...prices) : null,
    createdAt: row.createdAt,
  }
}

/** Mitglied: GET|POST|DELETE /api/shop/account/wishlist (inaktive Produkte werden ausgeblendet). */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    const member = await getMemberFromRequest(req, res)
    if (!member) return loginRequired(res)

    if (req.method === 'GET') {
      const lang = req.query?.lang === 'en' ? 'en' : 'de'
      const rows = await prisma.shopWishlistItem.findMany({
        where: { memberId: member.id, product: { active: true } },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
        select: {
          createdAt: true,
          product: { select: { slug: true, title: true, images: true, translations: true, formats: { select: { priceCents: true, taxRateBp: true, stock: true } } } },
        },
      })
      return res.status(200).json({ items: rows.map((r) => view(r, lang)) })
    }

    const { ok, retryAfter } = writeLimiter.check({ headers: req.headers || {}, memberId: member.id })
    if (!ok) {
      res.setHeader('Retry-After', retryAfter)
      return res.status(429).json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.', code: 'RATE_LIMIT_EXCEEDED', retryAfter })
    }
    const raw = req.method === 'POST' ? req.body?.productSlug : req.query?.productSlug
    const slug = typeof raw === 'string' ? raw.trim() : ''
    if (!slug || slug.length > 80) return res.status(422).json({ error: 'Ungültiges Produkt', code: 'VALIDATION_ERROR' })

    if (req.method === 'POST') {
      const product = await prisma.shopProduct.findUnique({ where: { slug }, select: { id: true, active: true } })
      if (!product || !product.active) return res.status(404).json({ error: 'Produkt nicht gefunden', code: 'NOT_FOUND' })
      const key = { memberId_productId: { memberId: member.id, productId: product.id } }
      const exists = await prisma.shopWishlistItem.findUnique({ where: key, select: { memberId: true } })
      if (!exists) {
        if ((await prisma.shopWishlistItem.count({ where: { memberId: member.id } })) >= MAX_ITEMS) {
          return res.status(422).json({ error: 'Die Wunschliste ist voll (max. 200 Einträge).', code: 'WISHLIST_FULL' })
        }
        await prisma.shopWishlistItem.upsert({ where: key, create: { memberId: member.id, productId: product.id }, update: {} })
      }
      return res.status(200).json({ ok: true })
    }

    // DELETE: idempotent
    await prisma.shopWishlistItem.deleteMany({ where: { memberId: member.id, product: { slug } } })
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[/api/shop/account/wishlist Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
