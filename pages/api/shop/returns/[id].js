import { prisma } from '../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../lib/auth'
import { requireShopEnabled } from '../../../../lib/shop/guard'
import { updateReturnRequest, ReturnError } from '../../../../lib/shop/returns'

async function load(id) {
  const r = await prisma.shopReturnRequest.findUnique({ where: { id }, include: { order: { include: { items: true } } } })
  if (!r) return null
  const stored = Array.isArray(r.items) ? r.items : []
  const lines = stored.length ? stored : r.order.items.map((i) => ({ sku: i.sku, qty: i.qty }))
  const items = lines.map((l) => {
    const oi = r.order.items.find((i) => i.sku === l.sku)
    return { sku: l.sku, qty: l.qty, title: oi?.title ?? null, label: oi?.label ?? null, orderedQty: oi?.qty ?? null }
  })
  const { order, ...rest } = r
  return { ...rest, items, wholeOrder: stored.length === 0, order: { id: order.id, reference: order.reference, status: order.status, email: order.email } }
}

/** Rückgabe-Anfrage: GET Detail, PUT { status?, adminNote? } (SHOP_RETURNS_EDIT). */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_RETURNS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return
    if (req.method !== 'GET' && req.method !== 'PUT') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })

    const id = typeof req.query?.id === 'string' ? req.query.id : ''
    if (req.method === 'PUT') {
      const b = req.body && typeof req.body === 'object' ? req.body : {}
      await updateReturnRequest(id, { status: b.status, adminNote: b.adminNote }, { userId: auth.user?.id })
    }
    const item = await load(id)
    if (!item) return res.status(404).json({ error: 'Anfrage nicht gefunden', code: 'NOT_FOUND' })
    return res.status(200).json({ return: item })
  } catch (e) {
    if (e instanceof ReturnError) {
      return res.status(e.status).json({ error: e.message, code: e.code, ...(e.details ? { details: e.details } : {}) })
    }
    console.error('[/api/shop/returns/[id] Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
