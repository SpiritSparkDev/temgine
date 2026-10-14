import { prisma } from '../prisma'
import { SHOP_ENABLED_KEY, SHOP_PROVIDERS, providerEnabledKey } from './keys'
import { ensureShopPages } from './pages'

/** true, wenn das Shop-Add-on in den Einstellungen aktiviert ist. */
export async function isShopEnabled() {
  const s = await prisma.setting.findUnique({ where: { key: SHOP_ENABLED_KEY } })
  return s?.value === 'true'
}

export async function setShopEnabled(on) {
  const value = on ? 'true' : 'false'
  await prisma.setting.upsert({
    where: { key: SHOP_ENABLED_KEY },
    update: { value },
    create: { key: SHOP_ENABLED_KEY, value },
  })
  // Beim Aktivieren die benötigten CMS-Seiten anlegen (idempotent). Ein Fehler hier soll das Aktivieren nicht verhindern.
  if (on) {
    try {
      await ensureShopPages()
    } catch (e) {
      console.error('[shop] Seiten konnten nicht angelegt werden:', e.message)
    }
  }
}

/**
 * Status für die Admin-Oberfläche: Add-on an/aus und je Zahlungsanbieter "aktiviert" / "konfiguriert".
 * Gibt nur Flags zurück, nie Werte von Zugangsdaten.
 */
export async function getShopStatus() {
  const ids = Object.keys(SHOP_PROVIDERS)
  const keys = [SHOP_ENABLED_KEY, ...ids.flatMap((id) => [providerEnabledKey(id), ...SHOP_PROVIDERS[id].requiredKeys])]
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const providers = {}
  for (const id of ids) {
    providers[id] = {
      label: SHOP_PROVIDERS[id].label,
      enabled: map[providerEnabledKey(id)] === 'true',
      configured: SHOP_PROVIDERS[id].requiredKeys.every((k) => !!map[k]),
    }
  }
  return { enabled: map[SHOP_ENABLED_KEY] === 'true', providers }
}
