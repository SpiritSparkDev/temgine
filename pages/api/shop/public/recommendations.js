import { prisma } from '../../../../lib/prisma'
import { isShopEnabled } from '../../../../lib/shop/config'
import { toRecommendation, loadPublicContext, localeFromQuery, SKU_RE } from '../../../../lib/shop/catalog'

const MAX_SKUS = 20
const MAX_RESULTS = 4

/** Öffentlich: „Dazu passt“. GET /api/shop/public/recommendations?skus=A,B&lang=en */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })

    const raw = typeof req.query.skus === 'string' ? req.query.skus : ''
    const skus = [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => SKU_RE.test(s)))].slice(0, MAX_SKUS)

    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60')
    if (!skus.length) return res.status(200).json({ products: [] })

    const include = { formats: { orderBy: { sortOrder: 'asc' } } }
    const [cartFormats, active] = await Promise.all([
      prisma.shopFormat.findMany({ where: { sku: { in: skus } }, select: { sku: true, productId: true } }),
      prisma.shopProduct.findMany({ where: { active: true }, include, orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] }),
    ])

    // Produkte im Warenkorb, in der Reihenfolge der SKUs
    const cartIds = []
    for (const sku of skus) {
      const f = cartFormats.find((x) => x.sku === sku)
      if (f && !cartIds.includes(f.productId)) cartIds.push(f.productId)
    }
    const inCart = new Set(cartIds)
    const picked = []
    const add = (p) => {
      if (p && !inCart.has(p.id) && !picked.includes(p) && picked.length < MAX_RESULTS) picked.push(p)
    }

    // 1. „related“ der Warenkorbprodukte, 2. gleiche Kategorie
    const cartProducts = cartIds.map((id) => active.find((p) => p.id === id)).filter(Boolean)
    for (const cp of cartProducts) {
      for (const slug of Array.isArray(cp.related) ? cp.related : []) add(active.find((p) => p.slug === slug))
    }
    for (const cp of cartProducts) {
      if (cp.category) active.filter((p) => p.category === cp.category).forEach(add)
    }

    const ctx = await loadPublicContext(prisma, picked)
    const opts = { locale: localeFromQuery(req.query.lang), ...ctx }
    return res.status(200).json({ products: picked.map((p) => toRecommendation(p, opts)) })
  } catch (e) {
    console.error('[/api/shop/public/recommendations Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
