import { prisma } from '../../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../../lib/auth'
import { requireShopEnabled } from '../../../../../lib/shop/guard'
import { logOrderEvent } from '../../../../../lib/shop/events'

/** Interne Notiz zur Bestellung (POST { message }) als Verlaufseintrag NOTE. */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    }

    const raw = req.body && req.body.message
    const message = typeof raw === 'string' ? raw.trim() : ''
    if (!message || message.length > 2000) {
      return res.status(422).json({
        error: 'Die Notiz darf nicht leer und höchstens 2000 Zeichen lang sein',
        code: 'VALIDATION_ERROR',
        details: { errors: ['Notiz: 1 bis 2000 Zeichen'] },
      })
    }

    const { id } = req.query
    const order = await prisma.shopOrder.findUnique({ where: { id }, select: { id: true } })
    if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })

    await logOrderEvent(id, 'NOTE', message, { userId: auth.user.id })
    return res.status(201).json({ ok: true })
  } catch (e) {
    console.error('[/api/shop/orders/[id]/notes Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
