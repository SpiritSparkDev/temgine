import { isShopEnabled } from '../../../../../lib/shop/config'
import { unsubscribeStockAlert } from '../../../../../lib/shop/stockAlerts'

/** Öffentlich: GET /api/shop/public/stock-alerts/unsubscribe?token= - leitet auf /shop?stockalert=removed|invalid. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    const done = await unsubscribeStockAlert(req.query?.token)
    res.setHeader('Location', done ? '/shop?stockalert=removed' : '/shop?stockalert=invalid')
    return res.status(302).end()
  } catch (e) {
    console.error('[/api/shop/public/stock-alerts/unsubscribe Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
