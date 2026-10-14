import { prisma } from '../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { logAudit } from '../../../lib/audit'
import { requireShopEnabled } from '../../../lib/shop/guard'
import { validateProductInput, toAdminProduct } from '../../../lib/shop/catalog'

const include = { formats: { orderBy: { sortOrder: 'asc' } } }

/** Shop-Produkte: GET Liste (PRODUCTS_VIEW), POST anlegen (PRODUCTS_EDIT). */
export default async function handler(req, res) {
  try {
    const perm = req.method === 'POST' ? PERMISSIONS.SHOP_PRODUCTS_EDIT : PERMISSIONS.SHOP_PRODUCTS_VIEW
    const auth = await requireAuth(req, res, perm)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method === 'GET') {
      const rows = await prisma.shopProduct.findMany({ include, orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }] })
      return res.status(200).json({ products: rows.map(toAdminProduct) })
    }

    if (req.method === 'POST') {
      const { errors, data } = validateProductInput(req.body)
      if (errors.length) {
        return res.status(422).json({ error: 'Eingabe ungültig', code: 'VALIDATION_ERROR', details: { errors } })
      }
      const { formats, ...product } = data
      try {
        const row = await prisma.shopProduct.create({
          data: { ...product, formats: { create: formats.map(({ id, ...f }) => f) } },
          include,
        })
        await logAudit({ action: 'shop.product.create', resource: 'shop-product', resourceId: row.id, userId: auth.user.id, details: { slug: row.slug } })
        return res.status(201).json({ product: toAdminProduct(row) })
      } catch (e) {
        if (e.code === 'P2002') return res.status(409).json({ error: 'Slug oder SKU ist bereits vergeben', code: 'DUPLICATE' })
        throw e
      }
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
  } catch (e) {
    console.error('[/api/shop/products Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
