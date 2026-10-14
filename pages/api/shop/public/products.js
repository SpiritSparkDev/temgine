import { prisma } from '../../../../lib/prisma'
import { isShopEnabled } from '../../../../lib/shop/config'
import { toPublicProduct, loadPublicContext, localeFromQuery } from '../../../../lib/shop/catalog'

/** Öffentlich: aktive Produkte + Kategorien. GET /api/shop/public/products?category= */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })

    const rows = await prisma.shopProduct.findMany({
      where: { active: true },
      include: { formats: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    })
    const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'))
    const category = typeof req.query.category === 'string' ? req.query.category : ''
    const opts = { locale: localeFromQuery(req.query.lang), relatedRows: rows, ...(await loadPublicContext(prisma, rows)) }
    const products = (category ? rows.filter((r) => r.category === category) : rows).map((r) => toPublicProduct(r, opts))

    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60')
    return res.status(200).json({ products, categories })
  } catch (e) {
    console.error('[/api/shop/public/products Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
