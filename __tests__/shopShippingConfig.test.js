/**
 * __tests__/shopShippingConfig.test.js
 */
const mockPrisma = { setting: { findUnique: jest.fn(), upsert: jest.fn() } }
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }))

const { DEFAULT_SHIPPING_CONFIG, normalizeShippingConfig, validateShippingConfig, loadShippingConfig, saveShippingConfig } = require('../lib/shop/shippingConfig')

const cfg = (o = {}) => ({
  countries: { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz' },
  zones: [{ id: 'DE', name: 'Deutschland', countries: ['DE'], tiers: [{ maxG: 1000, priceCents: 400 }, { maxG: 5000, priceCents: 900 }] }],
  ...o,
})
const zone = (o) => cfg({ zones: [{ id: 'Z', name: 'Z', countries: ['DE'], tiers: [], ...o }] })
const errs = (c) => validateShippingConfig(c).errors

beforeEach(() => jest.clearAllMocks())

describe('Standard', () => {
  test('DE / EU / WELT ohne Tarife', () => {
    const d = DEFAULT_SHIPPING_CONFIG
    expect(d.zones.map((z) => z.id)).toEqual(['DE', 'EU', 'WELT'])
    expect(d.zones.every((z) => z.tiers.length === 0)).toBe(true)
    expect(d.zones[0].countries).toEqual(['DE'])
    expect(d.zones[2].countries).toEqual(['CH', 'NO', 'GB', 'US'])
    expect(d.zones[1].countries).toHaveLength(26)
    expect(Object.keys(d.countries)).toHaveLength(31)
    expect(d.countries.AT).toBe('Österreich')
    expect(errs(d)).toEqual([])
  })
})

describe('validateShippingConfig', () => {
  test('gültig', () => {
    const r = validateShippingConfig(cfg())
    expect(r.errors).toEqual([])
    expect(r.data.zones[0].tiers[1]).toEqual({ maxG: 5000, priceCents: 900 })
  })
  test('Länder: Code und Name', () => {
    expect(errs(cfg({ countries: { de: 'x' } }))[0]).toMatch(/Ländercode/)
    expect(errs(cfg({ countries: { DE: '' } }))[0]).toMatch(/Ländername/)
    expect(errs(cfg({ countries: { DE: 'x'.repeat(81) } }))[0]).toMatch(/Ländername/)
    expect(errs(cfg({ countries: [] }))[0]).toMatch(/countries/)
  })
  test('Zonen-ID doppelt', () => {
    const z = { id: 'A', countries: [], tiers: [] }
    expect(errs(cfg({ zones: [z, { ...z }] })).join()).toMatch(/doppelt/)
  })
  test('Land höchstens in einer Zone und nur aus der Länderliste', () => {
    const z1 = { id: 'A', countries: ['DE'], tiers: [] }
    expect(errs(cfg({ zones: [z1, { id: 'B', countries: ['DE'], tiers: [] }] })).join()).toMatch(/mehreren Zonen/)
    expect(errs(zone({ countries: ['FR'] })).join()).toMatch(/Länderliste/)
  })
  test('Stufen: aufsteigend, streng, Grenzen', () => {
    expect(errs(zone({ tiers: [{ maxG: 1000, priceCents: 1 }, { maxG: 500, priceCents: 2 }] })).join()).toMatch(/größer/)
    expect(errs(zone({ tiers: [{ maxG: 1000, priceCents: 1 }, { maxG: 1000, priceCents: 2 }] })).join()).toMatch(/größer/)
    expect(errs(zone({ tiers: [{ maxG: 0, priceCents: 1 }] })).join()).toMatch(/maxG/)
    expect(errs(zone({ tiers: [{ maxG: 1000001, priceCents: 1 }] })).join()).toMatch(/maxG/)
    expect(errs(zone({ tiers: [{ maxG: 10.5, priceCents: 1 }] })).join()).toMatch(/maxG/)
    expect(errs(zone({ tiers: [{ maxG: 10, priceCents: -1 }] })).join()).toMatch(/priceCents/)
    expect(errs(zone({ tiers: [{ maxG: 10, priceCents: 100000 }] })).join()).toMatch(/priceCents/)
    expect(errs(zone({ tiers: [{ maxG: 10, priceCents: '4' }] })).join()).toMatch(/priceCents/)
    expect(errs(zone({ tiers: [{ maxG: 10, priceCents: 0 }, { maxG: 1000000, priceCents: 99999 }] }))).toEqual([])
  })
  test('Zone: Name ≤80, ohne Name gilt die ID', () => {
    expect(errs(zone({ name: 'x'.repeat(81) })).join()).toMatch(/Name/)
    expect(validateShippingConfig(zone({ name: undefined })).data.zones[0].name).toBe('Z')
  })
  test('kein Objekt', () => {
    expect(errs(null)).toHaveLength(1)
    expect(errs('x')).toHaveLength(1)
    expect(errs({ countries: {} }).join()).toMatch(/zones/)
  })
})

describe('load / save', () => {
  test('fehlendes Setting -> Standard (Kopie)', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue(null)
    const c = await loadShippingConfig()
    expect(c).toEqual(DEFAULT_SHIPPING_CONFIG)
    expect(c).not.toBe(DEFAULT_SHIPPING_CONFIG)
    expect(mockPrisma.setting.findUnique).toHaveBeenCalledWith({ where: { key: 'shop_shipping' } })
  })
  test('defektes JSON oder ungültige Struktur -> Standard', async () => {
    for (const value of ['{kaputt', '[]', '"x"', JSON.stringify(zone({ tiers: [{ maxG: 5, priceCents: -1 }] }))]) {
      mockPrisma.setting.findUnique.mockResolvedValue({ value })
      expect(await loadShippingConfig()).toEqual(DEFAULT_SHIPPING_CONFIG)
    }
  })
  test('gültiges JSON wird geladen', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue({ value: JSON.stringify(cfg()) })
    expect((await loadShippingConfig()).zones[0].tiers).toHaveLength(2)
  })
  test('normalizeShippingConfig: ungültig -> Standard', () => {
    expect(normalizeShippingConfig(undefined)).toEqual(DEFAULT_SHIPPING_CONFIG)
  })
  test('save: upsert', async () => {
    const data = validateShippingConfig(cfg()).data
    await saveShippingConfig(data)
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
      where: { key: 'shop_shipping' },
      update: { value: JSON.stringify(data) },
      create: { key: 'shop_shipping', value: JSON.stringify(data) },
    })
  })
})

describe('Steuersatz je Zone und Versandkostenfrei-Grenze', () => {
  test('Standard: taxRateBp null, freeShippingFromCents null', () => {
    expect(DEFAULT_SHIPPING_CONFIG.freeShippingFromCents).toBeNull()
    expect(DEFAULT_SHIPPING_CONFIG.zones.every((z) => z.taxRateBp === null)).toBe(true)
  })
  test('fehlende Felder werden zu null (Altdaten)', () => {
    const r = validateShippingConfig(cfg())
    expect(r.errors).toEqual([])
    expect(r.data.freeShippingFromCents).toBeNull()
    expect(r.data.zones[0].taxRateBp).toBeNull()
  })
  test('gültige Werte inkl. 0 %', () => {
    expect(validateShippingConfig(zone({ taxRateBp: 0 })).data.zones[0].taxRateBp).toBe(0)
    expect(validateShippingConfig(zone({ taxRateBp: 1900 })).data.zones[0].taxRateBp).toBe(1900)
    expect(validateShippingConfig(cfg({ freeShippingFromCents: 5000 })).data.freeShippingFromCents).toBe(5000)
    expect(validateShippingConfig(cfg({ freeShippingFromCents: null })).errors).toEqual([])
  })
  test.each([[-1], [10001], [1.5], ['19']])('taxRateBp %p ist ungültig', (v) => {
    expect(errs(zone({ taxRateBp: v })).join()).toMatch(/taxRateBp/)
  })
  test.each([[0], [-5], [10000000], [1.5], ['10']])('freeShippingFromCents %p ist ungültig', (v) => {
    expect(errs(cfg({ freeShippingFromCents: v })).join()).toMatch(/Versandkostenfrei/)
  })
  test('Speichern/Laden behält die neuen Felder; ungültig -> Standard', async () => {
    const data = validateShippingConfig(cfg({ freeShippingFromCents: 7500, zones: [{ id: 'DE', name: 'D', countries: ['DE'], taxRateBp: 1900, tiers: [] }] })).data
    await saveShippingConfig(data)
    const saved = JSON.parse(mockPrisma.setting.upsert.mock.calls[0][0].create.value)
    expect(saved).toMatchObject({ freeShippingFromCents: 7500, zones: [{ taxRateBp: 1900 }] })
    mockPrisma.setting.findUnique.mockResolvedValue({ value: JSON.stringify(saved) })
    expect(await loadShippingConfig()).toMatchObject({ freeShippingFromCents: 7500, zones: [{ taxRateBp: 1900 }] })
    expect(normalizeShippingConfig(cfg({ freeShippingFromCents: 0 }))).toEqual(DEFAULT_SHIPPING_CONFIG)
  })
})
