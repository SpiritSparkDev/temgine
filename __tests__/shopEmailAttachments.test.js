/**
 * __tests__/shopEmailAttachments.test.js
 * lib/email.js: sendMail reicht attachments durch, bleibt ohne rückwärtskompatibel
 *
 * @jest-environment node
 */

jest.disableAutomock()

const mockSend = jest.fn().mockResolvedValue({})
jest.mock('nodemailer', () => ({ __esModule: true, default: { createTransport: () => ({ sendMail: mockSend }) } }))
jest.mock('../lib/prisma', () => ({
  prisma: { setting: { findMany: jest.fn().mockResolvedValue([
    { key: 'smtp_host', value: 'h' }, { key: 'smtp_user', value: 'u' }, { key: 'smtp_pass', value: 'p' },
  ]) } },
}))

const { sendMail } = require('../lib/email')

beforeEach(() => mockSend.mockClear())

test('attachments are passed through to nodemailer', async () => {
  const att = [{ filename: 'Rechnung-RE-1.pdf', content: Buffer.from('x'), contentType: 'application/pdf' }]
  await sendMail({ to: 'a@b.de', subject: 's', text: 't', attachments: att })
  expect(mockSend.mock.calls[0][0].attachments).toBe(att)
})

test('without attachments the mail has no attachments key', async () => {
  await sendMail({ to: 'a@b.de', subject: 's', text: 't' })
  expect(mockSend.mock.calls[0][0]).not.toHaveProperty('attachments')
})
