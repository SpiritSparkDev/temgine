import { prisma } from '../prisma'
import { getSetting, numberFrom, getShopSettings, shopCurrency } from './settingsStore'

const PAID_STATES = ['PAID', 'SHIPPED', 'REFUNDED']
const DAY = 24 * 60 * 60 * 1000

/** Datum YYYY-MM-DD in der Zeitzone des Servers (lokale Komponenten) */
export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Beginn des lokalen Tages (Serverzeitzone), n Tage zurück */
function startOfDay(now, back = 0) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
}

const sum = (agg) => (agg?._sum?.totalCents || 0) - (agg?._sum?.refundedCents || 0)

/**
 * Kennzahlen fürs Dashboard. Zeiträume und perDay-Tage beziehen sich auf paidAt und die Serverzeitzone:
 * "letzte 7 Tage" = jetzt − 7×24 h; perDay = 30 lokale Kalendertage inkl. heute (älteste zuerst, ohne Lücken).
 */
export async function getOverview({ now = new Date() } = {}) {
  const paidWhere = (extra = {}) => ({ status: { in: PAID_STATES }, ...extra })
  const since = (days) => ({ paidAt: { gte: new Date(now.getTime() - days * DAY) } })
  const dayStart = startOfDay(now, 29)
  const agg = { _sum: { totalCents: true, refundedCents: true } }

  const [a7, a30, aAll, byStatus, paidRows, topItems, topCouponRows, thresholdRaw, settings] = await Promise.all([
    prisma.shopOrder.aggregate({ where: paidWhere(since(7)), ...agg }),
    prisma.shopOrder.aggregate({ where: paidWhere(since(30)), ...agg }),
    prisma.shopOrder.aggregate({ where: paidWhere(), _count: { _all: true }, ...agg }),
    prisma.shopOrder.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.shopOrder.findMany({ where: paidWhere({ paidAt: { gte: dayStart } }), select: { paidAt: true, totalCents: true, refundedCents: true } }),
    prisma.shopOrderItem.groupBy({
      by: ['title'],
      where: { order: paidWhere(since(30)) },
      _sum: { qty: true },
      orderBy: { _sum: { qty: 'desc' } },
      take: 5,
    }),
    prisma.shopOrder.groupBy({
      by: ['couponCode'],
      where: paidWhere({ ...since(30), couponCode: { not: null } }),
      _count: { _all: true },
      _sum: { discountCents: true },
      orderBy: { _count: { couponCode: 'desc' } },
      take: 5,
    }),
    getSetting('shop_low_stock_threshold', null),
    getShopSettings(),
  ])

  const statusCounts = {}
  for (const r of byStatus) statusCounts[r.status] = r._count._all

  const buckets = new Map()
  for (let i = 29; i >= 0; i--) buckets.set(dayKey(startOfDay(now, i)), { date: dayKey(startOfDay(now, i)), count: 0, revenueCents: 0 })
  for (const o of paidRows) {
    const b = buckets.get(dayKey(new Date(o.paidAt)))
    if (b) {
      b.count += 1
      b.revenueCents += o.totalCents - o.refundedCents
    }
  }

  const paidCount = aAll._count?._all || 0
  const threshold = numberFrom(thresholdRaw, null)
  let lowStock = []
  if (threshold !== null) {
    const formats = await prisma.shopFormat.findMany({
      where: { stock: { not: null, lte: threshold }, digital: false, product: { active: true } },
      orderBy: [{ stock: 'asc' }, { sku: 'asc' }],
      select: { sku: true, label: true, stock: true, product: { select: { title: true } } },
    })
    lowStock = formats.map((f) => ({ sku: f.sku, label: f.label, title: f.product?.title || '', stock: f.stock }))
  }

  return {
    currency: shopCurrency(settings),
    revenue: { last7: sum(a7), last30: sum(a30), total: sum(aAll) },
    orders: { byStatus: statusCounts, open: statusCounts.PENDING || 0 },
    perDay: [...buckets.values()],
    topProducts: topItems.map((r) => ({ title: r.title, units: r._sum.qty || 0 })),
    averageOrderCents: paidCount ? Math.round((aAll._sum?.totalCents || 0) / paidCount) : 0,
    refundedCents: aAll._sum?.refundedCents || 0,
    lowStock,
    topCoupons: topCouponRows.map((r) => ({ code: r.couponCode, uses: r._count._all, discountCents: r._sum.discountCents || 0 })),
  }
}
