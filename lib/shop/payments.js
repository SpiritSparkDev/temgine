// Zahlungsschicht: Zahlung starten, beim Anbieter verifizieren, idempotent auf PAID setzen.
// Vorbild: Polyfeder_Shop/src/OrderPayment.php. Webhook- und Client-Inhalte zählen nie als Beweis.
import { prisma } from '../prisma'
import { loadShopSettings } from './config'
import { getProvider, isProviderAvailable } from './providers'
import { sendPaidMails } from './orderMails'
import { logOrderEvent } from './events'
import { consumeReservations, releaseReservations } from './reservations'
import { recordCouponUse } from './coupons'
import { issueInvoice } from './invoice'
import { createDownloadTokens } from './downloads'
import { notifyLowStock } from './lowStock'

const dbProvider = (id) => String(id).toUpperCase()

function logError(msg, e) {
  // Nur Meldung, nie Header/Body/Geheimnisse
  console.error(`[shop/payments] ${msg}${e ? ': ' + (e.message || e) : ''}`)
}

/**
 * Zahlung beim Anbieter anlegen und als ShopPayment (PENDING) speichern.
 * order = { id, reference, totalCents, currency, email, items?: [{ title, label, qty, unitCents }] }
 * @returns {{ provider: string, client: object }}
 */
export async function startPayment({ order, providerId, urls }) {
  const settings = await loadShopSettings()
  const provider = getProvider(providerId)
  if (!provider || !isProviderAvailable(providerId, settings)) throw new Error('Zahlungsanbieter nicht verfügbar')
  const currency = order.currency || 'EUR'
  const items = order.items || (await prisma.shopOrderItem.findMany({ where: { orderId: order.id } }))
  const { externalId, client } = await provider.createPayment({
    order: {
      reference: order.reference,
      totalCents: order.totalCents,
      discountCents: order.discountCents || 0,
      currency,
      email: order.email,
      items: items.map((i) => ({ title: i.title, label: i.label, qty: i.qty, unitCents: i.unitCents })),
    },
    settings,
    urls,
  })
  await prisma.shopPayment.create({
    data: { orderId: order.id, provider: dbProvider(providerId), externalId, status: 'PENDING', amountCents: order.totalCents, currency },
  })
  return { provider: providerId, client }
}

/** Bestellungen im Status FAILED werden nur innerhalb dieses Fensters erneut beim Anbieter geprüft (späte Zahlung). */
export const LATE_PAYMENT_WINDOW_MS = 48 * 60 * 60 * 1000

/** Bedingter Übergang PENDING/FAILED → PAID (FAILED = späte Zahlung). true = genau dieser Aufruf hat gewechselt. */
export async function markOrderPaid(orderId) {
  const r = await prisma.shopOrder.updateMany({ where: { id: orderId, status: { in: ['PENDING', 'FAILED', 'CANCELLED'] } }, data: { status: 'PAID', paidAt: new Date() } })
  return r.count === 1
}

/**
 * Bestandsbewegungen einer Bestellung: [{ formatId, sku, qty }] je Format zusammengefasst.
 * Bündel-Positionen zählen über ihre Bestandteile (Snapshot item.bundleItems × item.qty); digitale Teile entfallen.
 */
export function stockUnits(items) {
  const map = new Map()
  const add = (formatId, sku, qty) => {
    if (!formatId || !(qty > 0)) return
    const cur = map.get(formatId)
    if (cur) cur.qty += qty
    else map.set(formatId, { formatId, sku, qty })
  }
  for (const item of items) {
    if (Array.isArray(item.bundleItems) && item.bundleItems.length) {
      for (const c of item.bundleItems) if (!c.digital) add(c.formatId, c.sku, Number(c.qty) * item.qty)
    } else if (!item.digital) add(item.formatId, item.sku, item.qty)
  }
  return [...map.values()]
}

async function step(order, label, fn, fallback) {
  try {
    return await fn()
  } catch (e) {
    logError(`${label} ${order.reference} fehlgeschlagen`, e)
    return fallback
  }
}

/**
 * Nebenwirkungen nach dem Wechsel auf PAID (Reihenfolge laut Spezifikation 7.5, jeder Schritt isoliert):
 * Reservierungen verbrauchen, Bestand abbuchen, Gutschein verbuchen, Rechnung, Download-Links, Ereignis, Niedrigbestand, Mails.
 */
export async function onOrderPaid(order) {
  await step(order, 'Reservierungen', () => consumeReservations(order.id))

  const changes = []
  await step(order, 'Bestandsabbuchung', async () => {
    const items = await prisma.shopOrderItem.findMany({ where: { orderId: order.id } })
    for (const u of stockUnits(items)) {
      await step(order, `Bestandsabbuchung ${u.sku}`, async () => {
        const change = await deductStock(order, u)
        if (change) changes.push(change)
      })
    }
  })

  if (order.couponCode) await step(order, 'Gutschein', () => recordCouponUse(order.id, order.couponCode))
  const invoice = await step(order, 'Rechnung', () => issueInvoice(order.id), null)
  const downloads = await step(order, 'Download-Links', () => createDownloadTokens(order), [])
  await step(order, 'Verlaufseintrag', () => logOrderEvent(order.id, 'PAID', 'Zahlung bestätigt'))
  await step(order, 'Niedrigbestand', () => notifyLowStock(changes))
  // Wiederaufnahme: schon gesendete Bestätigung (Ereignis MAIL) nicht erneut senden
  const mailed = await step(order, 'Mail-Prüfung', () => prisma.shopOrderEvent.findFirst({ where: { orderId: order.id, type: 'MAIL' }, select: { id: true } }), null)
  if (!mailed) {
    try {
      await sendPaidMails(order, { downloads, invoice })
    } catch (e) {
      logError(`Bestätigungsmails ${order.reference} fehlgeschlagen`, e)
      await logOrderEvent(order.id, 'MAIL_ERROR', 'Bestätigungsmail konnte nicht gesendet werden')
    }
  }
}

/** Bucht eine Einheit-Gruppe ab. Liefert { formatId, sku, before, after } oder null (unbegrenzt/schon gebucht). */
async function deductStock(order, u) {
  return prisma.$transaction(async (tx) => {
    const format = await tx.shopFormat.findUnique({ where: { id: u.formatId }, select: { stock: true, productId: true } })
    if (!format || format.stock === null) return null // unbegrenzt oder Format gelöscht
    const before = format.stock
    const m = await tx.shopStockMovement.createMany({
      data: [{ sku: u.sku, delta: -u.qty, reason: 'ORDER_PAID', orderId: order.id }],
      skipDuplicates: true,
    })
    if (m.count !== 1) return null // schon gebucht
    // Admin-Speichern prüft updatedAt des Produkts: die Abbuchung muss es als Konflikt (409) sichtbar machen
    await tx.shopProduct.update({ where: { id: format.productId }, data: { updatedAt: new Date() } })
    const ok = await tx.shopFormat.updateMany({ where: { id: u.formatId, stock: { gte: u.qty } }, data: { stock: { decrement: u.qty } } })
    if (ok.count === 0) {
      await tx.shopFormat.updateMany({ where: { id: u.formatId, stock: { not: null } }, data: { stock: 0 } })
      console.warn(`[shop/payments] Überverkauf: Bestellung ${order.reference}, SKU ${u.sku}, Menge ${u.qty} - Bestand auf 0 gesetzt`)
      return { formatId: u.formatId, sku: u.sku, before, after: 0 }
    }
    return { formatId: u.formatId, sku: u.sku, before, after: before - u.qty }
  })
}

/**
 * Zahlung beim Anbieter abfragen und Bestellung nachziehen.
 * strict: Fehler der Anbieter-Abfrage werden weitergeworfen (Webhook: Anbieter soll erneut zustellen).
 * @returns {Promise<string|null>} Bestellstatus nach der Prüfung, null wenn die Zahlung unbekannt ist
 */
export async function syncPayment({ provider: providerId, externalId }, { strict = false } = {}) {
  const driver = getProvider(providerId)
  if (!driver || typeof externalId !== 'string' || !externalId) return null
  const payment = await prisma.shopPayment.findUnique({
    where: { provider_externalId: { provider: dbProvider(providerId), externalId } },
    include: { order: true },
  })
  if (!payment) return null
  const order = payment.order
  const lateWindowOpen = (order.status === 'FAILED' || order.status === 'CANCELLED') && Date.now() - new Date(order.createdAt).getTime() < LATE_PAYMENT_WINDOW_MS
  if ((order.status !== 'PENDING' && !lateWindowOpen) || !['PENDING', 'FAILED', 'CANCELLED'].includes(payment.status)) return order.status

  let remote
  try {
    remote = await driver.fetchPayment({ externalId, settings: await loadShopSettings() })
  } catch (e) {
    logError(`Statusabfrage ${order.reference} fehlgeschlagen`, e)
    if (strict) throw e
    return order.status
  }
  const status = remote && remote.status

  if (status === 'PAID') {
    const matches = remote.reference === order.reference && remote.currency === order.currency && remote.amountCents === order.totalCents
    if (!matches) {
      logError(`PAID-Zahlung passt nicht zu Bestellung ${order.reference}`)
      return order.status
    }
    const changed = await markOrderPaid(order.id)
    await prisma.shopPayment.updateMany({ where: { id: payment.id, status: { in: ['PENDING', 'FAILED', 'CANCELLED'] } }, data: { status: 'PAID' } })
    if (changed) await onOrderPaid(order)
    return 'PAID'
  }

  if (status === 'FAILED' || status === 'CANCELLED') {
    await prisma.shopPayment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status } })
    if (order.status === 'FAILED') return 'FAILED'
    const open = await prisma.shopPayment.count({ where: { orderId: order.id, status: 'PENDING' } })
    if (open === 0) {
      const r = await prisma.shopOrder.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } })
      if (r.count === 1) {
        try {
          await releaseReservations(order.id)
        } catch (e) {
          logError(`Reservierungen ${order.reference} nicht freigegeben`, e)
        }
        await logOrderEvent(order.id, status === 'CANCELLED' ? 'CANCELLED' : 'FAILED', `Zahlung beim Anbieter ${status === 'CANCELLED' ? 'abgebrochen' : 'fehlgeschlagen'}`)
      }
      return 'FAILED'
    }
  }
  return order.status
}

/**
 * Offene Zahlungen beim Anbieter nachprüfen (nacheinander, nicht-strikt).
 * @returns {{ checked: number, paid: number, failed: number, pending: number }}
 */
export async function reconcileOpenPayments({ limit = 50, now } = {}) {
  const nowMs = now ? new Date(now).getTime() : Date.now()
  const payments = await prisma.shopPayment.findMany({
    where: {
      createdAt: { lt: new Date(nowMs - RECONCILE_MIN_AGE_MS) },
      OR: [
        { status: 'PENDING', order: { status: 'PENDING' } },
        { order: { status: 'FAILED', createdAt: { gte: new Date(nowMs - LATE_PAYMENT_WINDOW_MS) } } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { provider: true, externalId: true },
  })
  const result = { checked: 0, paid: 0, failed: 0, pending: 0 }
  for (const p of payments) {
    let status = null
    try {
      status = await syncPayment({ provider: p.provider.toLowerCase(), externalId: p.externalId })
    } catch (e) {
      logError('Abgleich fehlgeschlagen', e)
    }
    result.checked++
    if (status === 'PAID') result.paid++
    else if (status === 'FAILED') result.failed++
    else result.pending++
  }
  return result
}

const RECONCILE_MIN_AGE_MS = 2 * 60_000
const RECOVER_MIN_AGE_MS = 5 * 60_000
const RECOVER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Wiederaufnahme nach Absturz zwischen markOrderPaid und onOrderPaid: bezahlte Bestellungen ohne MAIL-/MAIL_ERROR-Ereignis
 * (der letzte Schritt von onOrderPaid schreibt immer eines von beiden) erneut durch onOrderPaid schicken. Alle Schritte dort sind idempotent.
 * @returns {{ checked: number, recovered: number }}
 */
export async function recoverPaidOrders({ limit = 50, now } = {}) {
  const nowMs = now ? new Date(now).getTime() : Date.now()
  const orders = await prisma.shopOrder.findMany({
    where: {
      status: { in: ['PAID', 'SHIPPED'] },
      paidAt: { gte: new Date(nowMs - RECOVER_MAX_AGE_MS), lt: new Date(nowMs - RECOVER_MIN_AGE_MS) },
      events: { none: { type: { in: ['MAIL', 'MAIL_ERROR'] } } },
    },
    orderBy: { paidAt: 'asc' },
    take: limit,
  })
  const result = { checked: 0, recovered: 0 }
  for (const order of orders) {
    result.checked++
    try {
      await onOrderPaid(order)
      result.recovered++
    } catch (e) {
      logError(`Wiederaufnahme ${order.reference} fehlgeschlagen`, e)
    }
  }
  return result
}
