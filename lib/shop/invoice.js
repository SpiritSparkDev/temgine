import { prisma } from '../prisma'
import { nextCounter } from './counters'
import { logOrderEvent } from './events'
import { getShopSettings, sellerData } from './settingsStore'
import { formatMoney, vatIncluded } from './money'
import { createPdfWriter } from './pdf'

export const INVOICE_STATUSES = ['PAID', 'SHIPPED', 'REFUNDED']
export const SELLER_PLACEHOLDER = '[PLATZHALTER – Absenderdaten in den Shop-Einstellungen eintragen]'

// Eigenes kleines Wörterbuch (Rechnung ist ein Dokument, keine Oberfläche)
const DICT = {
  de: {
    invoice: 'Rechnung', number: 'Rechnungsnummer', date: 'Rechnungsdatum', order: 'Bestellnummer',
    pos: 'Pos.', desc: 'Beschreibung', qty: 'Menge', unit: 'Einzelpreis', vat: 'MwSt.', sum: 'Summe',
    subtotal: 'Zwischensumme', discount: 'Rabatt', coupon: 'Gutschein', shipping: 'Versand',
    shippingVat: 'Versand (inkl. {rate} MwSt.)', total: 'Gesamtsumme', vatTitle: 'Enthaltene Mehrwertsteuer',
    rate: 'Satz', net: 'Netto', vatAmount: 'MwSt.', gross: 'Brutto', refunded: 'Bereits erstattet: {amount}.',
    page: 'Seite {n} von {m}', vatId: 'USt-IdNr.: {v}', taxNumber: 'Steuernummer: {v}', bank: 'Bankverbindung: {v}',
    paidVia: 'Bezahlt über {p}.', continued: 'Rechnung {n} – Fortsetzung',
  },
  en: {
    invoice: 'Invoice', number: 'Invoice number', date: 'Invoice date', order: 'Order number',
    pos: 'No.', desc: 'Description', qty: 'Qty', unit: 'Unit price', vat: 'VAT', sum: 'Total',
    subtotal: 'Subtotal', discount: 'Discount', coupon: 'Coupon', shipping: 'Shipping',
    shippingVat: 'Shipping (incl. {rate} VAT)', total: 'Total', vatTitle: 'VAT included',
    rate: 'Rate', net: 'Net', vatAmount: 'VAT', gross: 'Gross', refunded: 'Already refunded: {amount}.',
    page: 'Page {n} of {m}', vatId: 'VAT ID: {v}', taxNumber: 'Tax number: {v}', bank: 'Bank details: {v}',
    paidVia: 'Paid via {p}.', continued: 'Invoice {n} – continued',
  },
}

const PROVIDER_LABEL = { SUMUP: 'SumUp', STRIPE: 'Stripe', PAYPAL: 'PayPal' }

function tr(locale, key, vars = {}) {
  const s = (DICT[locale] || DICT.de)[key] ?? DICT.de[key] ?? key
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : String(vars[k])))
}

/** 700 -> '7 %' (de) / '7%' (en); 1950 -> '19,5 %' */
export function bpLabel(bp, locale = 'de') {
  const n = bp / 100
  return locale === 'en' ? `${n}%` : `${String(n).replace('.', ',')} %`
}

/** Steuer-Aufschlüsselung je Satz: [{ bp, grossCents, vatCents, netCents }] aus Positionssummen nach Rabatt (+ Versand, wenn Satz gesetzt). */
export function buildVatSummary(order) {
  const gross = new Map()
  const add = (bp, c) => gross.set(bp, (gross.get(bp) || 0) + c)
  for (const i of order.items || []) add(i.taxRateBp, i.unitCents * i.qty - (i.discountCents || 0))
  if (order.shippingTaxBp != null && order.shippingCents > 0) add(order.shippingTaxBp, order.shippingCents)
  const bd = order.taxBreakdown || {}
  return [...gross.entries()].sort((a, b) => a[0] - b[0]).map(([bp, grossCents]) => {
    const given = bd[String(bp)]
    const vatCents = Number.isInteger(given) ? given : vatIncluded(grossCents, bp)
    return { bp, grossCents, vatCents, netCents: grossCents - vatCents }
  })
}

/** Rechnung zur Bestellung ausstellen (idempotent). null, wenn Bestellung fehlt oder nicht bezahlt ist. */
export async function issueInvoice(orderId) {
  const order = await prisma.shopOrder.findUnique({ where: { id: orderId }, include: { invoice: true, payments: true } })
  if (!order) return null
  if (order.invoice) return order.invoice
  if (!INVOICE_STATUSES.includes(order.status)) return null

  const settings = await getShopSettings()
  const seller = sellerData(settings)
  const paid = (order.payments || []).find((p) => p.status === 'PAID')
  const year = new Date().getFullYear()
  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const n = await nextCounter(tx, `invoice-${year}`)
      const number = `${seller.invoicePrefix}-${year}-${String(n).padStart(6, '0')}`
      return tx.shopInvoice.create({
        data: { orderId: order.id, number, data: { seller, paymentProvider: paid ? paid.provider : null, currency: order.currency } },
      })
    })
    await logOrderEvent(order.id, 'INVOICE', `Rechnung ${invoice.number} ausgestellt`)
    return invoice
  } catch (e) {
    // Parallel ausgestellt (Unique auf orderId): die bestehende Rechnung zurückgeben
    if (e && e.code === 'P2002') {
      const existing = await prisma.shopInvoice.findUnique({ where: { orderId: order.id } })
      if (existing) return existing
    }
    throw e
  }
}

function fmtDate(d, locale) {
  const x = new Date(d)
  const p = (n) => String(n).padStart(2, '0')
  return locale === 'en' ? `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}` : `${p(x.getDate())}.${p(x.getMonth() + 1)}.${x.getFullYear()}`
}

const COL = { pos: 50, desc: 76, descW: 215, qty: 335, unit: 410, vat: 458, sum: 545 }

/** Zeichnet die Rechnung; order = ShopOrder inkl. items. Liefert Buffer. `onText` siehe createPdfWriter. */
export async function renderInvoice(order, invoice, { onText = null } = {}) {
  const locale = order.locale === 'en' ? 'en' : 'de'
  const L = (k, v) => tr(locale, k, v)
  const money = (c) => formatMoney(c, order.currency, locale)
  const data = invoice.data || {}
  const seller = data.seller || {}
  const w = await createPdfWriter({ onText })
  const R = w.width - w.margin

  // Absenderblock
  let y = w.top
  if (seller.name && seller.address) {
    w.text(seller.name, { x: w.margin, y, size: 12, bold: true })
    y -= 14
    for (const line of w.wrap(seller.address, { size: 9, maxWidth: 250 })) { w.text(line, { x: w.margin, y, size: 9 }); y -= 11 }
    const contact = [seller.email, seller.phone].filter(Boolean).join(' · ')
    if (contact) { w.text(contact, { x: w.margin, y, size: 9 }); y -= 11 }
  } else {
    for (const line of w.wrap(SELLER_PLACEHOLDER, { size: 9, bold: true, maxWidth: 300 })) { w.text(line, { x: w.margin, y, size: 9, bold: true }); y -= 11 }
  }

  y -= 24
  w.text(L('invoice'), { x: w.margin, y, size: 20, bold: true })
  y -= 34

  // Empfänger links, Kopfdaten rechts
  const b = order.billing || {}
  const recipient = [b.name, b.street, [b.zip, b.city].filter(Boolean).join(' '), b.country].filter(Boolean)
  let ry = y
  for (const line of recipient) { w.text(line, { x: w.margin, y: ry, size: 10 }); ry -= 13 }
  let iy = y
  for (const [k, v] of [['number', invoice.number], ['date', fmtDate(invoice.issuedAt, locale)], ['order', order.reference]]) {
    w.text(`${L(k)}:`, { x: 340, y: iy, size: 9 })
    w.text(v, { x: R, y: iy, size: 9, bold: true, align: 'right' })
    iy -= 13
  }
  w.y = Math.min(ry, iy) - 24

  // Tabelle
  const header = () => {
    const hy = w.y
    w.text(L('pos'), { x: COL.pos, y: hy, size: 9, bold: true })
    w.text(L('desc'), { x: COL.desc, y: hy, size: 9, bold: true })
    w.text(L('qty'), { x: COL.qty, y: hy, size: 9, bold: true, align: 'right' })
    w.text(L('unit'), { x: COL.unit, y: hy, size: 9, bold: true, align: 'right' })
    w.text(L('vat'), { x: COL.vat, y: hy, size: 9, bold: true, align: 'right' })
    w.text(L('sum'), { x: COL.sum, y: hy, size: 9, bold: true, align: 'right' })
    w.rule(w.margin, R, hy - 4)
    w.y = hy - 18
  }
  const newPage = () => {
    w.text(L('continued', { n: invoice.number }), { x: w.margin, y: w.y, size: 9, gray: 0.35 })
    w.y -= 24
    header()
  }
  header()

  ;(order.items || []).forEach((it, idx) => {
    const descLines = w.wrap(`${it.title} – ${it.label}`, { size: 9.5, maxWidth: COL.descW })
    const bundle = Array.isArray(it.bundleItems) ? it.bundleItems : []
    const bundleLines = bundle.flatMap((bi) => w.wrap(`${bi.qty} x ${bi.title} – ${bi.label}`, { size: 8, maxWidth: COL.descW - 10 }))
    const h = descLines.length * 12 + bundleLines.length * 10 + 6
    if (w.ensure(h)) newPage()
    const top = w.y
    w.text(String(idx + 1), { x: COL.pos, y: top, size: 9.5 })
    descLines.forEach((l, i) => w.text(l, { x: COL.desc, y: top - i * 12, size: 9.5 }))
    w.text(String(it.qty), { x: COL.qty, y: top, size: 9.5, align: 'right' })
    w.text(money(it.unitCents), { x: COL.unit, y: top, size: 9.5, align: 'right' })
    w.text(bpLabel(it.taxRateBp, locale), { x: COL.vat, y: top, size: 9.5, align: 'right' })
    w.text(money(it.unitCents * it.qty), { x: COL.sum, y: top, size: 9.5, align: 'right' })
    let by = top - descLines.length * 12
    bundleLines.forEach((l) => { w.text(l, { x: COL.desc + 10, y: by, size: 8, gray: 0.35 }); by -= 10 })
    w.y = by - 6
  })

  // Summen
  if (w.ensure(120)) newPage()
  w.rule(w.margin, R, w.y + 6)
  const row = (label, value, boldRow = false) => {
    w.text(label, { x: 340, y: w.y, size: 9.5, bold: boldRow })
    w.text(value, { x: R, y: w.y, size: 9.5, bold: boldRow, align: 'right' })
    w.y -= 14
  }
  w.y -= 8
  row(L('subtotal'), money(order.subtotalCents))
  if (order.discountCents > 0) row(order.couponCode ? `${L('discount')} (${L('coupon')} ${order.couponCode})` : L('discount'), `-${money(order.discountCents)}`)
  row(order.shippingTaxBp != null ? L('shippingVat', { rate: bpLabel(order.shippingTaxBp, locale) }) : L('shipping'), money(order.shippingCents))
  w.rule(340, R, w.y + 10)
  w.y -= 2
  row(L('total'), money(order.totalCents), true)

  // MwSt.-Aufschlüsselung
  const vat = buildVatSummary(order)
  if (vat.length) {
    if (w.ensure(30 + vat.length * 13)) newPage()
    w.y -= 14
    w.text(L('vatTitle'), { x: w.margin, y: w.y, size: 9.5, bold: true })
    w.y -= 14
    w.text(L('rate'), { x: w.margin, y: w.y, size: 9, bold: true })
    w.text(L('net'), { x: 240, y: w.y, size: 9, bold: true, align: 'right' })
    w.text(L('vatAmount'), { x: 340, y: w.y, size: 9, bold: true, align: 'right' })
    w.text(L('gross'), { x: 440, y: w.y, size: 9, bold: true, align: 'right' })
    w.y -= 13
    for (const v of vat) {
      w.text(bpLabel(v.bp, locale), { x: w.margin, y: w.y, size: 9 })
      w.text(money(v.netCents), { x: 240, y: w.y, size: 9, align: 'right' })
      w.text(money(v.vatCents), { x: 340, y: w.y, size: 9, align: 'right' })
      w.text(money(v.grossCents), { x: 440, y: w.y, size: 9, align: 'right' })
      w.y -= 13
    }
  }

  const notes = []
  if (data.paymentProvider) notes.push(L('paidVia', { p: PROVIDER_LABEL[data.paymentProvider] || data.paymentProvider }))
  if (order.refundedCents > 0) notes.push(L('refunded', { amount: money(order.refundedCents) }))
  if (notes.length) {
    w.y -= 10
    for (const line of w.wrap(notes.join(' '), { size: 9, maxWidth: R - w.margin })) {
      if (w.ensure(12)) newPage()
      w.text(line, { x: w.margin, y: w.y, size: 9 })
      w.y -= 12
    }
  }

  // Fußzeile + Seitenzahlen
  const footerLines = [
    [seller.name, ...(seller.address ? [seller.address.split('\n').join(', ')] : [])].filter(Boolean).join(' · '),
    [seller.vatId && L('vatId', { v: seller.vatId }), seller.taxNumber && L('taxNumber', { v: seller.taxNumber })].filter(Boolean).join(' · '),
    seller.bank && L('bank', { v: seller.bank.split('\n').join(' | ') }),
    seller.footer && seller.footer.split('\n').join(' | '),
  ].filter(Boolean)
  return w.finish((wr, n, m) => {
    let fy = wr.margin + 50
    const wrapped = footerLines.flatMap((l) => wr.wrap(l, { size: 7.5, maxWidth: wr.width - 2 * wr.margin })).slice(0, 5)
    wr.rule(wr.margin, wr.width - wr.margin, fy + 10)
    for (const l of wrapped) { wr.text(l, { x: wr.margin, y: fy, size: 7.5, gray: 0.3 }); fy -= 9 }
    wr.text(L('page', { n, m }), { x: wr.width - wr.margin, y: wr.margin - 4, size: 8, align: 'right', gray: 0.3 })
  })
}

/** PDF als Buffer; stellt die Rechnung bei Bedarf aus. null, wenn die Bestellung fehlt oder nicht bezahlt ist. */
export async function buildInvoicePdf(orderId, opts = {}) {
  const invoice = await issueInvoice(orderId)
  if (!invoice) return null
  const order = await prisma.shopOrder.findUnique({ where: { id: orderId }, include: { items: { orderBy: { id: 'asc' } } } })
  if (!order) return null
  return renderInvoice(order, invoice, opts)
}

/** E-Mail-Anhang { filename, content, contentType } oder null (Fehler werden geloggt, nie geworfen). */
export async function buildInvoiceAttachment(order) {
  try {
    const invoice = await issueInvoice(order.id)
    if (!invoice) return null
    const content = await buildInvoicePdf(order.id)
    if (!content) return null
    return { filename: `Rechnung-${invoice.number.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`, content, contentType: 'application/pdf' }
  } catch (e) {
    console.error('[shop/invoice] Anhang nicht erstellt:', e.message)
    return null
  }
}
