import { prisma } from '../prisma'
import { logOrderEvent } from './events'
import { getSetting } from './settingsStore'
import { sendReturnMail } from './orderMails'

export class ReturnError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const MAX_OPEN = 3
const DAY_MS = 86400000
const NOT_FOUND = () => new ReturnError(404, 'NOT_FOUND', 'Bestellung nicht gefunden')

// Steuerzeichen raus (Zeilenumbrüche und Tabs bleiben), trimmen
const clean = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()

export const TRANSITIONS = {
  NEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['REFUNDED', 'REJECTED'],
  REFUNDED: [],
  REJECTED: [],
}
const MAIL_KIND = { APPROVED: 'approved', REJECTED: 'rejected', RECEIVED: 'received_goods', REFUNDED: 'refunded' }

/** Prüft Positionen gegen die Bestellung; gibt bereinigte [{ sku, qty }] zurück (leer = ganze Bestellung). */
export function validateReturnItems(items, orderItems) {
  if (items === undefined || items === null) return []
  if (!Array.isArray(items) || items.length > 50) throw new ReturnError(422, 'VALIDATION_ERROR', 'Ungültige Positionen')
  const ordered = new Map()
  for (const i of orderItems) ordered.set(i.sku, (ordered.get(i.sku) || 0) + i.qty)
  const seen = new Map()
  for (const it of items) {
    const sku = typeof it?.sku === 'string' ? it.sku : ''
    const max = ordered.get(sku)
    if (max === undefined) throw new ReturnError(422, 'VALIDATION_ERROR', 'Position gehört nicht zur Bestellung', { sku })
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > max) throw new ReturnError(422, 'VALIDATION_ERROR', 'Ungültige Menge', { sku })
    seen.set(sku, (seen.get(sku) || 0) + it.qty)
    if (seen.get(sku) > max) throw new ReturnError(422, 'VALIDATION_ERROR', 'Ungültige Menge', { sku })
  }
  return [...seen].map(([sku, qty]) => ({ sku, qty }))
}

/** Legt eine Rückgabe-Anfrage an (öffentlich). Wirft ReturnError. */
export async function createReturnRequest({ reference, email, items, reason }, { now = new Date() } = {}) {
  const ref = typeof reference === 'string' ? reference.trim() : ''
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const text = clean(reason)
  if (!ref || ref.length > 60 || !mail || mail.length > 200 || !EMAIL_RE.test(mail)) throw NOT_FOUND()
  if (text.length < 5 || text.length > 2000) {
    throw new ReturnError(422, 'VALIDATION_ERROR', 'Der Grund muss 5 bis 2000 Zeichen lang sein', { fields: { reason: 'Bitte 5 bis 2000 Zeichen angeben' } })
  }

  const order = await prisma.shopOrder.findUnique({ where: { reference: ref }, include: { items: true } })
  if (!order || String(order.email).trim().toLowerCase() !== mail) throw NOT_FOUND()
  if (order.status !== 'PAID' && order.status !== 'SHIPPED') {
    throw new ReturnError(422, 'ORDER_NOT_RETURNABLE', 'Für diese Bestellung ist keine Rückgabe möglich')
  }

  const rawDays = await getSetting('shop_return_days', null)
  const days = rawDays === null || rawDays === '' ? NaN : Number(rawDays)
  if (Number.isInteger(days) && days >= 0) {
    const base = order.shippedAt || order.paidAt || order.createdAt
    if (base && now.getTime() > new Date(base).getTime() + days * DAY_MS) {
      throw new ReturnError(422, 'RETURN_PERIOD_OVER', 'Die Rückgabefrist ist abgelaufen')
    }
  }

  const cleanItems = validateReturnItems(items, order.items)
  const open = await prisma.shopReturnRequest.count({ where: { orderId: order.id, status: { in: ['NEW', 'APPROVED'] } } })
  if (open >= MAX_OPEN) throw new ReturnError(429, 'TOO_MANY_OPEN', 'Für diese Bestellung gibt es bereits mehrere offene Anfragen')

  const request = await prisma.shopReturnRequest.create({ data: { orderId: order.id, email: mail, items: cleanItems, reason: text } })
  await logOrderEvent(order.id, 'RETURN', 'Rückgabe-Anfrage eingegangen', { data: { returnId: request.id } })
  try {
    await sendReturnMail(request, order, 'received')
  } catch (e) {
    console.error('[shop/returns] Mail fehlgeschlagen:', e.message)
  }
  return request
}

/** Admin: Statuswechsel und/oder Notiz. Wirft ReturnError. */
export async function updateReturnRequest(id, { status, adminNote }, { userId = null } = {}) {
  const current = await prisma.shopReturnRequest.findUnique({ where: { id }, include: { order: true } })
  if (!current) throw new ReturnError(404, 'NOT_FOUND', 'Anfrage nicht gefunden')
  const data = {}
  if (adminNote !== undefined) {
    if (adminNote !== null && typeof adminNote !== 'string') throw new ReturnError(422, 'VALIDATION_ERROR', 'Ungültige Notiz')
    const note = adminNote === null ? '' : clean(adminNote)
    if (note.length > 2000) throw new ReturnError(422, 'VALIDATION_ERROR', 'Notiz darf höchstens 2000 Zeichen haben')
    data.adminNote = note || null
  }
  const changing = status !== undefined && status !== current.status
  if (status !== undefined) {
    if (!Object.keys(TRANSITIONS).includes(status)) throw new ReturnError(422, 'VALIDATION_ERROR', 'Ungültiger Status')
    if (changing) {
      if (!TRANSITIONS[current.status].includes(status)) throw new ReturnError(409, 'INVALID_TRANSITION', 'Statuswechsel nicht erlaubt')
      data.status = status
    }
  }
  if (Object.keys(data).length === 0) return current
  const where = changing ? { id, status: current.status } : { id }
  const r = await prisma.shopReturnRequest.updateMany({ where, data })
  if (r.count !== 1) throw new ReturnError(409, 'INVALID_TRANSITION', 'Die Anfrage wurde zwischenzeitlich geändert')
  const updated = { ...current, ...data }
  if (changing) {
    await logOrderEvent(current.orderId, 'RETURN', `Rückgabe ${current.status} -> ${status}`, { userId, data: { returnId: id } })
    try {
      await sendReturnMail(updated, current.order, MAIL_KIND[status])
    } catch (e) {
      console.error('[shop/returns] Mail fehlgeschlagen:', e.message)
    }
  }
  return updated
}
