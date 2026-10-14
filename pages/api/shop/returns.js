import { prisma } from '../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../lib/auth'
import { requireShopEnabled } from '../../../lib/shop/guard'

const PAGE_SIZE = 25
const STATUSES = ['NEW', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED']

/** Rückgabe-Anfragen: GET Liste (SHOP_RETURNS_EDIT) mit ?status=&page=. */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_RETURNS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })

    const { status } = req.query || {}
    const where = {}
    if (status) {
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Ungültiger Status', code: 'VALIDATION_ERROR' })
      where.status = status
    }
    const total = await prisma.shopReturnRequest.count({ where })
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const page = Math.min(Math.max(parseInt(req.query?.page, 10) || 1, 1), pages)
    const rows = await prisma.shopReturnRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { order: { select: { reference: true } } },
    })
    const returns = rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      reference: r.order?.reference ?? null,
      email: r.email,
      status: r.status,
      createdAt: r.createdAt,
      reasonExcerpt: String(r.reason || '').slice(0, 120),
    }))
    return res.status(200).json({ returns, total, page, pages })
  } catch (e) {
    console.error('[/api/shop/returns Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
