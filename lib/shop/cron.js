import { prisma } from '../prisma'
import { getNumberSetting } from './settingsStore'
import { reconcileOpenPayments } from './payments'
import { releaseExpired, releaseReservations } from './reservations'
import { logOrderEvent } from './events'

const CLEANUP_LIMIT = 200

/** Unbezahlte PENDING-Bestellungen ohne offene Anbieterzahlung stornieren (nie löschen). -> Anzahl. */
export async function cleanupPendingOrders({ now = new Date() } = {}) {
  const days = (await getNumberSetting('shop_pending_cleanup_days', 3)) ?? 3
  const orders = await prisma.shopOrder.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: new Date(now.getTime() - days * 86_400_000) },
      payments: { none: { status: 'PENDING' } },
    },
    select: { id: true },
    take: CLEANUP_LIMIT,
  })
  let cancelled = 0
  for (const { id } of orders) {
    const r = await prisma.shopOrder.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: now },
    })
    if (r.count !== 1) continue
    cancelled++
    await releaseReservations(id)
    await logOrderEvent(id, 'CANCELLED', 'Automatisch storniert (unbezahlt)')
  }
  return cancelled
}

/** Zeitplan-Jobs: Zahlungsabgleich, Reservierungen freigeben, alte unbezahlte Bestellungen stornieren. */
export async function runShopJobs({ now = new Date() } = {}) {
  let reconciled = 0
  try {
    const r = await reconcileOpenPayments({ limit: 50, now })
    reconciled = (r?.paid || 0) + (r?.failed || 0)
  } catch (e) {
    console.error('[shop/cron] Abgleich fehlgeschlagen:', e.message)
  }
  const expiredReservations = await releaseExpired(now)
  const cancelledOrders = await cleanupPendingOrders({ now })
  return { reconciled, expiredReservations, cancelledOrders }
}
