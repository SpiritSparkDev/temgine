import { prisma } from '../../../../../../lib/prisma'
import { isShopEnabled } from '../../../../../../lib/shop/config'
import { getMemberFromRequest, loginRequired } from '../../../../../../lib/shop/account'
import { issueInvoice, buildInvoicePdf } from '../../../../../../lib/shop/invoice'

/** Mitglied: GET /api/shop/account/orders/<reference>/invoice - Rechnung als PDF (nur eigene, bezahlte Bestellung). */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    const member = await getMemberFromRequest(req, res)
    if (!member) return loginRequired(res)
    const reference = typeof req.query?.reference === 'string' ? req.query.reference : ''
    const o = reference && reference.length <= 60
      ? await prisma.shopOrder.findUnique({ where: { reference }, select: { id: true, reference: true, status: true, memberId: true } })
      : null
    if (!o || o.memberId !== member.id) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })
    if (!['PAID', 'SHIPPED', 'REFUNDED'].includes(o.status)) {
      return res.status(409).json({ error: 'Für diese Bestellung gibt es keine Rechnung.', code: 'INVOICE_UNAVAILABLE' })
    }
    await issueInvoice(o.id)
    const pdf = await buildInvoicePdf(o.id)
    if (!pdf) return res.status(404).json({ error: 'Rechnung nicht verfügbar', code: 'NOT_FOUND' })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="Rechnung-${o.reference.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return res.status(200).send(pdf)
  } catch (e) {
    console.error('[/api/shop/account/orders/invoice Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
