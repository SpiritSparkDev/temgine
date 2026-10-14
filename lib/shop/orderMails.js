// Bestell-Mails (Reintext, de/en). Textbau ist rein (build*); Versand in send*. Keine Rechtstexte, nur Platzhalter.
// Vertrag: docs/SHOP_ADDON.md §7.5. Kundenmails in order.locale / alert.locale, Verlagsmails in shop_default_locale.
import { prisma } from '../prisma'
import { sendMail } from '../email'
import { getBaseUrl } from './baseUrl'
import { logOrderEvent } from './events'
import { t, normalizeLocale } from './i18n'
import { buildInvoiceAttachment } from './invoice'
import { formatMoney } from './money'
import { getShopSettings, shopLocale } from './settingsStore'

// Zeilenumbrüche raus (Header-Injection), Rest trimmen
const oneLine = (v) => String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim()
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const numTag = (locale) => (locale === 'en' ? 'en-GB' : 'de-DE')

const money = (order, cents, locale) => formatMoney(cents || 0, (order && order.currency) || 'EUR', locale).replace(/\u00a0/g, ' ')

const addr = (a) => {
  const x = a && typeof a === 'object' ? a : {}
  return [x.name, x.street, `${x.zip || ''} ${x.city || ''}`.trim(), x.country].filter(Boolean).join('\n')
}

function taxNote(order, locale) {
  const tb = order.taxBreakdown && typeof order.taxBreakdown === 'object' ? order.taxBreakdown : {}
  const parts = Object.keys(tb)
    .sort((a, b) => Number(a) - Number(b))
    .map((bp) => t(locale, 'mail.order.taxPart', { rate: (Number(bp) / 100).toLocaleString(numTag(locale)), amount: money(order, tb[bp], locale) }))
  return parts.length ? `${t(locale, 'mail.order.taxIncluded', { parts: parts.join(', ') })}\n` : ''
}

function summary(order, items, locale) {
  const lines = items.map((i) =>
    t(locale, 'mail.order.item', { qty: i.qty, title: i.title, label: i.label, amount: money(order, i.qty * i.unitCents, locale) }))
  const discount = order.discountCents > 0
    ? (order.couponCode
      ? t(locale, 'mail.order.discountCode', { code: oneLine(order.couponCode), amount: money(order, order.discountCents, locale) })
      : t(locale, 'mail.order.discount', { amount: money(order, order.discountCents, locale) })) + '\n'
    : ''
  return (
    `${t(locale, 'mail.order.number', { reference: order.reference })}\n\n` +
    `${lines.join('\n')}\n\n` +
    `${t(locale, 'mail.order.subtotal', { amount: money(order, order.subtotalCents, locale) })}\n` +
    discount +
    `${t(locale, 'mail.order.shipping', { amount: money(order, order.shippingCents, locale) })}\n` +
    `${t(locale, 'mail.order.total', { amount: money(order, order.totalCents, locale) })}\n` +
    taxNote(order, locale) +
    `\n${t(locale, 'mail.order.billing')}\n${addr(order.billing)}\n\n` +
    `${t(locale, 'mail.order.shippingAddress')}\n${addr(order.shipping)}\n\n` +
    `${t(locale, 'mail.order.email', { email: order.email })}\n`
  )
}

function absUrl(base, url) {
  const u = String(url || '')
  return /^https?:\/\//i.test(u) ? u : `${base}${u}`
}

function downloadsText(links, locale, base) {
  if (!Array.isArray(links) || !links.length) return ''
  const rows = links.map((l) => {
    const date = l.expiresAt ? new Date(l.expiresAt).toLocaleDateString(numTag(locale)) : ''
    const head = t(locale, 'mail.downloads.item', { filename: oneLine(l.filename), url: absUrl(base, l.url) })
    return l.expiresAt && l.maxDownloads ? `${head}\n${t(locale, 'mail.downloads.meta', { date, max: l.maxDownloads })}` : head
  })
  return `${t(locale, 'mail.downloads.heading')}\n${rows.join('\n')}\n`
}

/** Bestätigung an den Kunden: { to, subject, text }. opts: { downloads, invoice, base, hasAttachment } */
export function buildPaidMail(order, items, opts = {}) {
  const locale = normalizeLocale(order.locale)
  const base = opts.base ?? getBaseUrl()
  let text = `${t(locale, 'mail.paid.intro')}\n\n${summary(order, items, locale)}\n`
  const dl = downloadsText(opts.downloads, locale, base)
  if (dl) text += `${dl}\n`
  if (opts.hasAttachment) {
    const n = opts.invoice && opts.invoice.number
    text += `${n ? t(locale, 'mail.paid.invoice', { number: oneLine(n) }) : t(locale, 'mail.paid.invoiceNoNumber')}\n\n`
  }
  text += `${t(locale, 'mail.paid.legal')}\n`
  return { to: oneLine(order.email), subject: t(locale, 'mail.paid.subject', { reference: oneLine(order.reference) }), text }
}

/** Benachrichtigung an den Verlag (Empfänger setzt der Aufrufer); locale = Verlagssprache. */
export function buildNotifyMail(order, items, locale = 'de') {
  const l = normalizeLocale(locale)
  return {
    subject: t(l, 'mail.notify.subject', { reference: oneLine(order.reference) }),
    text: `${t(l, 'mail.notify.intro')}\n\n${summary(order, items, l)}`,
  }
}

export function buildShippedMail(order) {
  const locale = normalizeLocale(order.locale)
  const ref = oneLine(order.reference)
  let text = `${t(locale, 'mail.shipped.body', { reference: ref })}\n`
  const extra = []
  if (order.trackingCarrier) extra.push(t(locale, 'mail.shipped.carrier', { carrier: oneLine(order.trackingCarrier) }))
  if (order.trackingNumber) extra.push(t(locale, 'mail.shipped.number', { number: oneLine(order.trackingNumber) }))
  if (order.trackingUrl) extra.push(t(locale, 'mail.shipped.link', { url: oneLine(order.trackingUrl) }))
  if (extra.length) text += `\n${extra.join('\n')}\n`
  return { to: oneLine(order.email), subject: t(locale, 'mail.shipped.subject', { reference: ref }), text }
}

export function buildRefundMail(order, refund) {
  const locale = normalizeLocale(order.locale)
  const ref = oneLine(order.reference)
  let text = `${t(locale, 'mail.refund.body', { amount: money(order, refund && refund.amountCents, locale), reference: ref })}\n`
  if (refund && refund.reason) text += `${t(locale, 'mail.refund.reason', { reason: refund.reason })}\n`
  if (order.refundedCents > 0) text += `${t(locale, 'mail.refund.total', { amount: money(order, order.refundedCents, locale) })}\n`
  text += `\n${t(locale, 'mail.refund.hint')}\n`
  return { to: oneLine(order.email), subject: t(locale, 'mail.refund.subject', { reference: ref }), text }
}

export function buildDownloadsMail(order, links, base = getBaseUrl()) {
  const locale = normalizeLocale(order.locale)
  const ref = oneLine(order.reference)
  const dl = downloadsText(links, locale, base)
  return {
    to: oneLine(order.email),
    subject: t(locale, 'mail.downloads.subject', { reference: ref }),
    text: `${t(locale, 'mail.downloads.intro', { reference: ref })}\n\n${dl || `${t(locale, 'mail.downloads.none')}\n`}`,
  }
}

const RETURN_KINDS = ['received', 'approved', 'rejected', 'received_goods', 'refunded']

function returnItemsText(request, locale) {
  const items = Array.isArray(request.items) ? request.items : []
  if (!items.length) return t(locale, 'mail.return.all')
  return `${t(locale, 'mail.return.items')}\n${items.map((i) => t(locale, 'mail.return.item', { qty: i.qty, sku: oneLine(i.sku) })).join('\n')}`
}

export function buildReturnMail(request, order, kind) {
  const locale = normalizeLocale(order.locale)
  const ref = oneLine(order.reference)
  let text = `${t(locale, `mail.return.body.${kind}`, { reference: ref })}\n`
  if (kind === 'received') text += `\n${returnItemsText(request, locale)}\n${t(locale, 'mail.return.reason', { reason: request.reason || '' })}\n`
  if (request.adminNote && kind !== 'received') text += `\n${t(locale, 'mail.return.note', { note: request.adminNote })}\n`
  return { to: oneLine(request.email || order.email), subject: t(locale, `mail.return.subject.${kind}`, { reference: ref }), text }
}

export function buildReturnNotifyMail(request, order, locale = 'de') {
  const l = normalizeLocale(locale)
  const ref = oneLine(order.reference)
  return {
    subject: t(l, 'mail.returnNotify.subject', { reference: ref }),
    text:
      `${t(l, 'mail.returnNotify.body', { reference: ref })}\n\n` +
      `${t(l, 'mail.returnNotify.email', { email: request.email || order.email })}\n` +
      `${returnItemsText(request, l)}\n` +
      `${t(l, 'mail.returnNotify.reason', { reason: request.reason || '' })}\n`,
  }
}

export function buildStockAlertMail(alert, format, product, kind, base = getBaseUrl()) {
  const locale = normalizeLocale(alert.locale)
  const tr = (product.translations && product.translations[locale]) || {}
  const vars = { title: oneLine(tr.title || product.title), label: oneLine(format && format.label) }
  const unsub = `${base}/api/shop/public/stock-alerts/unsubscribe?token=${alert.unsubscribeToken}`
  let text
  if (kind === 'confirm') {
    text = `${t(locale, 'mail.stock.confirm.body', vars)}\n${base}/api/shop/public/stock-alerts/confirm?token=${alert.confirmToken}\n\n${t(locale, 'mail.stock.confirm.ignore')}\n`
  } else {
    text = `${t(locale, 'mail.stock.notify.body', vars)}\n${base}/shop/${product.slug}\n`
  }
  text += `\n${t(locale, 'mail.stock.unsubscribe', { url: unsub })}\n`
  return { to: oneLine(alert.email), subject: t(locale, `mail.stock.${kind}.subject`, vars), text }
}

export function buildLowStockMail(items, locale = 'de') {
  const l = normalizeLocale(locale)
  const rows = items.map((i) => t(l, 'mail.lowStock.item', { sku: oneLine(i.sku), title: oneLine(i.title || i.label), stock: i.stock }))
  return { subject: t(l, 'mail.lowStock.subject', { count: items.length }), text: `${t(l, 'mail.lowStock.intro')}\n\n${rows.join('\n')}\n` }
}

/**
 * Sendungsdaten prüfen (§7.5): carrier ≤ 40, Nummer ≤ 60 aus [A-Za-z0-9 ._/-], URL nur https:// und ≤ 300.
 * Leere Werte werden zu null, nicht übergebene Felder fehlen in data.
 */
export function validateTracking(body) {
  const b = body && typeof body === 'object' ? body : {}
  const errors = []
  const data = {}
  const pick = (name, key, check, msg) => {
    if (b[name] === undefined) return
    if (b[name] !== null && typeof b[name] !== 'string') return errors.push(msg)
    const v = String(b[name] ?? '').trim()
    if (v && !check(v)) return errors.push(msg)
    data[key] = v || null
  }
  pick('carrier', 'trackingCarrier', (v) => v.length <= 40 && !/[\r\n]/.test(v), 'Anbieter: höchstens 40 Zeichen')
  pick('trackingNumber', 'trackingNumber', (v) => v.length <= 60 && /^[A-Za-z0-9 ._/-]+$/.test(v), 'Sendungsnummer: höchstens 60 Zeichen aus Buchstaben, Ziffern, Leerzeichen und . _ / -')
  pick('trackingUrl', 'trackingUrl', (v) => {
    if (v.length > 300 || !/^https:\/\//i.test(v) || /\s/.test(v)) return false
    try { return new URL(v).protocol === 'https:' } catch { return false }
  }, 'Tracking-Link: nur https:// und höchstens 300 Zeichen')
  return { errors, data }
}

function logError(msg, e) {
  console.error(`[shop/orderMails] ${msg}: ${e && e.message ? e.message : e}`)
}

async function loadSettings() {
  try {
    return await getShopSettings()
  } catch (e) {
    logError('Einstellungen nicht ladbar', e)
    return {}
  }
}

/** Gültige Verlags-Adresse (shop_notify_email) oder ''. */
function notifyAddress(settings) {
  const n = oneLine(settings.shop_notify_email)
  return n && n.length <= 200 && EMAIL_RE.test(n) ? n : ''
}

/** afterPaid-Hook: Bestätigung (mit Rechnung/Downloads) an den Kunden, Benachrichtigung an shop_notify_email. Wirft nie. */
export async function sendPaidMails(order, { downloads, invoice } = {}) {
  let items = []
  try {
    items = await prisma.shopOrderItem.findMany({ where: { orderId: order.id } })
  } catch (e) {
    logError(`Positionen für Mails ${order.reference} nicht ladbar`, e)
  }
  const settings = await loadSettings()
  let attachments
  try {
    const a = await buildInvoiceAttachment(order)
    if (a) attachments = [a]
  } catch (e) {
    logError(`Rechnungsanhang ${order.reference} fehlgeschlagen`, e)
  }
  try {
    const mail = buildPaidMail(order, items, { downloads, invoice, hasAttachment: !!attachments })
    await sendMail(attachments ? { ...mail, attachments } : mail)
    await logOrderEvent(order.id, 'MAIL', 'Bestätigung gesendet')
  } catch (e) {
    logError(`Bestätigung ${order.reference} fehlgeschlagen`, e)
    await logOrderEvent(order.id, 'MAIL_ERROR', 'Bestätigung konnte nicht gesendet werden')
  }
  const notify = notifyAddress(settings)
  if (notify) {
    try {
      await sendMail({ to: notify, ...buildNotifyMail(order, items, shopLocale(settings)) })
    } catch (e) {
      logError(`Benachrichtigung ${order.reference} fehlgeschlagen`, e)
    }
  }
}

/** Versandmail an den Kunden (mit Sendungsdaten aus der Bestellung); wirft bei Fehler. */
export async function sendShippedMail(order) {
  await sendMail(buildShippedMail(order))
}

export async function sendRefundMail(order, refund) {
  await sendMail(buildRefundMail(order, refund))
}

/** links: [{ filename, url, expiresAt, maxDownloads }] (url relativ oder absolut); wirft bei Fehler. */
export async function sendDownloadsMail(order, links) {
  await sendMail(buildDownloadsMail(order, links))
}

/** kind: received | approved | rejected | received_goods | refunded; 'received' benachrichtigt zusätzlich den Verlag. */
export async function sendReturnMail(request, order, kind) {
  if (!RETURN_KINDS.includes(kind)) throw new Error(`Unbekannte Rückgabe-Mail: ${kind}`)
  await sendMail(buildReturnMail(request, order, kind))
  if (kind !== 'received') return
  const settings = await loadSettings()
  const notify = notifyAddress(settings)
  if (!notify) return
  try {
    await sendMail({ to: notify, ...buildReturnNotifyMail(request, order, shopLocale(settings)) })
  } catch (e) {
    logError(`Rückgabe-Benachrichtigung ${order.reference} fehlgeschlagen`, e)
  }
}

/** kind: confirm | notify; wirft bei Fehler. */
export async function sendStockAlertMail(alert, format, product, kind) {
  if (kind !== 'confirm' && kind !== 'notify') throw new Error(`Unbekannte Alarm-Mail: ${kind}`)
  await sendMail(buildStockAlertMail(alert, format, product, kind))
}

/** items: [{ sku, label?, title, stock }] an shop_notify_email; ohne Adresse oder Einträge passiert nichts. */
export async function sendLowStockMail(items) {
  if (!Array.isArray(items) || !items.length) return
  const settings = await loadSettings()
  const to = notifyAddress(settings)
  if (!to) return
  await sendMail({ to, ...buildLowStockMail(items, shopLocale(settings)) })
}
