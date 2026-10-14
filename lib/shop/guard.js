import { isShopEnabled } from './config'

/** true, wenn das Add-on aktiv ist; sonst wird 403 ADDON_DISABLED gesendet und false zurückgegeben. */
export async function requireShopEnabled(res) {
  if (await isShopEnabled()) return true
  res.status(403).json({ error: 'Add-on Shop nicht aktiviert', code: 'ADDON_DISABLED' })
  return false
}
