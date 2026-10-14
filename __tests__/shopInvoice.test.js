/**
 * __tests__/shopInvoice.test.js
 * lib/shop/invoice.js: Nummernvergabe, Beträge, MwSt.-Aufschlüsselung, PDF
 *
 * @jest-environment node
 */

jest.disableAutomock()

const mockTx = { shopInvoice: { create: jest.fn() } }
const mockPrisma = {
  shopOrder: { findUnique: jest.fn() },
  shopInvoice: { findUnique: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockTx)),
}
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../lib/shop/counters', () => ({ nextCounter: jest.fn() }))
jest.mock('../lib/shop/events', () => ({ logOrderEvent: jest.fn() }))
jest.mock('../lib/shop/settingsStore', () => ({
  getShopSettings: jest.fn(),
  sellerData: jest.requireActual('../lib/shop/settingsStore').sellerData,
}))

const { PDFDocument } = require('pdf-lib')
const { nextCounter } = require('../lib/shop/counters')
const { logOrderEvent } = require('../lib/shop/events')
const { getShopSettings, sellerData } = require('../lib/shop/settingsStore')
const { issueInvoice, buildInvoicePdf, buildInvoiceAttachment, renderInvoice, buildVatSummary, bpLabel, SELLER_PLACEHOLDER } = require('../lib/shop/invoice')

const SETTINGS = {
  shop_seller_name: 'Muster Verlag', shop_seller_address: 'Hauptstr. 1\n12345 Köln', shop_seller_vat_id: 'DE123',
  shop_seller_bank: 'IBAN DE00 1234', shop_seller_footer: 'Geschäftsführer: A. B.', shop_invoice_prefix: 'RE',
}
const year = new Date().getFullYear()

function order(over = {}) {
  return {
    id: 'o1', reference: 'ORD-2026-000001', status: 'PAID', locale: 'de', currency: 'EUR',
    billing: { name: 'Jürgen Müller', street: 'Straße 5', zip: '50667', city: 'Köln', country: 'DE' },
    items: [
      { id: 'a', sku: 'A', title: 'Buch', label: 'Hardcover', qty: 2, unitCents: 2000, taxRateBp: 700, discountCents: 400, bundleItems: null },
      { id: 'b', sku: 'B', title: 'Set', label: 'Bündel', qty: 1, unitCents: 3000, taxRateBp: 1900, discountCents: 0,
        bundleItems: [{ qty: 1, title: 'Würfel', label: 'Satz' }, { qty: 2, title: 'Karten', label: 'PDF' }] },
    ],
    subtotalCents: 7000, discountCents: 400, shippingCents: 500, shippingTaxBp: 1900, totalCents: 7100,
    couponCode: 'SOMMER', taxBreakdown: { 700: 236, 1900: 1108 }, refundedCents: 0, payments: [{ status: 'PAID', provider: 'STRIPE' }],
    invoice: null, ...over,
  }
}

beforeEach(() => {
  jest.resetAllMocks()
  mockPrisma.$transaction.mockImplementation((fn) => fn(mockTx))
  getShopSettings.mockResolvedValue(SETTINGS)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

describe('issueInvoice', () => {
  test('returns existing invoice without a new number', async () => {
    const inv = { number: 'RE-1' }
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order({ invoice: inv }))
    expect(await issueInvoice('o1')).toBe(inv)
    expect(nextCounter).not.toHaveBeenCalled()
  })

  test.each(['PENDING', 'FAILED', 'CANCELLED'])('no invoice for %s', async (status) => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order({ status }))
    expect(await issueInvoice('o1')).toBeNull()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  test('unknown order -> null', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(null)
    expect(await issueInvoice('x')).toBeNull()
  })

  test('creates number inside the transaction with snapshot and event', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order())
    nextCounter.mockResolvedValue(42)
    mockTx.shopInvoice.create.mockImplementation(async ({ data }) => ({ ...data }))
    const inv = await issueInvoice('o1')
    expect(nextCounter).toHaveBeenCalledWith(mockTx, `invoice-${year}`)
    expect(inv.number).toBe(`RE-${year}-000042`)
    expect(inv.data.seller.name).toBe('Muster Verlag')
    expect(inv.data.paymentProvider).toBe('STRIPE')
    expect(inv.data.currency).toBe('EUR')
    expect(logOrderEvent).toHaveBeenCalledWith('o1', 'INVOICE', expect.stringContaining(inv.number))
  })

  test('REFUNDED orders get an invoice too; custom prefix', async () => {
    getShopSettings.mockResolvedValue({ ...SETTINGS, shop_invoice_prefix: 'R' })
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order({ status: 'REFUNDED' }))
    nextCounter.mockResolvedValue(1)
    mockTx.shopInvoice.create.mockImplementation(async ({ data }) => data)
    expect((await issueInvoice('o1')).number).toBe(`R-${year}-000001`)
  })

  test('parallel issue: unique conflict re-reads the existing invoice, no event', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order())
    nextCounter.mockResolvedValue(7)
    mockTx.shopInvoice.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    mockPrisma.shopInvoice.findUnique.mockResolvedValue({ number: 'RE-WINNER' })
    expect(await issueInvoice('o1')).toEqual({ number: 'RE-WINNER' })
    expect(logOrderEvent).not.toHaveBeenCalled()
  })

  test('other errors are thrown', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order())
    nextCounter.mockResolvedValue(7)
    mockTx.shopInvoice.create.mockRejectedValue(new Error('db down'))
    await expect(issueInvoice('o1')).rejects.toThrow('db down')
  })
})

describe('amounts and VAT summary', () => {
  test('bpLabel', () => {
    expect(bpLabel(700)).toBe('7 %')
    expect(bpLabel(1950)).toBe('19,5 %')
    expect(bpLabel(700, 'en')).toBe('7%')
  })

  test('gross per rate after discount, shipping VAT included, net = gross - vat', () => {
    expect(buildVatSummary(order())).toEqual([
      { bp: 700, grossCents: 3600, vatCents: 236, netCents: 3364 },
      { bp: 1900, grossCents: 3500, vatCents: 1108, netCents: 2392 },
    ])
  })

  test('shipping without rate is not part of the summary; missing rate is computed', () => {
    expect(buildVatSummary(order({ shippingTaxBp: null, taxBreakdown: {} }))).toEqual([
      { bp: 700, grossCents: 3600, vatCents: 236, netCents: 3364 },
      { bp: 1900, grossCents: 3000, vatCents: 479, netCents: 2521 },
    ])
  })
})

describe('renderInvoice', () => {
  const invoice = { number: 'RE-2026-000042', issuedAt: new Date('2026-03-05T10:00:00Z'), data: { seller: sellerData(SETTINGS), paymentProvider: 'STRIPE', currency: 'EUR' } }
  const texts = (seen) => seen.map((t) => t.text)

  test('valid PDF with all expected texts (German, umlauts, no NBSP)', async () => {
    const seen = []
    const buf = await renderInvoice(order(), invoice, { onText: (t) => seen.push(t) })
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect((await PDFDocument.load(buf)).getPageCount()).toBe(1)
    const all = texts(seen)
    for (const expected of ['Muster Verlag', 'Rechnung', 'RE-2026-000042', '05.03.2026', 'ORD-2026-000001', 'Jürgen Müller', '50667 Köln',
      'Buch – Hardcover', 'Würfel – Satz', '40,00 €', '-4,00 €', 'Rabatt (Gutschein SOMMER)', 'Versand (inkl. 19 % MwSt.)', '5,00 €', 'Gesamtsumme', '71,00 €',
      'Enthaltene Mehrwertsteuer', '33,64 €', '2,36 €', 'Seite 1 von 1']) {
      expect(all.some((t) => t.includes(expected))).toBe(true)
    }
    expect(all.some((t) => / /.test(t))).toBe(false)
    expect(all.some((t) => t.includes('Bezahlt über Stripe'))).toBe(true)
    expect(all.some((t) => t.includes('USt-IdNr.: DE123') && !t.includes('?'))).toBe(true)
    expect(all.some((t) => t.includes('IBAN DE00 1234'))).toBe(true)
    expect(all.some((t) => t.includes('Geschäftsführer'))).toBe(true)
    expect(all.some((t) => t.includes('PLATZHALTER'))).toBe(false)
  })

  test('missing seller data -> placeholder, nothing invented', async () => {
    const seen = []
    await renderInvoice(order(), { ...invoice, data: { seller: { name: '', address: '', invoicePrefix: 'RE' }, currency: 'EUR' } }, { onText: (t) => seen.push(t) })
    const joined = texts(seen).join(' ')
    expect(joined).toContain('[PLATZHALTER')
    expect(joined).toContain('Absenderdaten in den Shop-Einstellungen eintragen]')
    expect(SELLER_PLACEHOLDER).toBe('[PLATZHALTER – Absenderdaten in den Shop-Einstellungen eintragen]')
    expect(joined).not.toContain('Muster')
    expect(joined).not.toContain('USt-IdNr')
  })

  test('English locale, no shipping rate, refund note', async () => {
    const seen = []
    await renderInvoice(order({ locale: 'en', shippingTaxBp: null, refundedCents: 1000 }), invoice, { onText: (t) => seen.push(t) })
    const all = texts(seen)
    expect(all).toContain('Invoice')
    expect(all).toContain('Shipping')
    expect(all).toContain('Total')
    expect(all.some((t) => t.includes('Already refunded'))).toBe(true)
    expect(all).toContain('05/03/2026')
  })

  test('many items -> several pages, page numbers on each page', async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ id: `i${i}`, sku: `S${i}`, title: `Artikel ${i}`, label: 'Std', qty: 1, unitCents: 100, taxRateBp: 700, discountCents: 0, bundleItems: null }))
    const seen = []
    const buf = await renderInvoice(order({ items, subtotalCents: 6000, discountCents: 0, couponCode: null }), invoice, { onText: (t) => seen.push(t) })
    const pages = (await PDFDocument.load(buf)).getPageCount()
    expect(pages).toBeGreaterThan(1)
    expect(texts(seen)).toContain(`Seite ${pages} von ${pages}`)
    expect(texts(seen).some((t) => t.includes('Fortsetzung'))).toBe(true)
  })

  test('characters outside WinAnsi are replaced by ?', async () => {
    const seen = []
    await renderInvoice(order({ billing: { name: 'Zoë 日本', street: 's', zip: '1', city: 'c', country: 'DE' } }), invoice, { onText: (t) => seen.push(t) })
    expect(texts(seen)).toContain('Zoë ??')
  })
})

describe('buildInvoicePdf / buildInvoiceAttachment', () => {
  test('builds PDF for a paid order (issues the invoice on demand)', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order())
    nextCounter.mockResolvedValue(5)
    mockTx.shopInvoice.create.mockImplementation(async ({ data }) => ({ ...data, issuedAt: new Date() }))
    const buf = await buildInvoicePdf('o1')
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
    expect((await PDFDocument.load(buf)).getPageCount()).toBeGreaterThan(0)
  })

  test('unpaid -> null', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order({ status: 'PENDING' }))
    expect(await buildInvoicePdf('o1')).toBeNull()
    expect(await buildInvoiceAttachment({ id: 'o1' })).toBeNull()
  })

  test('attachment has name, type and buffer', async () => {
    mockPrisma.shopOrder.findUnique.mockResolvedValue(order({ invoice: { number: 'RE-2026-000009', issuedAt: new Date(), data: { seller: {}, currency: 'EUR' } } }))
    const a = await buildInvoiceAttachment({ id: 'o1' })
    expect(a.filename).toBe('Rechnung-RE-2026-000009.pdf')
    expect(a.contentType).toBe('application/pdf')
    expect(Buffer.isBuffer(a.content)).toBe(true)
  })

  test('errors are caught -> null', async () => {
    mockPrisma.shopOrder.findUnique.mockRejectedValue(new Error('boom'))
    expect(await buildInvoiceAttachment({ id: 'o1' })).toBeNull()
  })
})
