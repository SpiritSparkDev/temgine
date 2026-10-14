// Bestell-Mails (Reintext, deutsch). Textbau ist rein; Versand nur in sendPaidMails/sendShippedMail.
// Vorbild: Polyfeder_Shop/src/OrderMails.php. Keine Rechtstexte, nur Platzhalter.
import { prisma } from '../prisma'
import { sendMail } from '../email'
import { SHOP_NOTIFY_EMAIL_KEY } from './keys'
import { formatEuro } from './money'

const eur = (cents) => formatEuro(cents || 0).replace(/\u00a0/g, ' ')
// Zeilenumbrüche raus (Header-Injection), Rest trimmen
const oneLine = (v) => String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim()
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

const addr = (a) => {
  const x = a && typeof a === 'object' ? a : {}
  return [x.name, x.street, `${x.zip || ''} ${x.city || ''}`.trim(), x.country].filter(Boolean).join('\n')
}

function taxNote(order) {
  const tb = order.taxBreakdown && typeof order.taxBreakdown === 'object' ? order.taxBreakdown : {}
  const parts = Object.keys(tb)
    .sort((a, b) => Number(a) - Number(b))
    .map((bp) => `${(Number(bp) / 100).toLocaleString('de-DE')} % MwSt.: ${eur(tb[bp])}`)
  return parts.length ? `Enthaltene MwSt.: ${parts.join(', ')}\n` : ''
}

function summary(order, items) {
  const lines = items.map((i) => `${i.qty} x ${i.title} (${i.label}): ${eur(i.qty * i.unitCents)}`)
  return (
    `Bestellnummer: ${order.reference}\n\n` +
    `${lines.join('\n')}\n\n` +
    `Zwischensumme: ${eur(order.subtotalCents)}\n` +
    `Versand: ${eur(order.shippingCents)}\n` +
    `Gesamtsumme inkl. MwSt.: ${eur(order.totalCents)}\n` +
    taxNote(order) +
    `\nRechnungsadresse:\n${addr(order.billing)}\n\n` +
    `Lieferadresse:\n${addr(order.shipping)}\n\n` +
    `E-Mail: ${order.email}\n`
  )
}

/** Bestätigung an den Kunden: { to, subject, text } */
export function buildPaidMail(order, items) {
  return {
    to: oneLine(order.email),
    subject: `Bestellbestätigung ${oneLine(order.reference)}`,
    text:
      `Vielen Dank für deine Bestellung!\n\n${summary(order, items)}\n` +
      `[PLATZHALTER – Widerrufsbelehrung folgt]\n`,
  }
}

/** Benachrichtigung an den Verlag (Empfänger setzt der Aufrufer). */
export function buildNotifyMail(order, items) {
  return {
    subject: `Neue Bestellung ${oneLine(order.reference)}`,
    text: `Neue bezahlte Bestellung.\n\n${summary(order, items)}`,
  }
}

export function buildShippedMail(order) {
  const ref = oneLine(order.reference)
  return {
    to: oneLine(order.email),
    subject: `Deine Bestellung ${ref} wurde versendet`,
    text: `Deine Bestellung ${ref} wurde versendet.\n`,
  }
}

function logError(msg, e) {
  console.error(`[shop/orderMails] ${msg}: ${e && e.message ? e.message : e}`)
}

/** afterPaid-Hook: Bestätigung an den Kunden, Benachrichtigung an shop_notify_email. Jeder Versand einzeln abgesichert. */
export async function sendPaidMails(order) {
  let items = []
  let notify = ''
  try {
    items = await prisma.shopOrderItem.findMany({ where: { orderId: order.id } })
    const s = await prisma.setting.findUnique({ where: { key: SHOP_NOTIFY_EMAIL_KEY } })
    notify = oneLine(s && s.value)
  } catch (e) {
    logError(`Daten für Mails ${order.reference} nicht ladbar`, e)
  }
  try {
    await sendMail(buildPaidMail(order, items))
  } catch (e) {
    logError(`Bestätigung ${order.reference} fehlgeschlagen`, e)
  }
  if (notify && notify.length <= 200 && EMAIL_RE.test(notify)) {
    try {
      await sendMail({ to: notify, ...buildNotifyMail(order, items) })
    } catch (e) {
      logError(`Benachrichtigung ${order.reference} fehlgeschlagen`, e)
    }
  }
}

/** Versandmail an den Kunden; wirft bei Fehler (der Aufrufer meldet mailError). */
export async function sendShippedMail(order) {
  await sendMail(buildShippedMail(order))
}
