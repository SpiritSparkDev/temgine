import { prisma } from '../../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../../lib/auth'
import { requireShopEnabled } from '../../../../../lib/shop/guard'
import { issueInvoice, buildInvoicePdf, INVOICE_STATUSES } from '../../../../../lib/shop/invoice'

/** Admin: GET /api/shop/orders/<id>/invoice - Rechnungs-PDF (wird bei Bedarf ausgestellt). */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_VIEW)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })

    const id = typeof req.query?.id === 'string' ? req.query.id : ''
    const order = id ? await prisma.shopOrder.findUnique({ where: { id }, select: { id: true, status: true } }) : null
    if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })
    if (!INVOICE_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: 'Für unbezahlte Bestellungen gibt es keine Rechnung', code: 'NOT_PAID' })
    }
    const invoice = await issueInvoice(order.id)
    const pdf = invoice ? await buildInvoicePdf(order.id) : null
    if (!pdf) return res.status(409).json({ error: 'Rechnung nicht verfügbar', code: 'NOT_PAID' })

    const name = `Rechnung-${invoice.number.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${name}"`)
    res.setHeader('Content-Length', pdf.length)
    return res.status(200).send(pdf)
  } catch (e) {
    console.error('[/api/shop/orders/[id]/invoice Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
