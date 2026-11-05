/**
 * __tests__/shopCoupons.test.js
 * lib/shop/coupons.js: Eingabeprüfung, Einlösbarkeit, Lookup, idempotente Einlösung.
 */
const mockTx = { shopCoupon: { findUnique: jest.fn(), updateMany: jest.fn() }, shopCouponUse: { createMany: jest.fn() } }
const mockPrisma = { shopCoupon: { findUnique: jest.fn() }, shopOrder: { count: jest.fn() }, $transaction: jest.fn((fn) => fn(mockTx)) }
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('../lib/shop/settingsStore', () => ({ getNumberSetting: jest.fn().mockResolvedValue(30) }))

const { normalizeCode, validateCouponInput, validateCoupon, findCoupon, lookupCoupon, recordCouponUse, assertCouponCapacity, toAdminCoupon } = require('../lib/shop/coupons')
const { ShopPricingError } = require('../lib/shop/pricing')

beforeEach(() => jest.clearAllMocks())

const input = (o = {}) => ({ code: 'sommer-10', type: 'PERCENT', value: 1000, ...o })

describe('normalizeCode', () => {
  test('groß, getrimmt, Zeichen und Länge', () => {
    expect(normalizeCode(' sommer_10 ')).toBe('SOMMER_10')
    expect(normalizeCode('ab')).toBeNull()
    expect(normalizeCode('a'.repeat(33))).toBeNull()
    expect(normalizeCode('a b')).toBeNull()
    expect(normalizeCode('ä-ä-ä')).toBeNull()
    expect(normalizeCode(null)).toBeNull()
  })
})

describe('validateCouponInput', () => {
  test('gültig: normalisiert, Standardwerte', () => {
    const r = validateCouponInput(input())
    expect(r.errors).toEqual([])
    expect(r.data).toEqual({ code: 'SOMMER-10', type: 'PERCENT', value: 1000, minOrderCents: null, maxUses: null, validFrom: null, validUntil: null, active: true, note: null })
  })
  test('alle Felder', () => {
    const r = validateCouponInput(input({ type: 'FIXED', value: 500, minOrderCents: 2000, maxUses: 10, validFrom: '2026-01-01', validUntil: '2026-12-31T23:59:59Z', active: false, note: ' Messe ' }))
    expect(r.errors).toEqual([])
    expect(r.data).toMatchObject({ type: 'FIXED', value: 500, minOrderCents: 2000, maxUses: 10, active: false, note: 'Messe' })
    expect(r.data.validFrom).toBeInstanceOf(Date)
    expect(r.data.validUntil.toISOString()).toBe('2026-12-31T23:59:59.000Z')
  })
  test.each([
    ['Code zu kurz', { code: 'ab' }, /Code/],
    ['Art unbekannt', { type: 'X' }, /Art/],
    ['Prozent 0', { value: 0 }, /Prozent/],
    ['Prozent über 10000', { value: 10001 }, /Prozent/],
    ['Prozent als Kommazahl', { value: 5.5 }, /Prozent/],
    ['Festbetrag 0', { type: 'FIXED', value: 0 }, /Betrag/],
    ['Festbetrag zu groß', { type: 'FIXED', value: 10000000 }, /Betrag/],
    ['Mindestbestellwert negativ', { minOrderCents: -1 }, /Mindestbestellwert/],
    ['maxUses 0', { maxUses: 0 }, /Einlösungen/],
    ['Datum ungültig', { validFrom: 'morgen' }, /Gültig ab/],
    ['Ende vor Beginn', { validFrom: '2026-02-01', validUntil: '2026-01-01' }, /vor Gültig ab/],
    ['active kein Boolean', { active: 'ja' }, /active/],
    ['Notiz zu lang', { note: 'x'.repeat(201) }, /Notiz/],
  ])('%s', (_n, over, re) => {
    expect(validateCouponInput(input(over)).errors.join()).toMatch(re)
  })
  test('Prozent exakt 10000 und Festbetrag exakt 9999999 sind erlaubt', () => {
    expect(validateCouponInput(input({ value: 10000 })).errors).toEqual([])
    expect(validateCouponInput(input({ type: 'FIXED', value: 9999999 })).errors).toEqual([])
  })
  test('kein Objekt -> Fehler', () => {
    expect(validateCouponInput(null).errors.length).toBeGreaterThan(0)
  })
})

describe('validateCoupon', () => {
  const now = new Date('2026-06-15T12:00:00Z')
  const row = (o = {}) => ({ code: 'X1X', type: 'PERCENT', value: 500, active: true, usedCount: 0, maxUses: null, minOrderCents: null, validFrom: null, validUntil: null, ...o })
  const codeOf = (o, sub = 5000) => {
    try {
      validateCoupon(row(o), { subtotalCents: sub, now })
    } catch (e) {
      expect(e).toBeInstanceOf(ShopPricingError)
      expect(e.details.code).toBe('X1X')
      return e.code
    }
    return null
  }
  test('gültig', () => expect(codeOf({})).toBeNull())
  test('inaktiv / vor Beginn -> COUPON_INVALID', () => {
    expect(codeOf({ active: false })).toBe('COUPON_INVALID')
    expect(codeOf({ validFrom: new Date('2026-06-16T00:00:00Z') })).toBe('COUPON_INVALID')
  })
  test('abgelaufen -> COUPON_EXPIRED', () => expect(codeOf({ validUntil: new Date('2026-06-15T11:59:59Z') })).toBe('COUPON_EXPIRED'))
  test('Verbrauch usedCount >= maxUses -> COUPON_EXHAUSTED', () => {
    expect(codeOf({ maxUses: 2, usedCount: 2 })).toBe('COUPON_EXHAUSTED')
    expect(codeOf({ maxUses: 2, usedCount: 1 })).toBeNull()
  })
  test('Mindestbestellwert -> COUPON_MIN_ORDER, Grenze gilt', () => {
    expect(codeOf({ minOrderCents: 5001 })).toBe('COUPON_MIN_ORDER')
    expect(codeOf({ minOrderCents: 5000 })).toBeNull()
  })
  test('ISO-Strings aus JSON werden akzeptiert', () => {
    expect(codeOf({ validUntil: '2026-01-01T00:00:00Z' })).toBe('COUPON_EXPIRED')
  })
})

describe('findCoupon / lookupCoupon', () => {
  test('Code wird normalisiert; ungültiger Code fragt nicht die DB', async () => {
    mockPrisma.shopCoupon.findUnique.mockResolvedValue({ id: 'c1' })
    expect(await findCoupon(' abc ')).toEqual({ id: 'c1' })
    expect(mockPrisma.shopCoupon.findUnique).toHaveBeenCalledWith({ where: { code: 'ABC' } })
    mockPrisma.shopCoupon.findUnique.mockClear()
    expect(await findCoupon('!')).toBeNull()
    expect(mockPrisma.shopCoupon.findUnique).not.toHaveBeenCalled()
  })
  test('lookupCoupon: leer -> null, unbekannt -> COUPON_INVALID mit details.code', async () => {
    expect(await lookupCoupon(undefined)).toBeNull()
    expect(await lookupCoupon('  ')).toBeNull()
    expect(await lookupCoupon(42)).toBeNull()
    mockPrisma.shopCoupon.findUnique.mockResolvedValue(null)
    await expect(lookupCoupon('nope')).rejects.toMatchObject({ code: 'COUPON_INVALID', details: { code: 'nope' } })
  })
})

describe('recordCouponUse', () => {
  test('zählt einmal: Nutzung angelegt -> usedCount +1, true', async () => {
    mockTx.shopCoupon.findUnique.mockResolvedValue({ id: 'c1' })
    mockTx.shopCouponUse.createMany.mockResolvedValue({ count: 1 })
    expect(await recordCouponUse('o1', 'sommer')).toBe(true)
    expect(mockTx.shopCoupon.findUnique).toHaveBeenCalledWith({ where: { code: 'SOMMER' } })
    expect(mockTx.shopCouponUse.createMany).toHaveBeenCalledWith({ data: [{ couponId: 'c1', orderId: 'o1' }], skipDuplicates: true })
    expect(mockTx.shopCoupon.updateMany).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { usedCount: { increment: 1 } } })
  })
  test('zweiter Aufruf (Duplikat) zählt nicht', async () => {
    mockTx.shopCoupon.findUnique.mockResolvedValue({ id: 'c1' })
    mockTx.shopCouponUse.createMany.mockResolvedValue({ count: 0 })
    expect(await recordCouponUse('o1', 'SOMMER')).toBe(false)
    expect(mockTx.shopCoupon.updateMany).not.toHaveBeenCalled()
  })
  test('unbekannter/fehlender Code oder Bestellung -> false ohne Schreiben', async () => {
    mockTx.shopCoupon.findUnique.mockResolvedValue(null)
    expect(await recordCouponUse('o1', 'GONE')).toBe(false)
    expect(await recordCouponUse('o1', null)).toBe(false)
    expect(await recordCouponUse(null, 'SOMMER')).toBe(false)
    expect(mockTx.shopCouponUse.createMany).not.toHaveBeenCalled()
  })
})

describe('maxUses', () => {
  test('recordCouponUse: bedingtes Erhoehen unter maxUses, Nutzung wird trotzdem festgehalten', async () => {
    mockTx.shopCoupon.findUnique.mockResolvedValue({ id: 'c1', maxUses: 3 })
    mockTx.shopCouponUse.createMany.mockResolvedValue({ count: 1 })
    mockTx.shopCoupon.updateMany.mockResolvedValue({ count: 0 })
    expect(await recordCouponUse('o1', 'SOMMER')).toBe(true)
    expect(mockTx.shopCouponUse.createMany).toHaveBeenCalled()
    expect(mockTx.shopCoupon.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', usedCount: { lt: 3 } }, data: { usedCount: { increment: 1 } } })
  })
  test('assertCouponCapacity: usedCount + offene Bestellungen >= maxUses -> COUPON_EXHAUSTED', async () => {
    mockPrisma.shopOrder.count.mockResolvedValue(1)
    await expect(assertCouponCapacity(mockPrisma, { code: 'A', maxUses: 3, usedCount: 2 })).rejects.toMatchObject({ code: 'COUPON_EXHAUSTED' })
    expect(mockPrisma.shopOrder.count.mock.calls[0][0].where).toMatchObject({ couponCode: 'A', status: 'PENDING' })
  })
  test('assertCouponCapacity: knapp darunter ok; ohne maxUses keine Abfrage', async () => {
    mockPrisma.shopOrder.count.mockResolvedValue(1)
    await expect(assertCouponCapacity(mockPrisma, { code: 'A', maxUses: 4, usedCount: 2 })).resolves.toBeUndefined()
    mockPrisma.shopOrder.count.mockClear()
    await assertCouponCapacity(mockPrisma, { code: 'A', maxUses: null, usedCount: 99 })
    expect(mockPrisma.shopOrder.count).not.toHaveBeenCalled()
  })
})

test('toAdminCoupon: ISO-Datum und Standardwerte', () => {
  const d = new Date('2026-01-02T03:04:05Z')
  expect(toAdminCoupon({ id: 'c', code: 'A', type: 'FIXED', value: 5, usedCount: 2, validFrom: d, createdAt: d, updatedAt: d })).toMatchObject({
    id: 'c', minOrderCents: null, maxUses: null, usedCount: 2, validFrom: '2026-01-02T03:04:05.000Z', validUntil: null, active: true, note: null,
  })
})
