// Zahlungsschicht: Zahlung starten, beim Anbieter verifizieren, idempotent auf PAID setzen.
// Vorbild: Polyfeder_Shop/src/OrderPayment.php. Webhook- und Client-Inhalte zählen nie als Beweis.
import { prisma } from '../prisma'
import { loadShopSettings } from './config'
import { getProvider, isProviderAvailable } from './providers'
import { sendPaidMails } from './orderMails'

/** Hooks nach erfolgreicher Zahlung: async (order) => void. Läuft genau einmal je Bestellung (Phase 6: Mails). */
export const afterPaid = [sendPaidMails]

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

/** Bedingter Übergang PENDING → PAID. true = genau dieser Aufruf hat gewechselt. */
export async function markOrderPaid(orderId) {
  const r = await prisma.shopOrder.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'PAID', paidAt: new Date() } })
  return r.count === 1
}

/** Bestandsabbuchung (je Position idempotent über ShopStockMovement) und danach die afterPaid-Hooks. Fehler blockieren nichts. */
export async function onOrderPaid(order) {
  try {
    const items = await prisma.shopOrderItem.findMany({ where: { orderId: order.id } })
    for (const item of items) {
      if (item.digital || !item.formatId) continue
      try {
        await deductStock(order, item)
      } catch (e) {
        logError(`Bestandsabbuchung ${order.reference}/${item.sku} fehlgeschlagen`, e)
      }
    }
  } catch (e) {
    logError(`Bestandsabbuchung ${order.reference} fehlgeschlagen`, e)
  }
  for (const hook of afterPaid) {
    try {
      await hook(order)
    } catch (e) {
      logError(`afterPaid-Hook für ${order.reference} fehlgeschlagen`, e)
    }
  }
}

async function deductStock(order, item) {
  await prisma.$transaction(async (tx) => {
    const format = await tx.shopFormat.findUnique({ where: { id: item.formatId }, select: { stock: true } })
    if (!format || format.stock === null) return // unbegrenzt oder Format gelöscht
    const m = await tx.shopStockMovement.createMany({
      data: [{ sku: item.sku, delta: -item.qty, reason: 'ORDER_PAID', orderId: order.id }],
      skipDuplicates: true,
    })
    if (m.count !== 1) return // schon gebucht
    const ok = await tx.shopFormat.updateMany({ where: { id: item.formatId, stock: { gte: item.qty } }, data: { stock: { decrement: item.qty } } })
    if (ok.count === 0) {
      await tx.shopFormat.updateMany({ where: { id: item.formatId, stock: { not: null } }, data: { stock: 0 } })
      console.warn(`[shop/payments] Überverkauf: Bestellung ${order.reference}, SKU ${item.sku}, Menge ${item.qty} - Bestand auf 0 gesetzt`)
    }
  })
}

/**
 * Zahlung beim Anbieter abfragen und Bestellung nachziehen.
 * @returns {Promise<string|null>} Bestellstatus nach der Prüfung, null wenn die Zahlung unbekannt ist
 */
export async function syncPayment({ provider: providerId, externalId }) {
  const driver = getProvider(providerId)
  if (!driver || typeof externalId !== 'string' || !externalId) return null
  const payment = await prisma.shopPayment.findUnique({
    where: { provider_externalId: { provider: dbProvider(providerId), externalId } },
    include: { order: true },
  })
  if (!payment) return null
  const order = payment.order
  if (order.status !== 'PENDING' || payment.status !== 'PENDING') return order.status

  let remote
  try {
    remote = await driver.fetchPayment({ externalId, settings: await loadShopSettings() })
  } catch (e) {
    logError(`Statusabfrage ${order.reference} fehlgeschlagen`, e)
    return 'PENDING'
  }
  const status = remote && remote.status

  if (status === 'PAID') {
    const matches = remote.reference === order.reference && remote.currency === order.currency && remote.amountCents === order.totalCents
    if (!matches) {
      logError(`PAID-Zahlung passt nicht zu Bestellung ${order.reference}`)
      return 'PENDING'
    }
    const changed = await markOrderPaid(order.id)
    await prisma.shopPayment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'PAID' } })
    if (changed) await onOrderPaid(order)
    return 'PAID'
  }

  if (status === 'FAILED' || status === 'CANCELLED') {
    await prisma.shopPayment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status } })
    const open = await prisma.shopPayment.count({ where: { orderId: order.id, status: 'PENDING' } })
    if (open === 0) {
      await prisma.shopOrder.updateMany({ where: { id: order.id, status: 'PENDING' }, data: { status: 'FAILED' } })
      return 'FAILED'
    }
  }
  return 'PENDING'
}
