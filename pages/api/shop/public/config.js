import { isShopEnabled, loadShopSettings } from '../../../../lib/shop/config'
import { listAvailableProviders } from '../../../../lib/shop/providers'
import { loadShippingConfig } from '../../../../lib/shop/shippingConfig'

/** Öffentlich: Währung und lieferbare Länder. GET /api/shop/public/config */
export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })
    if (!(await isShopEnabled())) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' })
    const { countries } = await loadShippingConfig()
    const list = Object.entries(countries).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name, 'de'))
    const paymentProviders = listAvailableProviders(await loadShopSettings())
    return res.status(200).json({ currency: 'EUR', countries: list, paymentProviders })
  } catch (e) {
    console.error('[/api/shop/public/config Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
