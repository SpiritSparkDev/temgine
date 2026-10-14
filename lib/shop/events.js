import { prisma } from '../prisma'

/** Ereignistypen des Bestellverlaufs (siehe Spezifikation §7.4). */
export const EVENT_TYPES = [
  'CREATED', 'PAID', 'FAILED', 'CANCELLED', 'SHIPPED', 'TRACKING', 'NOTE', 'REFUND', 'RETURN',
  'DOWNLOAD', 'INVOICE', 'MAIL', 'MAIL_ERROR', 'RESERVATION', 'STOCK', 'COUPON',
]

/**
 * Schreibt einen Eintrag in den Bestellverlauf. Fehler werden geloggt und geschluckt:
 * ein Verlaufseintrag darf nie eine Zahlung oder Bestellung verhindern.
 * `client` kann ein Transaktions-Client sein.
 */
export async function logOrderEvent(orderId, type, message = null, { userId = null, data = null, client = prisma } = {}) {
  try {
    await client.shopOrderEvent.create({
      data: {
        orderId,
        type: String(type),
        message: message ? String(message).slice(0, 2000) : null,
        userId: userId || null,
        data: data || undefined,
      },
    })
  } catch (e) {
    console.error('[shop/events] Eintrag nicht geschrieben:', e.message)
  }
}
