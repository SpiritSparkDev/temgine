import { prisma } from '../prisma'
import { getSetting, numberFrom } from './settingsStore'
import { sendLowStockMail } from './orderMails'

/**
 * Meldet Formate, deren Bestand die Schwelle (shop_low_stock_threshold) NEU unterschreitet.
 * changes: [{ formatId, sku, before, after }]. Gibt die Anzahl benachrichtigter Formate zurück; Fehler werden nur geloggt.
 */
export async function notifyLowStock(changes) {
  try {
    const threshold = numberFrom(await getSetting('shop_low_stock_threshold', null), null)
    if (threshold === null || !Array.isArray(changes)) return 0
    const hit = changes.filter((c) => c && c.formatId && Number.isFinite(c.before) && Number.isFinite(c.after) && c.before > threshold && c.after <= threshold)
    if (!hit.length) return 0
    const formats = await prisma.shopFormat.findMany({
      where: { id: { in: hit.map((c) => c.formatId) } },
      select: { id: true, sku: true, label: true, product: { select: { title: true } } },
    })
    const byId = new Map(formats.map((f) => [f.id, f]))
    const items = hit
      .filter((c) => byId.has(c.formatId))
      .map((c) => {
        const f = byId.get(c.formatId)
        return { sku: f.sku, label: f.label, title: f.product?.title || '', stock: c.after, threshold }
      })
    if (!items.length) return 0
    await sendLowStockMail(items)
    return items.length
  } catch (e) {
    console.error('[notifyLowStock Error]', e.message)
    return 0
  }
}
