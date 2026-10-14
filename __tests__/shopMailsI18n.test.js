/**
 * __tests__/shopMailsI18n.test.js
 * Wörterbuch der Mails: de und en haben dieselben Schlüssel und Platzhalter.
 */

jest.disableAutomock()

const mail = require('../lib/shop/i18n/mail').default
const { t } = require('../lib/shop/i18n')

const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

describe('mail dictionary', () => {
  test('de and en have identical keys, all prefixed mail.', () => {
    expect(Object.keys(mail.en).sort()).toEqual(Object.keys(mail.de).sort())
    for (const k of Object.keys(mail.de)) expect(k.startsWith('mail.')).toBe(true)
  })

  test('same placeholders in both languages, no empty texts', () => {
    for (const k of Object.keys(mail.de)) {
      expect(mail.de[k].length).toBeGreaterThan(0)
      expect(mail.en[k].length).toBeGreaterThan(0)
      expect(vars(mail.en[k])).toBe(vars(mail.de[k]))
    }
  })

  test('t() resolves both languages and falls back to German', () => {
    expect(t('de', 'mail.shipped.subject', { reference: 'A1' })).toBe('Deine Bestellung A1 wurde versendet')
    expect(t('en', 'mail.shipped.subject', { reference: 'A1' })).toBe('Your order A1 has been shipped')
    expect(t('fr', 'mail.paid.intro')).toBe('Vielen Dank für deine Bestellung!')
  })
})
