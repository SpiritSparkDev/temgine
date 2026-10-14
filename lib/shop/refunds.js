// Erstatten: ShopRefund anlegen, Anbieter rufen, Betrag bedingt verbuchen, optional Bestand zurück, Ereignis, Mail.
import { prisma } from '../prisma'
import { loadShopSettings } from './config'
import { getProvider } from './providers'
import { stockUnits } from './payments'
import { logOrderEvent } from './events'
import { sendRefundMail } from './orderMails'

export class ShopRefundError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'ShopRefundError'
    this.code = code // REFUND_NOT_ALLOWED | AMOUNT_INVALID | PROVIDER_ERROR
    Object.assign(this, extra)
  }
}

const REFUNDABLE = ['PAID', 'SHIPPED']
const short = (s) => String(s || '').slice(0, 300)

function logError(msg, e) {
  console.error(`[shop/refunds] ${msg}${e ? ': ' + (e.message || e) : ''}`)
}

/** Bestand bei vollständiger Erstattung zurückbuchen (idempotent über ShopStockMovement REFUND_RESTOCK). */
async function restockOrder(order) {
  const items = await prisma.shopOrderItem.findMany({ where: { orderId: order.id } })
  for (const u of stockUnits(items)) {
    try {
      await prisma.$transaction(async (tx) => {
        const format = await tx.shopFormat.findUnique({ where: { id: u.formatId }, select: { stock: true, productId: true } })
        if (!format || format.stock === null) return
        const m = await tx.shopStockMovement.createMany({
          data: [{ sku: u.sku, delta: u.qty, reason: 'REFUND_RESTOCK', orderId: order.id }],
          skipDuplicates: true,
        })
        if (m.count !== 1) return
        await tx.shopProduct.update({ where: { id: format.productId }, data: { updatedAt: new Date() } })
        await tx.shopFormat.updateMany({ where: { id: u.formatId, stock: { not: null } }, data: { stock: { increment: u.qty } } })
      })
    } catch (e) {
      logError(`Rückbuchung ${order.reference}/${u.sku} fehlgeschlagen`, e)
    }
  }
}

/**
 * @param {{ order: object, amountCents?: number, reason?: string, restock?: boolean, userId?: string, notifyCustomer?: boolean }} p
 * @returns {{ refund: object, order: object, full: boolean, mailError: boolean }}
 * @throws {ShopRefundError}
 */
export async function createRefund({ order, amountCents, reason, restock = false, userId = null, notifyCustomer = true }) {
  if (!order || !REFUNDABLE.includes(order.status)) {
    throw new ShopRefundError('REFUND_NOT_ALLOWED', 'Nur bezahlte oder versendete Bestellungen können erstattet werden')
  }
  const payment = await prisma.shopPayment.findFirst({ where: { orderId: order.id, status: 'PAID' } })
  if (!payment) throw new ShopRefundError('REFUND_NOT_ALLOWED', 'Keine erfolgreiche Zahlung vorhanden')
  const driver = getProvider(String(payment.provider).toLowerCase())
  if (!driver || typeof driver.refundPayment !== 'function') {
    throw new ShopRefundError('REFUND_NOT_ALLOWED', 'Der Zahlungsanbieter unterstützt keine Erstattung')
  }

  // Noch laufende (PENDING) Erstattungen zählen mit, damit ein Doppelklick nicht doppelt erstattet.
  const pending = await prisma.shopRefund.findMany({ where: { orderId: order.id, status: 'PENDING' }, select: { amountCents: true } })
  const remaining = order.totalCents - (order.refundedCents || 0) - pending.reduce((s, r) => s + r.amountCents, 0)
  const amount = amountCents === undefined || amountCents === null ? remaining : amountCents
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) {
    throw new ShopRefundError('AMOUNT_INVALID', `Ungültiger Betrag (erstattbar: ${Math.max(remaining, 0)} Cent)`)
  }

  const refund = await prisma.shopRefund.create({
    data: { orderId: order.id, paymentId: payment.id, amountCents: amount, reason: reason || null, restock: !!restock, status: 'PENDING', userId: userId || null },
  })

  let result
  try {
    result = await driver.refundPayment({
      externalId: payment.externalId,
      amountCents: amount,
      currency: payment.currency,
      reason: reason || undefined,
      settings: await loadShopSettings(),
      payment,
      idempotencyKey: refund.id,
    })
  } catch (e) {
    result = { status: 'FAILED', error: e && e.message }
  }
  const status = result && ['SUCCEEDED', 'PENDING', 'FAILED'].includes(result.status) ? result.status : 'FAILED'

  if (status === 'FAILED') {
    const err = short((result && result.error) || 'Erstattung vom Zahlungsanbieter abgelehnt')
    await prisma.shopRefund.update({ where: { id: refund.id }, data: { status: 'FAILED', error: err, externalId: (result && result.externalId) || undefined } })
    await logOrderEvent(order.id, 'REFUND', `Erstattung von ${amount} Cent fehlgeschlagen`, { userId, data: { refundId: refund.id } })
    throw new ShopRefundError('PROVIDER_ERROR', 'Die Erstattung wurde vom Zahlungsanbieter nicht ausgeführt', { refund })
  }
  // PENDING beim Anbieter (z. B. PayPal) wird wie erfolgreich verbucht: nichts im Shop löst PENDING später auf, der Anbieter führt sie aus.

  // SUCCEEDED: Betrag bedingt verbuchen (gegen Parallelität), Status bei Vollerstattung
  const total = order.totalCents
  const booked = await prisma.$transaction(async (tx) => {
    const r = await tx.shopOrder.updateMany({
      where: { id: order.id, status: { in: REFUNDABLE }, refundedCents: { lte: total - amount } },
      data: { refundedCents: { increment: amount } },
    })
    if (r.count !== 1) return null
    const fresh = await tx.shopOrder.findUnique({ where: { id: order.id } })
    if (fresh.refundedCents >= total) {
      await tx.shopOrder.updateMany({ where: { id: order.id, status: { in: REFUNDABLE } }, data: { status: 'REFUNDED' } })
      return { ...fresh, status: 'REFUNDED' }
    }
    return fresh
  })
  if (!booked) {
    // Geld ist beim Anbieter bereits bewegt: sichtbar machen statt zu verschweigen
    await prisma.shopRefund.update({ where: { id: refund.id }, data: { status: 'SUCCEEDED', externalId: result.externalId || undefined, error: 'Betrag konnte nicht verbucht werden (Parallelität), Anbieter prüfen' } })
    await logOrderEvent(order.id, 'REFUND', `Erstattung ${amount} Cent beim Anbieter ausgeführt, aber nicht verbucht - bitte prüfen`, { userId, data: { refundId: refund.id } })
    throw new ShopRefundError('REFUND_NOT_ALLOWED', 'Erstattung konnte nicht verbucht werden (parallele Erstattung). Bitte beim Zahlungsanbieter prüfen', { refund })
  }
  const done = await prisma.shopRefund.update({ where: { id: refund.id }, data: { status: 'SUCCEEDED', externalId: result.externalId || undefined } })
  const full = booked.status === 'REFUNDED'
  if (full && restock) await restockOrder(order)
  await logOrderEvent(order.id, 'REFUND', `Erstattung von ${amount} Cent${full ? ' (vollständig)' : ''}${restock && full ? ', Bestand zurückgebucht' : ''}`, { userId, data: { refundId: refund.id, amountCents: amount } })

  let mailError = false
  if (notifyCustomer) {
    try {
      await sendRefundMail(booked, done)
    } catch (e) {
      mailError = true
      logError(`Erstattungsmail ${order.reference} fehlgeschlagen`, e)
      await logOrderEvent(order.id, 'MAIL_ERROR', 'Erstattungsmail konnte nicht gesendet werden')
    }
  }
  return { refund: done, order: booked, full, mailError }
}
