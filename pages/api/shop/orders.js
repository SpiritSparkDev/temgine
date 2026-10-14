import { prisma } from '../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { requireShopEnabled } from '../../../lib/shop/guard'

const PAGE_SIZE = 25
const STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'CANCELLED', 'FAILED']

/** Shop-Bestellungen: GET Liste (ORDERS_VIEW) mit ?status=&q=&page=. */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_VIEW)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    }

    const { status, q } = req.query || {}
    const where = {}
    if (status) {
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Ungültiger Status', code: 'VALIDATION_ERROR' })
      where.status = status
    }
    const term = typeof q === 'string' ? q.trim().slice(0, 100) : ''
    if (term) where.OR = [{ reference: { contains: term } }, { email: { contains: term } }]

    const total = await prisma.shopOrder.count({ where })
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const page = Math.min(Math.max(parseInt(req.query?.page, 10) || 1, 1), pages)
    const rows = await prisma.shopOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, reference: true, status: true, email: true, totalCents: true, createdAt: true, paidAt: true },
    })
    return res.status(200).json({ orders: rows, total, page, pages })
  } catch (e) {
    console.error('[/api/shop/orders Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
