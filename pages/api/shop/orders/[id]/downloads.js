import { prisma } from '../../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../../lib/auth'
import { logAudit } from '../../../../../lib/audit'
import { requireShopEnabled } from '../../../../../lib/shop/guard'
import { logOrderEvent } from '../../../../../lib/shop/events'
import { resetDownloads, listDownloadsForOrder } from '../../../../../lib/shop/downloads'
import { sendDownloadsMail } from '../../../../../lib/shop/orderMails'

/** POST { action: 'reset' | 'resend' }: Download-Zähler/Ablauf zurücksetzen bzw. Links erneut mailen. */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_EDIT)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return
    if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })

    const action = req.body && req.body.action
    if (action !== 'reset' && action !== 'resend') {
      return res.status(422).json({ error: 'Ungültige Aktion', code: 'VALIDATION_ERROR' })
    }
    const { id } = req.query
    const order = await prisma.shopOrder.findUnique({ where: { id } })
    if (!order) return res.status(404).json({ error: 'Bestellung nicht gefunden', code: 'NOT_FOUND' })

    if (action === 'reset') {
      const count = await resetDownloads(id)
      await logOrderEvent(id, 'DOWNLOAD', `Downloads zurückgesetzt (${count})`, { userId: auth.user.id })
      await logAudit({ action: 'shop.download.reset', resource: 'shop-order', resourceId: id, userId: auth.user.id, details: { reference: order.reference, count } })
      return res.status(200).json({ ok: true, count })
    }

    const links = await listDownloadsForOrder(id)
    if (!links.length) return res.status(409).json({ error: 'Keine Downloads für diese Bestellung vorhanden', code: 'NO_DOWNLOADS' })
    let mailError = false
    try {
      await sendDownloadsMail(order, links)
      await logOrderEvent(id, 'MAIL', 'Download-Links erneut gesendet', { userId: auth.user.id })
    } catch (e) {
      mailError = true
      console.error(`[shop/downloads] Mail ${order.reference} fehlgeschlagen: ${e.message}`)
      await logOrderEvent(id, 'MAIL_ERROR', 'Download-Mail konnte nicht gesendet werden', { userId: auth.user.id })
    }
    return res.status(200).json({ ok: !mailError, count: links.length, mailError })
  } catch (e) {
    console.error('[/api/shop/orders/[id]/downloads Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
