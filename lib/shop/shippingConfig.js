import { prisma } from '../prisma'
import { SHOP_SHIPPING_KEY } from './keys'

const DE_NAMES = {
  BE: 'Belgien', BG: 'Bulgarien', DK: 'Dänemark', DE: 'Deutschland', EE: 'Estland', FI: 'Finnland', FR: 'Frankreich',
  GR: 'Griechenland', IE: 'Irland', IT: 'Italien', HR: 'Kroatien', LV: 'Lettland', LT: 'Litauen', LU: 'Luxemburg',
  MT: 'Malta', NL: 'Niederlande', AT: 'Österreich', PL: 'Polen', PT: 'Portugal', RO: 'Rumänien', SE: 'Schweden',
  SK: 'Slowakei', SI: 'Slowenien', ES: 'Spanien', CZ: 'Tschechien', HU: 'Ungarn', CY: 'Zypern',
  CH: 'Schweiz', NO: 'Norwegen', GB: 'Vereinigtes Königreich', US: 'USA',
}
const WORLD = ['CH', 'NO', 'GB', 'US']
const EU = Object.keys(DE_NAMES).filter((c) => c !== 'DE' && !WORLD.includes(c))

/** Standard ohne Tarife (leere Stufen = Versand noch nicht berechenbar). */
export const DEFAULT_SHIPPING_CONFIG = {
  countries: DE_NAMES,
  zones: [
    { id: 'DE', name: 'Deutschland', countries: ['DE'], tiers: [] },
    { id: 'EU', name: 'EU', countries: EU, tiers: [] },
    { id: 'WELT', name: 'Welt', countries: WORLD, tiers: [] },
  ],
}

const clone = (o) => JSON.parse(JSON.stringify(o))
const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max

/** Streng prüfen: { errors: [Text], data } (data nur ohne Fehler verwenden). */
export function validateShippingConfig(input) {
  const errors = []
  const data = { countries: {}, zones: [] }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: ['Konfiguration muss ein Objekt sein.'], data }

  const c = input.countries
  if (!c || typeof c !== 'object' || Array.isArray(c)) errors.push('countries muss ein Objekt sein.')
  else {
    for (const [code, name] of Object.entries(c)) {
      if (!/^[A-Z]{2}$/.test(code)) errors.push(`Ungültiger Ländercode: ${code}`)
      else if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) errors.push(`Ländername für ${code} fehlt oder ist länger als 80 Zeichen.`)
      else data.countries[code] = name.trim()
    }
  }

  if (!Array.isArray(input.zones)) errors.push('zones muss eine Liste sein.')
  else {
    const ids = new Set()
    const owner = {}
    input.zones.forEach((z, i) => {
      const label = `Zone ${i + 1}`
      if (!z || typeof z !== 'object') return errors.push(`${label}: ungültig.`)
      const id = typeof z.id === 'string' ? z.id.trim() : ''
      if (!id || id.length > 40) errors.push(`${label}: ID fehlt oder ist länger als 40 Zeichen.`)
      else if (ids.has(id)) errors.push(`${label}: ID ${id} ist doppelt.`)
      ids.add(id)
      const name = typeof z.name === 'string' && z.name.trim() ? z.name.trim() : id
      if (name.length > 80) errors.push(`${label}: Name ist länger als 80 Zeichen.`)
      const countries = Array.isArray(z.countries) ? z.countries : (errors.push(`${label}: countries muss eine Liste sein.`), [])
      for (const code of countries) {
        if (!(code in data.countries)) errors.push(`${label}: Land ${code} steht nicht in der Länderliste.`)
        else if (owner[code]) errors.push(`Land ${code} ist in mehreren Zonen (${owner[code]}, ${id}).`)
        else owner[code] = id
      }
      const tiersIn = Array.isArray(z.tiers) ? z.tiers : (errors.push(`${label}: tiers muss eine Liste sein.`), [])
      const tiers = []
      let prev = 0
      tiersIn.forEach((t, j) => {
        const tl = `${label}, Stufe ${j + 1}`
        if (!isInt(t?.maxG, 1, 1000000)) errors.push(`${tl}: maxG muss eine ganze Zahl von 1 bis 1000000 sein.`)
        else if (t.maxG <= prev) errors.push(`${tl}: maxG muss größer als die vorige Stufe sein.`)
        else prev = t.maxG
        if (!isInt(t?.priceCents, 0, 99999)) errors.push(`${tl}: priceCents muss eine ganze Zahl von 0 bis 99999 sein.`)
        tiers.push({ maxG: t?.maxG, priceCents: t?.priceCents })
      })
      data.zones.push({ id, name, countries: [...countries], tiers })
    })
  }
  return { errors, data }
}

/** Gültig -> bereinigte Konfiguration, sonst Standard. */
export function normalizeShippingConfig(input) {
  const { errors, data } = validateShippingConfig(input)
  return errors.length ? clone(DEFAULT_SHIPPING_CONFIG) : data
}

export async function loadShippingConfig() {
  const row = await prisma.setting.findUnique({ where: { key: SHOP_SHIPPING_KEY } })
  if (!row?.value) return clone(DEFAULT_SHIPPING_CONFIG)
  try {
    return normalizeShippingConfig(JSON.parse(row.value))
  } catch {
    return clone(DEFAULT_SHIPPING_CONFIG)
  }
}

/** data muss validiert sein (validateShippingConfig(...).data). */
export async function saveShippingConfig(data) {
  const value = JSON.stringify(data)
  await prisma.setting.upsert({ where: { key: SHOP_SHIPPING_KEY }, update: { value }, create: { key: SHOP_SHIPPING_KEY, value } })
  return data
}
