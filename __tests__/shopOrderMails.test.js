/**
 * __tests__/shopOrderMails.test.js
 * Textbau (rein) und Versand der Bestell-Mails.
 */

jest.disableAutomock()

const mockPrisma = { shopOrderItem: { findMany: jest.fn() }, setting: { findUnique: jest.fn() } }
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../lib/email', () => ({ sendMail: jest.fn() }))

const { sendMail } = require('../lib/email')
const { buildPaidMail, buildNotifyMail, buildShippedMail, sendPaidMails, sendShippedMail } = require('../lib/shop/orderMails')

const addr = { name: 'Max Muster', street: 'Weg 1', zip: '12345', city: 'Stadt', country: 'DE' }
const order = {
  id: 'o1', reference: 'ORD-2026-000001', email: 'kunde@example.com', billing: addr, shipping: addr,
  subtotalCents: 4990, shippingCents: 500, totalCents: 5490, taxBreakdown: { '700': 359 },
}
const items = [{ title: 'Dark Space', label: 'Hardcover', qty: 1, unitCents: 4990 }]

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockPrisma.shopOrderItem.findMany.mockResolvedValue(items)
  mockPrisma.setting.findUnique.mockResolvedValue({ value: 'verlag@example.com' })
  sendMail.mockResolvedValue()
})

describe('mail text', () => {
  test('paid mail has amounts as "xx,yy €", tax note, addresses and legal placeholder', () => {
    const m = buildPaidMail(order, items)
    expect(m.to).toBe('kunde@example.com')
    expect(m.subject).toBe('Bestellbestätigung ORD-2026-000001')
    expect(m.text).toContain('1 x Dark Space (Hardcover): 49,90 €')
    expect(m.text).toContain('Gesamtsumme inkl. MwSt.: 54,90 €')
    expect(m.text).toContain('7 % MwSt.: 3,59 €')
    expect(m.text).toContain('Rechnungsadresse:\nMax Muster\nWeg 1\n12345 Stadt\nDE')
    expect(m.text).toContain('[PLATZHALTER – Widerrufsbelehrung folgt]')
    expect(m.text).not.toContain(' ')
  })

  test('notify and shipped mails', () => {
    expect(buildNotifyMail(order, items).subject).toBe('Neue Bestellung ORD-2026-000001')
    const s = buildShippedMail(order)
    expect(s.to).toBe('kunde@example.com')
    expect(s.subject).toBe('Deine Bestellung ORD-2026-000001 wurde versendet')
  })

  test('no line breaks in subject or recipient', () => {
    const m = buildPaidMail({ ...order, email: 'a@b.de\r\nBcc: x@y.de', reference: 'X\nY' }, items)
    expect(m.to).not.toMatch(/[\r\n]/)
    expect(m.subject).not.toMatch(/[\r\n]/)
  })
})

describe('sendPaidMails', () => {
  test('sends customer and notify mail', async () => {
    await sendPaidMails(order)
    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(sendMail.mock.calls[0][0].to).toBe('kunde@example.com')
    expect(sendMail.mock.calls[1][0].to).toBe('verlag@example.com')
  })

  test('skips notify when empty or implausible', async () => {
    for (const value of ['', 'kein-mail', 'a@b.de\nBcc: c@d.de']) {
      sendMail.mockClear()
      mockPrisma.setting.findUnique.mockResolvedValue({ value })
      await sendPaidMails(order)
      expect(sendMail).toHaveBeenCalledTimes(1)
    }
  })

  test('a failing customer mail does not block the notification and never throws', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'))
    await expect(sendPaidMails(order)).resolves.toBeUndefined()
    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  test('sendShippedMail propagates errors', async () => {
    sendMail.mockRejectedValue(new Error('smtp down'))
    await expect(sendShippedMail(order)).rejects.toThrow('smtp down')
  })
})
