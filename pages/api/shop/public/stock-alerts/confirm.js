import { isShopEnabled } from '../../../../../lib/shop/config'
import { confirmStockAlert } from '../../../../../lib/shop/stockAlerts'

/** Öffentlich: GET /api/shop/public/stock-alerts/confirm?token= - leitet auf /shop?stockalert=confirmed|invalid. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    const done = await confirmStockAlert(req.query?.token)
    res.setHeader('Location', done ? '/shop?stockalert=confirmed' : '/shop?stockalert=invalid')
    return res.status(302).end()
  } catch (e) {
    console.error('[/api/shop/public/stock-alerts/confirm Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
