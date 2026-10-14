import { prisma } from '../../../../../lib/prisma'
import { isShopEnabled } from '../../../../../lib/shop/config'
import { toPublicProduct } from '../../../../../lib/shop/catalog'

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

    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60')
    return res.status(200).json({ product: toPublicProduct(row) })
  } catch (e) {
    console.error('[/api/shop/public/products/[slug] Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
