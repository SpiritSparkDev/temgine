// Reine Katalog-Logik (ohne Prisma): Validierung, Slug, Mapping auf Admin-/öffentliche Produkte

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

/**
 * Prüft Admin-Eingabe (POST/PUT). Gibt { errors: [Text], data } zurück; data nur sinnvoll, wenn errors leer.
 */
export function validateProductInput(input) {
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
    const stock = intOrNull(ff.stock, 0, 1000000)
    if (stock === undefined) errors.push(`${n}: Bestand muss eine ganze Zahl von 0 bis 1000000 sein`)
    let weightG = intOrNull(ff.weightG, 0, 1000000)
    if (weightG === undefined) errors.push(`${n}: Gewicht muss eine ganze Zahl von 0 bis 1000000 sein`)
    if (digital) weightG = null
    const fSort = ff.sortOrder === undefined || ff.sortOrder === null || ff.sortOrder === '' ? i : intOrNull(ff.sortOrder, -1000000, 1000000)
    if (fSort === undefined) errors.push(`${n}: Sortierung muss eine ganze Zahl sein`)

    const out = { sku, label, priceCents, taxRateBp, weightG, stock, digital, sortOrder: fSort }
    if (ff.id) out.id = String(ff.id)
    formats.push(out)
  })

  return {
    errors,
    data: { slug, title, category, subtitle, shortText, description, images, active: inp.active === true, sortOrder, formats },
  }
}

export function isOrderable(f) {
  return f.priceCents > 0 && f.taxRateBp != null && (f.stock === null || f.stock === undefined || f.stock > 0)
}

const byOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
const imagesOf = (row) => (Array.isArray(row.images) ? row.images : [])

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
      sortOrder: f.sortOrder ?? 0,
    })),
  }
}

export function toPublicProduct(row) {
  const formats = [...(row.formats || [])].sort(byOrder)
  const prices = formats.filter(isOrderable).map((f) => f.priceCents)
  return {
    slug: row.slug,
    title: row.title,
    category: row.category ?? null,
    subtitle: row.subtitle ?? null,
    shortText: row.shortText ?? null,
    description: row.description ?? null,
    images: imagesOf(row),
    fromPriceCents: prices.length ? Math.min(...prices) : null,
    formats: formats.map((f) => {
      const orderable = isOrderable(f)
      return {
        sku: f.sku,
        label: f.label,
        priceCents: f.priceCents ?? null,
        taxRateBp: f.taxRateBp ?? null,
        digital: !!f.digital,
        orderable,
        inStock: f.stock === null || f.stock === undefined || f.stock > 0,
      }
    }),
  }
}
