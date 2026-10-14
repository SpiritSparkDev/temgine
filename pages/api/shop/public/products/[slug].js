import { prisma } from '../../../../../lib/prisma'
import { isShopEnabled } from '../../../../../lib/shop/config'
import { toPublicProduct, loadPublicContext, localeFromQuery } from '../../../../../lib/shop/catalog'

/** Öffentlich: ein aktives Produkt. GET /api/shop/public/products/[slug] */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })

    const row = await prisma.shopProduct.findFirst({
      where: { slug: req.query.slug, active: true },
      include: { formats: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!row) return res.status(404).json({ error: 'Produkt nicht gefunden', code: 'NOT_FOUND' })

    const slugs = Array.isArray(row.related) ? row.related.filter((s) => typeof s === 'string') : []
    const relatedRows = slugs.length
      ? await prisma.shopProduct.findMany({ where: { slug: { in: slugs }, active: true }, include: { formats: { orderBy: { sortOrder: 'asc' } } } })
      : []
    const ctx = await loadPublicContext(prisma, [row, ...relatedRows])
    const product = toPublicProduct(row, { locale: localeFromQuery(req.query.lang), relatedRows, ...ctx })

    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60')
    return res.status(200).json({ product })
  } catch (e) {
    console.error('[/api/shop/public/products/[slug] Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
