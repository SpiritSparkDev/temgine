import { prisma } from '../prisma'
import { randomToken } from './tokens'
import { reservedByOthers } from './reservations'
import { sendStockAlertMail } from './orderMails'

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const MAX_UNCONFIRMED = 5
const EXPIRE_DAYS = 90
const LOCALES = ['de', 'en']

export class AlertError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function send(alert, format) {
  try {
    await sendStockAlertMail(alert, format, format.product, 'confirm')
  } catch (e) {
    console.error('[shop/stockAlerts] Bestätigungsmail fehlgeschlagen:', e.message)
  }
}

/**
 * Double-Opt-in-Eintrag anlegen. Gibt nie preis, ob die Adresse schon existiert.
 * Wirft AlertError (VALIDATION_ERROR, NOT_FOUND, STILL_AVAILABLE).
 */
export async function subscribeStockAlert({ sku, email, locale }, { now = new Date() } = {}) {
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!mail || mail.length > 200 || !EMAIL_RE.test(mail)) throw new AlertError(422, 'VALIDATION_ERROR', 'Bitte eine gültige E-Mail-Adresse angeben')
  if (typeof sku !== 'string' || !sku || sku.length > 40) throw new AlertError(404, 'NOT_FOUND', 'Format nicht gefunden')
  const format = await prisma.shopFormat.findUnique({ where: { sku }, include: { product: true } })
  if (!format || !format.product || !format.product.active) throw new AlertError(404, 'NOT_FOUND', 'Format nicht gefunden')
  if (format.digital || format.stock === null || format.stock === undefined) throw new AlertError(409, 'STILL_AVAILABLE', 'Das Produkt ist verfügbar')
  const reserved = (await reservedByOthers([format.id], { now })).get(format.id) || 0
  if (format.stock - reserved > 0) throw new AlertError(409, 'STILL_AVAILABLE', 'Das Produkt ist verfügbar')

  const existing = await prisma.shopStockAlert.findUnique({ where: { formatId_email: { formatId: format.id, email: mail } } })
  if (existing) {
    if (existing.confirmedAt) {
      // erneut scharf schalten, falls schon einmal benachrichtigt
      if (existing.notifiedAt) await prisma.shopStockAlert.update({ where: { id: existing.id }, data: { notifiedAt: null } })
      return
    }
    await send(existing, format)
    return
  }
  const open = await prisma.shopStockAlert.count({ where: { email: mail, confirmedAt: null } })
  if (open >= MAX_UNCONFIRMED) return
  const alert = await prisma.shopStockAlert.create({
    data: {
      formatId: format.id,
      email: mail,
      locale: LOCALES.includes(locale) ? locale : 'de',
      confirmToken: randomToken(24),
      unsubscribeToken: randomToken(24),
    },
  })
  await send(alert, format)
}

const tokenOk = (t) => typeof t === 'string' && t.length > 0 && t.length <= 100

/** true, wenn bestätigt (idempotent); false bei unbekanntem Token. */
export async function confirmStockAlert(token) {
  if (!tokenOk(token)) return false
  const a = await prisma.shopStockAlert.findUnique({ where: { confirmToken: token } })
  if (!a) return false
  if (!a.confirmedAt) await prisma.shopStockAlert.update({ where: { id: a.id }, data: { confirmedAt: new Date() } })
  return true
}

/** true, wenn gelöscht; false bei unbekanntem Token. */
export async function unsubscribeStockAlert(token) {
  if (!tokenOk(token)) return false
  const r = await prisma.shopStockAlert.deleteMany({ where: { unsubscribeToken: token } })
  return r.count > 0
}

/** Mailt bestätigte, noch nicht benachrichtigte Einträge der Formate, die wieder bestellbar sind. Gibt die Anzahl erfolgreicher Mails zurück. */
export async function notifyRestock(formatIds, { now = new Date() } = {}) {
  const ids = Array.isArray(formatIds) ? formatIds.filter(Boolean) : []
  if (!ids.length) return 0
  const alerts = await prisma.shopStockAlert.findMany({
    where: { formatId: { in: ids }, confirmedAt: { not: null }, notifiedAt: null, createdAt: { gte: new Date(now.getTime() - EXPIRE_DAYS * 86400000) } },
    include: { format: { include: { product: true } } },
  })
  let sent = 0
  for (const a of alerts) {
    const f = a.format
    if (!f || !f.product || !f.product.active || (f.stock !== null && f.stock <= 0)) continue
    try {
      await sendStockAlertMail(a, f, f.product, 'notify')
      await prisma.shopStockAlert.update({ where: { id: a.id }, data: { notifiedAt: new Date() } })
      sent++
    } catch (e) {
      console.error('[shop/stockAlerts] Benachrichtigung fehlgeschlagen:', e.message)
    }
  }
  return sent
}
