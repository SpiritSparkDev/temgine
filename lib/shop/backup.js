// Backup-Kategorie "shop": Produkte, Formate, Bestellungen, Positionen, Zahlungen, Bestandsbuchungen.
// Zugangsdaten (shop_*-Einstellungen in der Setting-Tabelle) gehören NICHT dazu: der Export liest die Setting-Tabelle nicht.
import { prisma as defaultPrisma } from '../prisma'

const asDate = (v) => (v ? new Date(v) : null)

/** Alle Shop-Tabellen als einfache JSON-Struktur. */
export async function exportShopData(db = defaultPrisma) {
  const [products, formats, orders, orderItems, payments, stockMovements, coupons] = await Promise.all([
    db.shopProduct.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopFormat.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopOrder.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopOrderItem.findMany({ orderBy: { id: 'asc' } }),
    db.shopPayment.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopStockMovement.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopCoupon.findMany({ orderBy: { createdAt: 'asc' } }),
  ])
  return { products, formats, orders, orderItems, payments, stockMovements, coupons }
}

/**
 * Stellt Shop-Daten wieder her. Reihenfolge wegen Fremdschlüsseln: Produkte, Formate, Bestellungen, Positionen, Zahlungen, Buchungen.
 * merge: Upsert über die natürlichen Schlüssel (slug, sku, reference); Kinder bereits vorhandener Bestellungen bleiben unberührt.
 * replace: löscht vorher alle Shop-Tabellen in umgekehrter Reihenfolge.
 * Die laufende Nummer (number) wird nicht übernommen (neue Vergabe, die Bestellnummer `reference` bleibt erhalten);
 * memberId wird nicht übernommen (Mitglieder können auf der Zielinstanz fehlen).
 */
export async function importShopData(data, strategy = 'merge', db = defaultPrisma) {
  const result = { imported: 0, errors: [] }
  const d = data && typeof data === 'object' ? data : {}
  const list = (k) => (Array.isArray(d[k]) ? d[k] : [])

  if (strategy === 'replace') {
    try {
      await db.shopStockMovement.deleteMany({})
      await db.shopCoupon.deleteMany({})
      await db.shopPayment.deleteMany({})
      await db.shopOrderItem.deleteMany({})
      await db.shopOrder.deleteMany({})
      await db.shopFormat.deleteMany({})
      await db.shopProduct.deleteMany({})
    } catch (e) {
      result.errors.push(`Vorhandene Shop-Daten konnten nicht gelöscht werden: ${e.message}`)
    }
  }

  const productIds = new Map()
  for (const p of list('products')) {
    const slug = String(p?.slug || '').trim()
    if (!slug) continue
    const fields = {
      title: String(p.title || slug), category: p.category ?? null, subtitle: p.subtitle ?? null, shortText: p.shortText ?? null,
      description: p.description ?? null, images: Array.isArray(p.images) ? p.images : [], active: p.active === true, sortOrder: Number(p.sortOrder) || 0,
      related: Array.isArray(p.related) ? p.related : [], translations: p.translations && typeof p.translations === 'object' ? p.translations : {},
    }
    try {
      const saved = await db.shopProduct.upsert({ where: { slug }, create: { slug, ...fields }, update: fields })
      if (p.id) productIds.set(String(p.id), saved.id)
      result.imported++
    } catch (e) {
      result.errors.push(`Shop-Produkt "${slug}": ${e.message}`)
    }
  }

  const formatIds = new Map()
  for (const f of list('formats')) {
    const sku = String(f?.sku || '').trim()
    const productId = productIds.get(String(f?.productId))
    if (!sku || !productId) continue
    const fields = {
      productId, label: String(f.label || sku), priceCents: f.priceCents ?? null, taxRateBp: f.taxRateBp ?? null, weightG: f.weightG ?? null,
      stock: f.stock ?? null, digital: f.digital === true, sortOrder: Number(f.sortOrder) || 0,
      priceTiers: Array.isArray(f.priceTiers) ? f.priceTiers : undefined,
    }
    try {
      const saved = await db.shopFormat.upsert({ where: { sku }, create: { sku, ...fields }, update: fields })
      if (f.id) formatIds.set(String(f.id), saved.id)
      result.imported++
    } catch (e) {
      result.errors.push(`Shop-Format "${sku}": ${e.message}`)
    }
  }

  // Bündel-Bestandteile verweisen auf Format-IDs: auf die neuen IDs umschreiben
  for (const f of list('formats')) {
    const id = formatIds.get(String(f?.id))
    if (!id || !Array.isArray(f.bundleItems)) continue
    try {
      const mapped = f.bundleItems.map((b) => ({ ...b, formatId: formatIds.get(String(b.formatId)) })).filter((b) => b.formatId)
      await db.shopFormat.update({ where: { id }, data: { bundleItems: mapped } })
    } catch (e) {
      result.errors.push(`Shop-Bündel "${f.sku}": ${e.message}`)
    }
  }

  for (const c of list('coupons')) {
    const code = String(c?.code || '').trim()
    if (!code) continue
    const fields = {
      type: c.type, value: Number(c.value) || 0, minOrderCents: c.minOrderCents ?? null, maxUses: c.maxUses ?? null, usedCount: Number(c.usedCount) || 0,
      validFrom: asDate(c.validFrom), validUntil: asDate(c.validUntil), active: c.active !== false, note: c.note ?? null,
    }
    try {
      await db.shopCoupon.upsert({ where: { code }, create: { code, ...fields }, update: fields })
      result.imported++
    } catch (e) {
      result.errors.push(`Shop-Gutschein "${code}": ${e.message}`)
    }
  }

  const orderIds = new Map() // alte id -> neue id, nur für neu angelegte Bestellungen
  for (const o of list('orders')) {
    const reference = String(o?.reference || '').trim()
    if (!reference) continue
    try {
      const existing = await db.shopOrder.findUnique({ where: { reference } })
      if (existing) continue
      const created = await db.shopOrder.create({
        data: {
          reference, status: o.status, email: String(o.email || ''), billing: o.billing ?? {}, shipping: o.shipping ?? {},
          subtotalCents: Number(o.subtotalCents) || 0, shippingCents: Number(o.shippingCents) || 0, totalCents: Number(o.totalCents) || 0,
          currency: o.currency || 'EUR', taxBreakdown: o.taxBreakdown ?? {}, acceptedTermsAt: asDate(o.acceptedTermsAt) || new Date(),
          acceptedWaiver: o.acceptedWaiver === true, couponCode: o.couponCode ?? null, discountCents: Number(o.discountCents) || 0,
          shippingTaxBp: o.shippingTaxBp ?? null, locale: o.locale || 'de', refundedCents: Number(o.refundedCents) || 0, cancelledAt: asDate(o.cancelledAt),
          trackingCarrier: o.trackingCarrier ?? null, trackingNumber: o.trackingNumber ?? null, trackingUrl: o.trackingUrl ?? null,
          paidAt: asDate(o.paidAt), shippedAt: asDate(o.shippedAt), createdAt: asDate(o.createdAt) || undefined,
        },
      })
      if (o.id) orderIds.set(String(o.id), created.id)
      result.imported++
    } catch (e) {
      result.errors.push(`Shop-Bestellung "${reference}": ${e.message}`)
    }
  }

  for (const i of list('orderItems')) {
    const orderId = orderIds.get(String(i?.orderId))
    if (!orderId) continue
    try {
      await db.shopOrderItem.create({
        data: {
          orderId, formatId: formatIds.get(String(i.formatId)) || null, sku: String(i.sku || ''), title: String(i.title || ''), label: String(i.label || ''),
          qty: Number(i.qty) || 1, unitCents: Number(i.unitCents) || 0, taxRateBp: Number(i.taxRateBp) || 0, digital: i.digital === true, weightG: i.weightG ?? null,
          discountCents: Number(i.discountCents) || 0,
          bundleItems: Array.isArray(i.bundleItems) ? i.bundleItems.map((b) => ({ ...b, formatId: formatIds.get(String(b.formatId)) || b.formatId })) : undefined,
        },
      })
      result.imported++
    } catch (e) {
      result.errors.push(`Shop-Position "${i.sku}": ${e.message}`)
    }
  }

  for (const p of list('payments')) {
    const orderId = orderIds.get(String(p?.orderId))
    if (!orderId) continue
    try {
      await db.shopPayment.create({
        data: {
          orderId, provider: p.provider, externalId: String(p.externalId || ''), status: p.status, amountCents: Number(p.amountCents) || 0,
          currency: p.currency || 'EUR', createdAt: asDate(p.createdAt) || undefined,
        },
      })
      result.imported++
    } catch (e) {
      result.errors.push(`Shop-Zahlung "${p.externalId}": ${e.message}`)
    }
  }

  for (const m of list('stockMovements')) {
    const orderId = m?.orderId ? orderIds.get(String(m.orderId)) : null
    if (m?.orderId && !orderId) continue // Buchung einer bereits vorhandenen Bestellung: nicht doppeln
    try {
      await db.shopStockMovement.create({
        data: { sku: String(m.sku || ''), delta: Number(m.delta) || 0, reason: String(m.reason || ''), orderId, createdAt: asDate(m.createdAt) || undefined },
      })
      result.imported++
    } catch (e) {
      result.errors.push(`Shop-Bestandsbuchung "${m.sku}": ${e.message}`)
    }
  }

  return result
}
