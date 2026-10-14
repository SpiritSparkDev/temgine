import { prisma } from '../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../lib/auth'
import { logAudit } from '../../../../lib/audit'
import { requireShopEnabled } from '../../../../lib/shop/guard'
import { notifyRestock } from '../../../../lib/shop/stockAlerts'
import { validateProductInput, toAdminProduct, loadLookup } from '../../../../lib/shop/catalog'

const include = { formats: { orderBy: { sortOrder: 'asc' } } }
const iso = (d) => (d instanceof Date ? d.toISOString() : d)

/** Shop-Produkt: GET (PRODUCTS_VIEW), PUT voller Ersatz inkl. Formate (PRODUCTS_EDIT). */
export default async function handler(req, res) {
  try {
    const perm = req.method === 'PUT' ? PERMISSIONS.SHOP_PRODUCTS_EDIT : PERMISSIONS.SHOP_PRODUCTS_VIEW
    const auth = await requireAuth(req, res, perm)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    const { id } = req.query

    if (req.method === 'GET') {
      const row = await prisma.shopProduct.findUnique({ where: { id }, include })
      if (!row) return res.status(404).json({ error: 'Produkt nicht gefunden', code: 'NOT_FOUND' })
      return res.status(200).json({ product: toAdminProduct(row) })
    }

    if (req.method === 'PUT') {
      const { errors, data } = validateProductInput(req.body, await loadLookup(prisma, req.body))
      if (!req.body?.updatedAt) errors.push('updatedAt ist erforderlich')
      if (errors.length) {
        return res.status(422).json({ error: 'Eingabe ungültig', code: 'VALIDATION_ERROR', details: { errors } })
      }
      const { formats, ...product } = data

      const restocked = []
      try {
        const row = await prisma.$transaction(async (tx) => {
          const current = await tx.shopProduct.findUnique({ where: { id }, include: { formats: true } })
          if (!current) throw { shop: 404 }
          if (iso(current.updatedAt) !== req.body.updatedAt) throw { shop: 409 }

          const known = new Set(current.formats.map((f) => f.id))
          if (formats.some((f) => f.id && !known.has(f.id))) throw { shop: 422 }
          for (const f of formats) {
            const prev = f.id && current.formats.find((x) => x.id === f.id)
            if (prev && prev.stock !== null && prev.stock !== undefined && prev.stock <= 0 && f.stock > 0) restocked.push(f.id)
          }
          const keep = new Set(formats.filter((f) => f.id).map((f) => f.id))
          const drop = current.formats.filter((f) => !keep.has(f.id)).map((f) => f.id)
          if (drop.length) await tx.shopFormat.deleteMany({ where: { id: { in: drop } } })

          await tx.shopProduct.update({ where: { id }, data: product })
          for (const { id: fid, ...f } of formats) {
            if (fid) await tx.shopFormat.update({ where: { id: fid }, data: f })
            else await tx.shopFormat.create({ data: { ...f, productId: id } })
          }
          return tx.shopProduct.findUnique({ where: { id }, include })
        })
        if (restocked.length) {
          try {
            await notifyRestock(restocked)
          } catch (err) {
            console.error('[/api/shop/products/[id] notifyRestock]', err.message)
          }
        }
        await logAudit({ action: 'shop.product.update', resource: 'shop-product', resourceId: id, userId: auth.user.id, details: { slug: row.slug } })
        return res.status(200).json({ product: toAdminProduct(row) })
      } catch (e) {
        if (e?.shop === 404) return res.status(404).json({ error: 'Produkt nicht gefunden', code: 'NOT_FOUND' })
        if (e?.shop === 409) return res.status(409).json({ error: 'Das Produkt wurde inzwischen geändert. Bitte neu laden.', code: 'CONFLICT' })
        if (e?.shop === 422) {
          return res.status(422).json({ error: 'Eingabe ungültig', code: 'VALIDATION_ERROR', details: { errors: ['Unbekanntes Format im Produkt'] } })
        }
        if (e?.code === 'P2002') return res.status(409).json({ error: 'Slug oder SKU ist bereits vergeben', code: 'DUPLICATE' })
        throw e
      }
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
  } catch (e) {
    console.error('[/api/shop/products/[id] Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
