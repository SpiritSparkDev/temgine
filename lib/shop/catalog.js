// Reine Katalog-Logik (ohne Prisma): Validierung, Slug, Mapping auf Admin-/öffentliche Produkte
import { reservedByOthers } from './reservations'

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SKU_RE = /^[A-Za-z0-9._-]{1,40}$/
export const IMAGE_RE = /^\/uploads\/[A-Za-z0-9._\/-]{1,200}$/

export function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
}

const str = (v) => (v === null || v === undefined ? '' : String(v).trim())

/** Ganzzahl im Bereich oder null (leer); undefined bei Fehler */
function intOrNull(v, min, max) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return undefined
  return v
}

export const TRANSLATION_LIMITS = { title: 150, subtitle: 120, shortText: 300, description: 10000 }
const TRANSLATION_LABELS = { title: 'Titel', subtitle: 'Untertitel', shortText: 'Kurztext', description: 'Beschreibung' }

/** SKUs und Slugs, die validateProductInput gegen die Datenbank geprüft haben will (die Route schlägt sie nach). */
export function collectReferences(input) {
  const inp = input && typeof input === 'object' ? input : {}
  const skus = new Set()
  for (const f of Array.isArray(inp.formats) ? inp.formats : []) {
    for (const b of Array.isArray(f?.bundleItems) ? f.bundleItems : []) if (typeof b?.sku === 'string') skus.add(b.sku.trim())
  }
  const slugs = (Array.isArray(inp.related) ? inp.related : []).filter((x) => typeof x === 'string').map((x) => x.trim())
  return { skus: [...skus].slice(0, 100), slugs: [...new Set(slugs)].slice(0, 20) }
}

function validatePriceTiers(raw, n, priceCents, errors) {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) { errors.push(`${n}: Staffelpreise müssen als Liste übergeben werden`); return [] }
  if (raw.length > 5) errors.push(`${n}: Höchstens 5 Staffelpreise erlaubt`)
  const out = []
  let last = 1
  raw.forEach((t, i) => {
    const m = `${n}, Staffel ${i + 1}`
    const minQty = t && Number.isInteger(t.minQty) && t.minQty >= 2 && t.minQty <= 99 ? t.minQty : null
    if (minQty === null) { errors.push(`${m}: Ab-Menge muss eine ganze Zahl von 2 bis 99 sein`); return }
    if (minQty <= last) errors.push(`${m}: Ab-Mengen müssen eindeutig und aufsteigend sein`)
    last = Math.max(last, minQty)
    const price = t.priceCents
    if (!Number.isInteger(price) || price <= 0) { errors.push(`${m}: Preis muss eine ganze Cent-Zahl größer 0 sein`); return }
    if (priceCents == null) errors.push(`${m}: Staffelpreise brauchen einen Basispreis`)
    else if (price >= priceCents) errors.push(`${m}: Staffelpreis muss kleiner als der Basispreis sein`)
    out.push({ minQty, priceCents: price })
  })
  return out
}

function validateBundleItems(raw, n, ctx, errors) {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) { errors.push(`${n}: Bündelinhalt muss als Liste übergeben werden`); return [] }
  if (raw.length > 10) errors.push(`${n}: Höchstens 10 Bündel-Bestandteile erlaubt`)
  const out = []
  const seen = new Set()
  raw.forEach((b, i) => {
    const m = `${n}, Bestandteil ${i + 1}`
    const sku = str(b?.sku)
    const qty = b?.qty
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) errors.push(`${m}: Menge muss eine ganze Zahl von 1 bis 99 sein`)
    if (!SKU_RE.test(sku)) { errors.push(`${m}: SKU ungültig`); return }
    if (sku === ctx.ownSku) errors.push(`${m}: Ein Bündel darf sich nicht selbst enthalten`)
    else if (ctx.ownBundleSkus.has(sku) || (!ctx.ownSkus.has(sku) && ctx.lookup.bundleSkus?.has(sku))) {
      errors.push(`${m}: "${sku}" ist selbst ein Bündel (keine Verschachtelung)`)
    } else if (ctx.lookup.knownSkus && !ctx.ownSkus.has(sku) && !ctx.lookup.knownSkus.has(sku)) {
      errors.push(`${m}: SKU "${sku}" existiert nicht`)
    }
    if (seen.has(sku)) errors.push(`${m}: SKU "${sku}" kommt mehrfach im Bündel vor`)
    seen.add(sku)
    out.push({ sku, qty })
  })
  return out
}

function validateRelated(raw, slug, lookup, errors) {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) { errors.push('Empfehlungen müssen als Liste übergeben werden'); return [] }
  if (raw.length > 6) errors.push('Höchstens 6 Empfehlungen erlaubt')
  const out = []
  for (const r of raw) {
    const s = str(r)
    if (!SLUG_RE.test(s)) { errors.push(`Empfehlung "${s}" ist kein gültiger Slug`); continue }
    if (s === slug) { errors.push('Ein Produkt kann sich nicht selbst empfehlen'); continue }
    if (lookup.knownSlugs && !lookup.knownSlugs.has(s)) { errors.push(`Empfohlenes Produkt "${s}" existiert nicht`); continue }
    if (!out.includes(s)) out.push(s)
  }
  return out
}

function validateTranslations(raw, errors) {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) { errors.push('Übersetzungen müssen als Objekt übergeben werden'); return {} }
  const en = raw.en
  if (en === undefined || en === null) return {}
  if (typeof en !== 'object' || Array.isArray(en)) { errors.push('Übersetzung EN muss ein Objekt sein'); return {} }
  const out = {}
  for (const [k, max] of Object.entries(TRANSLATION_LIMITS)) {
    const v = str(en[k])
    if (v.length > max) errors.push(`Übersetzung EN: ${TRANSLATION_LABELS[k]} darf höchstens ${max} Zeichen haben`)
    if (v) out[k] = v
  }
  return Object.keys(out).length ? { en: out } : {}
}

/**
 * Prüft Admin-Eingabe (POST/PUT). Gibt { errors: [Text], data } zurück; data nur sinnvoll, wenn errors leer.
 * lookup (von der Route aus der Datenbank geladen; fehlt ein Feld, entfällt die jeweilige Existenzprüfung):
 *   { knownSkus: Set, bundleSkus: Set, knownSlugs: Set }
 * Formate und Bündel desselben Produkts in der Eingabe zählen als bekannt und überstimmen die Datenbankwerte.
 */
export function validateProductInput(input, lookup = {}) {
  const errors = []
  const inp = input && typeof input === 'object' ? input : {}

  const title = str(inp.title)
  if (!title) errors.push('Titel ist erforderlich')
  else if (title.length > 150) errors.push('Titel darf höchstens 150 Zeichen haben')

  const text = (key, label, max) => {
    const v = str(inp[key])
    if (v.length > max) errors.push(`${label} darf höchstens ${max} Zeichen haben`)
    return v || null
  }
  const category = text('category', 'Kategorie', 80)
  const subtitle = text('subtitle', 'Untertitel', 120)
  const shortText = text('shortText', 'Kurztext', 300)
  const description = text('description', 'Beschreibung', 10000)

  let slug = str(inp.slug)
  if (!slug) slug = slugify(title)
  if (title && !slug) errors.push('Aus dem Titel lässt sich kein Slug bilden, bitte Slug angeben')
  else if (slug && (slug.length > 80 || !SLUG_RE.test(slug))) {
    errors.push('Slug darf nur Kleinbuchstaben, Zahlen und einzelne Bindestriche enthalten (max. 80 Zeichen)')
  }

  let images = []
  if (inp.images !== undefined && inp.images !== null) {
    if (!Array.isArray(inp.images)) errors.push('Bilder müssen als Liste übergeben werden')
    else {
      if (inp.images.length > 10) errors.push('Höchstens 10 Bilder erlaubt')
      images = inp.images
      if (images.some((u) => typeof u !== 'string' || !IMAGE_RE.test(u) || u.includes('..'))) {
        errors.push('Bildpfade müssen mit /uploads/ beginnen und dürfen nur erlaubte Zeichen enthalten')
      }
    }
  }

  const sortOrder = inp.sortOrder === undefined || inp.sortOrder === null || inp.sortOrder === '' ? 0 : intOrNull(inp.sortOrder, -1000000, 1000000)
  if (sortOrder === undefined) errors.push('Sortierung muss eine ganze Zahl sein')

  const formats = []
  const rawFormats = Array.isArray(inp.formats) ? inp.formats : []
  if (rawFormats.length === 0) errors.push('Mindestens ein Format ist erforderlich')
  const seen = new Set()
  const ownSkus = new Set(rawFormats.map((f) => str(f?.sku)))
  const ownBundleSkus = new Set(rawFormats.filter((f) => Array.isArray(f?.bundleItems) && f.bundleItems.length).map((f) => str(f.sku)))
  rawFormats.forEach((f, i) => {
    const n = `Format ${i + 1}`
    const ff = f && typeof f === 'object' ? f : {}
    const sku = str(ff.sku)
    if (!SKU_RE.test(sku)) errors.push(`${n}: SKU ungültig (erlaubt: Buchstaben, Ziffern, . _ -, max. 40 Zeichen)`)
    else if (seen.has(sku)) errors.push(`${n}: SKU "${sku}" kommt mehrfach vor`)
    seen.add(sku)

    const label = str(ff.label)
    if (!label) errors.push(`${n}: Bezeichnung ist erforderlich`)
    else if (label.length > 60) errors.push(`${n}: Bezeichnung darf höchstens 60 Zeichen haben`)

    const digital = ff.digital === true
    const priceCents = intOrNull(ff.priceCents, 0, 999999)
    if (priceCents === undefined) errors.push(`${n}: Preis muss eine ganze Cent-Zahl von 0 bis 999999 sein`)
    const taxRateBp = intOrNull(ff.taxRateBp, 0, 10000)
    if (taxRateBp === undefined) errors.push(`${n}: Steuersatz muss zwischen 0 und 10000 liegen`)
    let stock = intOrNull(ff.stock, 0, 1000000)
    if (stock === undefined) errors.push(`${n}: Bestand muss eine ganze Zahl von 0 bis 1000000 sein`)
    let weightG = intOrNull(ff.weightG, 0, 1000000)
    if (weightG === undefined) errors.push(`${n}: Gewicht muss eine ganze Zahl von 0 bis 1000000 sein`)
    if (digital) weightG = null
    const fSort = ff.sortOrder === undefined || ff.sortOrder === null || ff.sortOrder === '' ? i : intOrNull(ff.sortOrder, -1000000, 1000000)
    if (fSort === undefined) errors.push(`${n}: Sortierung muss eine ganze Zahl sein`)

    const priceTiers = validatePriceTiers(ff.priceTiers, n, priceCents, errors)
    const bundleItems = validateBundleItems(ff.bundleItems, n, { ownSku: sku, ownSkus, ownBundleSkus, lookup }, errors)
    if (bundleItems.length) {
      if (!(priceCents > 0) || taxRateBp == null) errors.push(`${n}: Ein Bündel braucht Preis und Steuersatz`)
      weightG = null
      stock = null
    }

    const out = { sku, label, priceCents, taxRateBp, weightG, stock, digital, priceTiers, bundleItems, sortOrder: fSort }
    if (ff.id) out.id = String(ff.id)
    formats.push(out)
  })

  const related = validateRelated(inp.related, slug, lookup, errors)
  const translations = validateTranslations(inp.translations, errors)

  return {
    errors,
    data: { slug, title, category, subtitle, shortText, description, images, related, translations, active: inp.active === true, sortOrder, formats },
  }
}

export function isOrderable(f) {
  return f.priceCents > 0 && f.taxRateBp != null && (f.stock === null || f.stock === undefined || f.stock > 0)
}

const byOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
const imagesOf = (row) => (Array.isArray(row.images) ? row.images : [])
const listOf = (v) => (Array.isArray(v) ? v : [])
const tiersOf = (f) => listOf(f.priceTiers).map((t) => ({ minQty: t.minQty, priceCents: t.priceCents }))
const bundleOf = (f) => listOf(f.bundleItems).map((b) => ({ sku: b.sku, qty: b.qty }))
const translationsOf = (row) => (row.translations && typeof row.translations === 'object' && !Array.isArray(row.translations) ? row.translations : {})

export function toAdminProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category ?? null,
    subtitle: row.subtitle ?? null,
    shortText: row.shortText ?? null,
    description: row.description ?? null,
    images: imagesOf(row),
    related: listOf(row.related),
    translations: translationsOf(row),
    active: !!row.active,
    sortOrder: row.sortOrder ?? 0,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    formats: [...(row.formats || [])].sort(byOrder).map((f) => ({
      id: f.id,
      sku: f.sku,
      label: f.label,
      priceCents: f.priceCents ?? null,
      taxRateBp: f.taxRateBp ?? null,
      weightG: f.weightG ?? null,
      stock: f.stock ?? null,
      digital: !!f.digital,
      priceTiers: tiersOf(f),
      bundleItems: bundleOf(f),
      sortOrder: f.sortOrder ?? 0,
    })),
  }
}

/** Übersetzter Text (locale 'en' und Übersetzung vorhanden) sonst Standardtext */
const tr = (row, locale, key) => (locale === 'en' && str(translationsOf(row).en?.[key])) || (row[key] ?? null)

/**
 * Verfügbare Menge eines Formats: null = unbegrenzt, sonst Bestand − reserviert (min. 0).
 * Bündel: min über Bestandteile mit Bestand von ⌊verfügbar / Menge⌋; fehlt ein Bestandteil in componentFormats, 0.
 */
export function availableQty(f, { reserved, componentFormats } = {}) {
  const free = (x) => (x.stock === null || x.stock === undefined ? null : Math.max(0, x.stock - ((reserved && reserved.get(x.id)) || 0)))
  const items = bundleOf(f)
  if (!items.length) return free(f)
  let min = null
  for (const b of items) {
    const c = (componentFormats || []).find((x) => x.sku === b.sku)
    if (!c) return 0
    const a = free(c)
    if (a !== null) min = min === null ? Math.floor(a / b.qty) : Math.min(min, Math.floor(a / b.qty))
  }
  return min
}

function formatState(f, opts) {
  const avail = availableQty(f, opts)
  const inStock = avail === null || avail > 0
  return { inStock, orderable: f.priceCents > 0 && f.taxRateBp != null && inStock }
}

function fromPrice(row, opts) {
  const prices = (row.formats || []).filter((f) => formatState(f, opts).orderable).map((f) => f.priceCents)
  return prices.length ? Math.min(...prices) : null
}

/** Kurzform für Empfehlungen und „Dazu passt“ */
export function toRecommendation(row, opts = {}) {
  return { slug: row.slug, title: tr(row, opts.locale, 'title'), image: imagesOf(row)[0] ?? null, fromPriceCents: fromPrice(row, opts) }
}

/**
 * opts: { locale: 'de'|'en', reserved: Map<formatId, qty>,
 *         componentFormats: Bündel-Bestandteil-Formate (mit product { title, translations }),
 *         relatedRows: Produktzeilen (mit formats) für „related“ }
 */
export function toPublicProduct(row, opts = {}) {
  const { locale, componentFormats = [], relatedRows = [] } = opts
  const formats = [...(row.formats || [])].sort(byOrder)
  const related = listOf(row.related)
    .map((slug) => relatedRows.find((r) => r.slug === slug && r.active))
    .filter(Boolean)
    .map((r) => toRecommendation(r, opts))
  return {
    slug: row.slug,
    title: tr(row, locale, 'title'),
    category: row.category ?? null,
    subtitle: tr(row, locale, 'subtitle'),
    shortText: tr(row, locale, 'shortText'),
    description: tr(row, locale, 'description'),
    images: imagesOf(row),
    fromPriceCents: fromPrice(row, opts),
    formats: formats.map((f) => {
      const { orderable, inStock } = formatState(f, opts)
      const items = bundleOf(f)
      const comps = items.map((b) => ({ b, c: componentFormats.find((x) => x.sku === b.sku) }))
      return {
        sku: f.sku,
        label: f.label,
        priceCents: f.priceCents ?? null,
        taxRateBp: f.taxRateBp ?? null,
        digital: items.length ? comps.every((x) => x.c && x.c.digital) : !!f.digital,
        orderable,
        inStock,
        tiers: tiersOf(f),
        bundle: items.length
          ? comps.map(({ b, c }) => ({ title: c?.product ? tr(c.product, locale, 'title') : b.sku, label: c?.label ?? b.sku, qty: b.qty }))
          : null,
      }
    }),
    related,
  }
}

/**
 * Lädt für Produktzeilen (mit formats) den öffentlichen Kontext: Bestandteil-Formate der Bündel und Reservierungen.
 * db = Prisma-Client (wird übergeben, damit dieses Modul Prisma-frei bleibt).
 */
export async function loadPublicContext(db, rows) {
  const need = new Set()
  for (const r of rows) for (const f of r.formats || []) for (const b of bundleOf(f)) need.add(b.sku)
  const componentFormats = need.size
    ? await db.shopFormat.findMany({ where: { sku: { in: [...need] } }, include: { product: { select: { title: true, translations: true } } } })
    : []
  const ids = [...new Set([...rows.flatMap((r) => (r.formats || []).map((f) => f.id)), ...componentFormats.map((c) => c.id)])]
  const reserved = ids.length ? await reservedByOthers(ids, {}) : new Map()
  return { reserved, componentFormats }
}

/** ?lang= -> 'en' | 'de' (alles andere: 'de') */
export const localeFromQuery = (q) => (q === 'en' ? 'en' : 'de')

/** Schlägt die in der Eingabe referenzierten SKUs/Slugs nach und baut das lookup für validateProductInput. */
export async function loadLookup(db, input) {
  const { skus, slugs } = collectReferences(input)
  const [formats, products] = await Promise.all([
    skus.length ? db.shopFormat.findMany({ where: { sku: { in: skus } }, select: { sku: true, bundleItems: true } }) : [],
    slugs.length ? db.shopProduct.findMany({ where: { slug: { in: slugs } }, select: { slug: true } }) : [],
  ])
  return {
    knownSkus: new Set(formats.map((f) => f.sku)),
    bundleSkus: new Set(formats.filter((f) => listOf(f.bundleItems).length).map((f) => f.sku)),
    knownSlugs: new Set(products.map((p) => p.slug)),
  }
}
