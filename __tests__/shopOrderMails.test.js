/**
 * __tests__/shopOrderMails.test.js
 * Textbau (rein) und Versand der Bestell-Mails (de/en).
 */

jest.disableAutomock()

const mockPrisma = { shopOrderItem: { findMany: jest.fn() }, setting: { findMany: jest.fn() } }
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../lib/email', () => ({ sendMail: jest.fn() }))
jest.mock('../lib/shop/events', () => ({ logOrderEvent: jest.fn() }))
jest.mock('../lib/shop/invoice', () => ({ buildInvoiceAttachment: jest.fn() }))

const { sendMail } = require('../lib/email')
const { logOrderEvent } = require('../lib/shop/events')
const { buildInvoiceAttachment } = require('../lib/shop/invoice')
const M = require('../lib/shop/orderMails')
const { buildPaidMail, buildNotifyMail, buildShippedMail, sendPaidMails, sendShippedMail } = M

const addr = { name: 'Max Muster', street: 'Weg 1', zip: '12345', city: 'Stadt', country: 'DE' }
const order = {
  id: 'o1', reference: 'ORD-2026-000001', email: 'kunde@example.com', billing: addr, shipping: addr, currency: 'EUR', locale: 'de',
  subtotalCents: 4990, shippingCents: 500, totalCents: 5490, taxBreakdown: { '700': 359 },
}
const items = [{ title: 'Dark Space', label: 'Hardcover', qty: 1, unitCents: 4990 }]
const BASE = 'https://shop.example.com'

function settings(map) {
  mockPrisma.setting.findMany.mockResolvedValue(Object.entries(map).map(([key, value]) => ({ key, value })))
}

beforeEach(() => {
  jest.resetAllMocks()
  process.env.NEXTAUTH_URL = BASE
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockPrisma.shopOrderItem.findMany.mockResolvedValue(items)
  settings({ shop_notify_email: 'verlag@example.com' })
  sendMail.mockResolvedValue()
  buildInvoiceAttachment.mockResolvedValue(null)
})

describe('mail text', () => {
  test('paid mail (de) has amounts, tax note, addresses and legal placeholder', () => {
    const m = buildPaidMail(order, items)
    expect(m.to).toBe('kunde@example.com')
    expect(m.subject).toBe('Bestellbestätigung ORD-2026-000001')
    expect(m.text).toContain('1 x Dark Space (Hardcover): 49,90 €')
    expect(m.text).toContain('Gesamtsumme inkl. MwSt.: 54,90 €')
    expect(m.text).toContain('7 % MwSt.: 3,59 €')
    expect(m.text).toContain('Rechnungsadresse:\nMax Muster\nWeg 1\n12345 Stadt\nDE')
    expect(m.text).toContain('[PLATZHALTER – Widerrufsbelehrung folgt]')
    expect(m.text).not.toContain(String.fromCharCode(160))
    expect(m.text).not.toContain('Rabatt')
  })

  test('paid mail (en) uses English texts and currency', () => {
    const m = buildPaidMail({ ...order, locale: 'en', currency: 'GBP' }, items)
    expect(m.subject).toBe('Order confirmation ORD-2026-000001')
    expect(m.text).toContain('Thank you for your order!')
    expect(m.text).toContain('£49.90')
    expect(m.text).toContain('7 % VAT')
  })

  test('discount, several tax rates incl. shipping VAT, downloads and invoice note', () => {
    const o = { ...order, discountCents: 500, couponCode: 'SOMMER', taxBreakdown: { '1900': 80, '700': 300 } }
    const dl = [{ filename: 'Regeln.pdf', url: '/api/shop/download/tok1', expiresAt: '2026-12-31T00:00:00Z', maxDownloads: 5 }]
    const m = buildPaidMail(o, items, { downloads: dl, invoice: { number: 'RE-2026-000001' }, hasAttachment: true })
    expect(m.text).toContain('Rabatt (SOMMER): -5,00 €')
    expect(m.text).toContain('7 % MwSt.: 3,00 €, 19 % MwSt.: 0,80 €')
    expect(m.text).toContain(`Regeln.pdf: ${BASE}/api/shop/download/tok1`)
    expect(m.text).toContain('maximal 5 Downloads')
    expect(m.text).toContain('Die Rechnung RE-2026-000001 findest du im Anhang.')
  })

  test('notify and shipped mails (with tracking)', () => {
    expect(buildNotifyMail(order, items).subject).toBe('Neue Bestellung ORD-2026-000001')
    expect(buildNotifyMail(order, items, 'en').subject).toBe('New order ORD-2026-000001')
    const s = buildShippedMail({ ...order, trackingCarrier: 'DHL', trackingNumber: '123 456', trackingUrl: 'https://dhl.example/t/1' })
    expect(s.to).toBe('kunde@example.com')
    expect(s.subject).toBe('Deine Bestellung ORD-2026-000001 wurde versendet')
    expect(s.text).toContain('Versanddienstleister: DHL')
    expect(s.text).toContain('Sendungsnummer: 123 456')
    expect(s.text).toContain('Sendung verfolgen: https://dhl.example/t/1')
    expect(buildShippedMail(order).text).not.toContain('Sendungsnummer')
  })

  test('no line breaks in subject or recipient', () => {
    const m = buildPaidMail({ ...order, email: 'a@b.de\r\nBcc: x@y.de', reference: 'X\nY' }, items)
    expect(m.to).not.toMatch(/[\r\n]/)
    expect(m.subject).not.toMatch(/[\r\n]/)
  })
})

describe('sendPaidMails', () => {
  test('sends customer and notify mail and logs MAIL', async () => {
    await sendPaidMails(order)
    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(sendMail.mock.calls[0][0].to).toBe('kunde@example.com')
    expect(sendMail.mock.calls[0][0].attachments).toBeUndefined()
    expect(sendMail.mock.calls[1][0].to).toBe('verlag@example.com')
    expect(logOrderEvent).toHaveBeenCalledWith('o1', 'MAIL', 'Bestätigung gesendet')
  })

  test('notify mail uses shop_default_locale', async () => {
    settings({ shop_notify_email: 'verlag@example.com', shop_default_locale: 'en' })
    await sendPaidMails(order)
    expect(sendMail.mock.calls[0][0].subject).toBe('Bestellbestätigung ORD-2026-000001')
    expect(sendMail.mock.calls[1][0].subject).toBe('New order ORD-2026-000001')
  })

  test('attaches the invoice when available', async () => {
    const att = { filename: 'Rechnung.pdf', content: Buffer.from('x'), contentType: 'application/pdf' }
    buildInvoiceAttachment.mockResolvedValue(att)
    await sendPaidMails(order, { invoice: { number: 'RE-1' } })
    expect(sendMail.mock.calls[0][0].attachments).toEqual([att])
    expect(sendMail.mock.calls[0][0].text).toContain('RE-1')
  })

  test('skips notify when empty or implausible', async () => {
    for (const value of ['', 'kein-mail', 'a@b.de\nBcc: c@d.de']) {
      sendMail.mockClear()
      settings({ shop_notify_email: value })
      await sendPaidMails(order)
      expect(sendMail).toHaveBeenCalledTimes(1)
    }
  })

  test('a failing customer mail does not block the notification, never throws, logs MAIL_ERROR', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'))
    await expect(sendPaidMails(order)).resolves.toBeUndefined()
    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(logOrderEvent).toHaveBeenCalledWith('o1', 'MAIL_ERROR', expect.any(String))
  })

  test('sendShippedMail propagates errors', async () => {
    sendMail.mockRejectedValue(new Error('smtp down'))
    await expect(sendShippedMail(order)).rejects.toThrow('smtp down')
  })
})

describe('other mails', () => {
  test('sendRefundMail', async () => {
    await M.sendRefundMail({ ...order, refundedCents: 1000 }, { amountCents: 1000, reason: 'Defekt' })
    const m = sendMail.mock.calls[0][0]
    expect(m.to).toBe('kunde@example.com')
    expect(m.text).toContain('10,00 €')
    expect(m.text).toContain('Grund: Defekt')
    expect(m.subject).toBe('Erstattung zu Bestellung ORD-2026-000001')
  })

  test('sendDownloadsMail builds absolute links and propagates errors', async () => {
    await M.sendDownloadsMail(order, [{ filename: 'a.pdf', url: '/api/shop/download/t', expiresAt: '2026-12-31T00:00:00Z', maxDownloads: 3 }])
    expect(sendMail.mock.calls[0][0].text).toContain(`a.pdf: ${BASE}/api/shop/download/t`)
    sendMail.mockRejectedValue(new Error('smtp down'))
    await expect(M.sendDownloadsMail(order, [])).rejects.toThrow('smtp down')
  })

  test('sendReturnMail: received also notifies the publisher, other kinds only the customer', async () => {
    const req = { email: 'kunde@example.com', reason: 'Zu klein', items: [{ sku: 'DS-HC', qty: 1 }], adminNote: 'ok' }
    await M.sendReturnMail(req, order, 'received')
    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(sendMail.mock.calls[0][0].to).toBe('kunde@example.com')
    expect(sendMail.mock.calls[0][0].text).toContain('1 x DS-HC')
    expect(sendMail.mock.calls[1][0].to).toBe('verlag@example.com')
    expect(sendMail.mock.calls[1][0].text).toContain('Zu klein')
    for (const kind of ['approved', 'rejected', 'received_goods', 'refunded']) {
      sendMail.mockClear()
      await M.sendReturnMail(req, order, kind)
      expect(sendMail).toHaveBeenCalledTimes(1)
    }
    await expect(M.sendReturnMail(req, order, 'nope')).rejects.toThrow()
  })

  test('sendStockAlertMail: confirm and notify links', async () => {
    const alert = { email: 'a@b.de', locale: 'en', confirmToken: 'ctok', unsubscribeToken: 'utok' }
    const product = { slug: 'dark-space', title: 'Dark Space', translations: { en: { title: 'Dark Space EN' } } }
    await M.sendStockAlertMail(alert, { label: 'Hardcover' }, product, 'confirm')
    let m = sendMail.mock.calls[0][0]
    expect(m.text).toContain(`${BASE}/api/shop/public/stock-alerts/confirm?token=ctok`)
    expect(m.text).toContain(`${BASE}/api/shop/public/stock-alerts/unsubscribe?token=utok`)
    expect(m.text).toContain('Dark Space EN')
    await M.sendStockAlertMail({ ...alert, locale: 'de' }, { label: 'Hardcover' }, product, 'notify')
    m = sendMail.mock.calls[1][0]
    expect(m.text).toContain(`${BASE}/shop/dark-space`)
    expect(m.text).toContain('utok')
    expect(m.text).not.toContain('confirm?token')
    expect(m.subject).toBe('Dark Space ist wieder verfügbar')
  })

  test('sendLowStockMail lists items; nothing without address or items', async () => {
    await M.sendLowStockMail([{ sku: 'DS-HC', title: 'Dark Space', stock: 2 }])
    expect(sendMail.mock.calls[0][0].to).toBe('verlag@example.com')
    expect(sendMail.mock.calls[0][0].text).toContain('DS-HC – Dark Space: Bestand 2')
    sendMail.mockClear()
    await M.sendLowStockMail([])
    settings({})
    await M.sendLowStockMail([{ sku: 'X', title: 'T', stock: 1 }])
    expect(sendMail).not.toHaveBeenCalled()
  })
})

describe('validateTracking', () => {
  test('accepts valid, trims, empties to null, skips missing', () => {
    expect(M.validateTracking({ carrier: ' DHL ', trackingNumber: 'AB 12.3/4-5_', trackingUrl: 'https://x.de/t?1=2' }).data)
      .toEqual({ trackingCarrier: 'DHL', trackingNumber: 'AB 12.3/4-5_', trackingUrl: 'https://x.de/t?1=2' })
    expect(M.validateTracking({ carrier: '' }).data).toEqual({ trackingCarrier: null })
    expect(M.validateTracking({}).data).toEqual({})
  })

  test('rejects too long, bad characters and non-https', () => {
    expect(M.validateTracking({ carrier: 'x'.repeat(41) }).errors).toHaveLength(1)
    expect(M.validateTracking({ trackingNumber: 'a;b' }).errors).toHaveLength(1)
    expect(M.validateTracking({ trackingNumber: '1'.repeat(61) }).errors).toHaveLength(1)
    expect(M.validateTracking({ trackingUrl: 'http://x.de' }).errors).toHaveLength(1)
    expect(M.validateTracking({ trackingUrl: 'javascript:alert(1)' }).errors).toHaveLength(1)
    expect(M.validateTracking({ trackingUrl: 'https://x.de/' + 'a'.repeat(300) }).errors).toHaveLength(1)
    expect(M.validateTracking({ carrier: 5 }).errors).toHaveLength(1)
  })
})
