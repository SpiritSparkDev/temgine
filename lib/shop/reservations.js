import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { getNumberSetting } from './settingsStore'
import { ShopPricingError } from './pricing'

/** Reservierungsdauer in Minuten (Einstellung shop_reservation_minutes, Standard 30, Bereich 1–1440). */
export async function reservationMinutes() {
  const n = await getNumberSetting('shop_reservation_minutes', 30)
  return n >= 1 && n <= 1440 ? n : 30
}

/** Summe der aktiven, nicht abgelaufenen Reservierungen fremder Bestellungen je Format -> Map<formatId, qty>. */
export async function reservedByOthers(formatIds, { excludeOrderId, now = new Date() } = {}) {
  const map = new Map()
  const ids = [...new Set(formatIds || [])]
  if (!ids.length) return map
  const rows = await prisma.shopReservation.findMany({
    where: {
      formatId: { in: ids },
      status: 'ACTIVE',
      expiresAt: { gt: now },
      ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
    },
    select: { formatId: true, qty: true },
  })
  for (const r of rows) map.set(r.formatId, (map.get(r.formatId) || 0) + r.qty)
  return map
}

/**
 * Legt Reservierungen an (nur nicht-digitale, bestandsgeführte Formate; Bündel -> Bestandteile).
 * `client` muss eine Transaktion sein: die Formatzeilen werden gesperrt (FOR UPDATE, nach id sortiert gegen Deadlocks),
 * danach muss die Summe aller aktiven, nicht abgelaufenen Reservierungen (inkl. eigener) den Bestand decken,
 * sonst ShopPricingError STOCK_EXCEEDED (die Transaktion des Aufrufers rollt zurück).
 */
export async function reserveStock(client, { orderId, lines, now = new Date() }) {
  const wanted = new Map()
  const add = (formatId, qty, digital) => {
    if (!formatId || digital || !(qty > 0)) return
    wanted.set(formatId, (wanted.get(formatId) || 0) + qty)
  }
  for (const line of lines || []) {
    if (Array.isArray(line.bundle) && line.bundle.length) {
      for (const b of line.bundle) add(b.formatId, b.qty * line.qty, b.digital)
    } else {
      add(line.formatId, line.qty, line.digital)
    }
  }
  if (!wanted.size) return []
  const ids = [...wanted.keys()].sort()
  // Zeilensperre serialisiert parallele Checkouts je Format; der Bestand wird erst nach der Sperre gelesen.
  const locked = await client.$queryRaw`SELECT "id", "stock", "digital" FROM "ShopFormat" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`
  const tracked = locked.filter((f) => f.stock != null && !f.digital)
  const expiresAt = new Date(now.getTime() + (await reservationMinutes()) * 60_000)
  const created = []
  for (const f of tracked) {
    created.push(await client.shopReservation.create({
      data: { orderId, formatId: f.id, qty: wanted.get(f.id), status: 'ACTIVE', expiresAt },
    }))
    const sum = await client.shopReservation.aggregate({
      where: { formatId: f.id, status: 'ACTIVE', expiresAt: { gt: now } },
      _sum: { qty: true },
    })
    if ((sum._sum.qty || 0) > f.stock) {
      throw new ShopPricingError('STOCK_EXCEEDED', 'Nicht genug Bestand.', { formatId: f.id })
    }
  }
  return created
}

async function setStatus(orderId, status) {
  const r = await prisma.shopReservation.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { status } })
  return r.count
}

export const consumeReservations = (orderId) => setStatus(orderId, 'CONSUMED')
export const releaseReservations = (orderId) => setStatus(orderId, 'RELEASED')

/** Abgelaufene aktive Reservierungen freigeben -> Anzahl. */
export async function releaseExpired(now = new Date()) {
  const r = await prisma.shopReservation.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lte: now } },
    data: { status: 'RELEASED' },
  })
  return r.count
}
