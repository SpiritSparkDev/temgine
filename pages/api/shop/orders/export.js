import { prisma } from '../../../../lib/prisma'
import { requireAuth, PERMISSIONS } from '../../../../lib/auth'
import { logAudit } from '../../../../lib/audit'
import { requireShopEnabled } from '../../../../lib/shop/guard'
import { toCsv, formatCents } from '../../../../lib/shop/csv'

const STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'CANCELLED', 'FAILED', 'REFUNDED']
const MAX_ROWS = 10000
const MAX_DAYS = 366
const DAY = 24 * 60 * 60 * 1000

// Datum YYYY-MM-DD als lokaler Tag (Serverzeitzone); ungültige Kalendertage (31.02.) -> null
function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '')
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null
}

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const percent = (bp) => String(bp / 100).replace('.', ',')
const bad = (res, error) => res.status(400).json({ error, code: 'VALIDATION_ERROR' })

/** GET /api/shop/orders/export?status=&from=&to=&detail=items – CSV (SHOP_ORDERS_VIEW). Datumsfilter über paidAt, sonst createdAt (Serverzeitzone). */
export default async function handler(req, res) {
  try {
    const auth = await requireAuth(req, res, PERMISSIONS.SHOP_ORDERS_VIEW)
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error })
    res.setHeader('Cache-Control', 'no-store')
    if (!(await requireShopEnabled(res))) return
    if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' })

    const { status, from, to, detail } = req.query || {}
    const where = {}
    if (status) {
      if (!STATUSES.includes(status)) return bad(res, 'Ungültiger Status')
      where.status = status
    }
    if (detail && detail !== 'items') return bad(res, 'Ungültiger Wert für detail')
    const fromD = from ? parseDay(from) : null
    const toD = to ? parseDay(to) : null
    if ((from && !fromD) || (to && !toD)) return bad(res, 'Datum bitte als JJJJ-MM-TT angeben')
    if (fromD && toD) {
      if (toD < fromD) return bad(res, 'Das Enddatum liegt vor dem Startdatum')
      if (Math.round((toD - fromD) / DAY) + 1 > MAX_DAYS) return bad(res, `Der Zeitraum darf höchstens ${MAX_DAYS} Tage umfassen`)
    }
    const range = {}
    if (fromD) range.gte = fromD
    if (toD) range.lt = new Date(toD.getFullYear(), toD.getMonth(), toD.getDate() + 1)
    if (fromD || toD) where.OR = [{ paidAt: range }, { paidAt: null, createdAt: range }]

    const orders = await prisma.shopOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      include: {
        invoice: { select: { number: true } },
        payments: { select: { provider: true, status: true }, orderBy: { createdAt: 'asc' } },
        ...(detail === 'items' ? { items: true } : {}),
      },
    })

    const num = (key, header) => ({ key, header, number: true })
    let csv
    if (detail === 'items') {
      const rows = []
      for (const o of orders) {
        for (const it of o.items || []) {
          rows.push({
            reference: o.reference, sku: it.sku, title: it.title, label: it.label, qty: it.qty,
            unit: formatCents(it.unitCents), discount: formatCents(it.discountCents), tax: percent(it.taxRateBp),
            line: formatCents(it.unitCents * it.qty - it.discountCents),
          })
        }
      }
      csv = toCsv(rows, [
        { key: 'reference', header: 'Bestellnummer' }, { key: 'sku', header: 'SKU' }, { key: 'title', header: 'Titel' },
        { key: 'label', header: 'Format' }, num('qty', 'Menge'), num('unit', 'Einzelpreis'), num('discount', 'Rabatt'),
        num('tax', 'MwSt.-Satz (%)'), num('line', 'Zeilensumme'),
      ])
    } else {
      // eine MwSt.-Spalte je im Ergebnis vorkommendem Satz (aufsteigend)
      const rates = [...new Set(orders.flatMap((o) => Object.keys(o.taxBreakdown || {}).map(Number)))].filter(Number.isFinite).sort((a, b) => a - b)
      const rows = orders.map((o) => {
        const pay = (o.payments || []).find((p) => p.status === 'PAID') || (o.payments || [])[0]
        const row = {
          reference: o.reference, date: isoDay(new Date(o.paidAt || o.createdAt)), status: o.status, email: o.email,
          name: o.billing?.name || '', country: o.billing?.country || '',
          subtotal: formatCents(o.subtotalCents), discount: formatCents(o.discountCents), coupon: o.couponCode || '',
          shipping: formatCents(o.shippingCents), total: formatCents(o.totalCents),
          currency: o.currency, provider: pay?.provider || '', invoice: o.invoice?.number || '',
          refunded: formatCents(o.refundedCents), tracking: o.trackingNumber || '',
        }
        for (const r of rates) row[`tax${r}`] = o.taxBreakdown?.[String(r)] === undefined ? '' : formatCents(o.taxBreakdown[String(r)])
        return row
      })
      csv = toCsv(rows, [
        { key: 'reference', header: 'Bestellnummer' }, { key: 'date', header: 'Datum' }, { key: 'status', header: 'Status' },
        { key: 'email', header: 'E-Mail' }, { key: 'name', header: 'Name' }, { key: 'country', header: 'Land' },
        num('subtotal', 'Zwischensumme'), num('discount', 'Rabatt'), { key: 'coupon', header: 'Gutschein' },
        num('shipping', 'Versand'), num('total', 'Gesamt'),
        ...rates.map((r) => num(`tax${r}`, `MwSt. ${percent(r)} %`)),
        { key: 'currency', header: 'Währung' }, { key: 'provider', header: 'Zahlungsart' }, { key: 'invoice', header: 'Rechnungsnummer' },
        num('refunded', 'Erstattet'), { key: 'tracking', header: 'Sendungsnummer' },
      ])
    }

    await logAudit({ action: 'shop.orders.export', resource: 'shop-order', userId: auth.user?.id, details: { status: status || null, from: from || null, to: to || null, detail: detail || null, rows: orders.length } })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="bestellungen-${isoDay(new Date())}.csv"`)
    return res.status(200).send('﻿' + csv)
  } catch (e) {
    console.error('[/api/shop/orders/export Error]', e.message)
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' })
  }
}
