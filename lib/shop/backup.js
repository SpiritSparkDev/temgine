// Backup-Kategorie "shop": Produkte, Formate, Bestellungen (inkl. accessToken), Positionen, Zahlungen, Bestandsbuchungen, Gutscheine (+ Einlösungen),
// Rechnungen, Erstattungen, Bestellverlauf, Rückgabe-Anfragen, Metadaten digitaler Dateien, Bestand-Benachrichtigungen, Wunschlisten, Rechnungszähler.
// NICHT enthalten: Zugangsdaten (shop_*-Einstellungen in der Setting-Tabelle), ShopDownloadToken (Tokens sind Geheimnisse), Reservierungen (kurzlebig).
// ShopDigitalFile sichert nur die Metadaten, NICHT die Dateien selbst: das Verzeichnis data/shop-downloads muss separat gesichert werden.
import { prisma as defaultPrisma } from '../prisma'

const asDate = (v) => (v ? new Date(v) : null)

/** Alle Shop-Tabellen als einfache JSON-Struktur. */
export async function exportShopData(db = defaultPrisma) {
  const [products, formats, orders, orderItems, payments, stockMovements, coupons, invoices, refunds, orderEvents, returnRequests, couponUses, digitalFiles, stockAlerts, wishlistRaw, counters] = await Promise.all([
    db.shopProduct.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopFormat.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopOrder.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopOrderItem.findMany({ orderBy: { id: 'asc' } }),
    db.shopPayment.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopStockMovement.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopCoupon.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopInvoice.findMany({ orderBy: { issuedAt: 'asc' } }),
    db.shopRefund.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopOrderEvent.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopReturnRequest.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopCouponUse.findMany({ orderBy: { usedAt: 'asc' } }),
    db.shopDigitalFile.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopStockAlert.findMany({ orderBy: { createdAt: 'asc' } }),
    db.shopWishlistItem.findMany({ include: { member: { select: { email: true } } }, orderBy: { createdAt: 'asc' } }),
    db.shopCounter.findMany({ orderBy: { key: 'asc' } }),
  ])
  // Mitglieder-IDs sind instanzspezifisch: die Wunschliste wird über die E-Mail des Mitglieds zugeordnet
  const wishlist = wishlistRaw.map(({ member, memberId, ...w }) => ({ ...w, memberEmail: member?.email || null }))
  return { products, formats, orders, orderItems, payments, stockMovements, coupons, invoices, refunds, orderEvents, returnRequests, couponUses, digitalFiles, stockAlerts, wishlist, counters }
}

/**
 * Stellt Shop-Daten wieder her. Reihenfolge wegen Fremdschlüsseln: Produkte, Formate, Gutscheine, Bestellungen, Positionen, Zahlungen, Buchungen,
 * Rechnungen, Erstattungen, Verlauf, Rückgaben, Einlösungen, Dateien, Benachrichtigungen, Wunschliste, Zähler.
 * merge: Upsert über die natürlichen Schlüssel (slug, sku, reference); Kinder bereits vorhandener Bestellungen bleiben unberührt.
 * replace: löscht vorher alle Shop-Tabellen in umgekehrter Reihenfolge (ShopCounter bleibt: Rechnungsnummern dürfen nie zurückgesetzt werden).
 * Die laufende Nummer (number) wird nicht übernommen (neue Vergabe, die Bestellnummer `reference` bleibt erhalten);
 * memberId wird nicht übernommen (Mitglieder können auf der Zielinstanz fehlen). Wunschlisten-Einträge werden nur übernommen,
 * wenn das Mitglied (per E-Mail) auf der Zielinstanz existiert. Zähler: beim Import gilt max(vorhanden, importiert).
 */
export async function importShopData(data, strategy = 'merge', db = defaultPrisma) {
  const result = { imported: 0, errors: [] }
  const d = data && typeof data === 'object' ? data : {}
  const list = (k) => (Array.isArray(d[k]) ? d[k] : [])

  if (strategy === 'replace') {
    try {
      await db.shopWishlistItem.deleteMany({})
      await db.shopStockAlert.deleteMany({})
      await db.shopDigitalFile.deleteMany({}) // Download-Tokens fallen per Cascade mit
      await db.shopCouponUse.deleteMany({})
      await db.shopReturnRequest.deleteMany({})
      await db.shopOrderEvent.deleteMany({})
      await db.shopRefund.deleteMany({})
      await db.shopInvoice.deleteMany({})
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

  const couponIds = new Map()
  for (const c of list('coupons')) {
    const code = String(c?.code || '').trim()
    if (!code) continue
    const fields = {
      type: c.type, value: Number(c.value) || 0, minOrderCents: c.minOrderCents ?? null, maxUses: c.maxUses ?? null, usedCount: Number(c.usedCount) || 0,
      validFrom: asDate(c.validFrom), validUntil: asDate(c.validUntil), active: c.active !== false, note: c.note ?? null,
    }
    try {
      const saved = await db.shopCoupon.upsert({ where: { code }, create: { code, ...fields }, update: fields })
      if (c.id) couponIds.set(String(c.id), saved.id)
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
          accessToken: o.accessToken ?? null,
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

  const paymentIds = new Map()
  for (const p of list('payments')) {
    const orderId = orderIds.get(String(p?.orderId))
    if (!orderId) continue
    try {
      const saved = await db.shopPayment.create({
        data: {
          orderId, provider: p.provider, externalId: String(p.externalId || ''), status: p.status, amountCents: Number(p.amountCents) || 0,
          currency: p.currency || 'EUR', createdAt: asDate(p.createdAt) || undefined,
        },
      })
      if (p.id) paymentIds.set(String(p.id), saved.id)
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

  // fn liefert true, wenn ein Datensatz geschrieben wurde; Fehler werden je Datensatz gesammelt
  const each = async (key, label, fn) => {
    for (const x of list(key)) {
      try {
        if (await fn(x)) result.imported++
      } catch (e) {
        result.errors.push(`${label}: ${e.message}`)
      }
    }
  }
  // Kinder vorhandener Bestellungen: ihre alte ID steht nicht in orderIds und wird übersprungen
  const orderOf = (x) => orderIds.get(String(x?.orderId))

  await each('invoices', 'Shop-Rechnung', async (x) => {
    const orderId = orderOf(x)
    if (!orderId || !x.number) return false
    await db.shopInvoice.create({ data: { orderId, number: String(x.number), issuedAt: asDate(x.issuedAt) || undefined, data: x.data ?? {} } })
    return true
  })
  await each('refunds', 'Shop-Erstattung', async (x) => {
    const orderId = orderOf(x)
    if (!orderId) return false
    await db.shopRefund.create({
      data: {
        orderId, paymentId: paymentIds.get(String(x.paymentId)) || null, amountCents: Number(x.amountCents) || 0, reason: x.reason ?? null,
        restock: x.restock === true, status: x.status, externalId: x.externalId ?? null, error: x.error ?? null, userId: x.userId ?? null,
        createdAt: asDate(x.createdAt) || undefined,
      },
    })
    return true
  })
  await each('orderEvents', 'Shop-Verlauf', async (x) => {
    const orderId = orderOf(x)
    if (!orderId) return false
    await db.shopOrderEvent.create({
      data: { orderId, type: String(x.type || ''), message: x.message ?? null, userId: x.userId ?? null, data: x.data ?? undefined, createdAt: asDate(x.createdAt) || undefined },
    })
    return true
  })
  await each('returnRequests', 'Shop-Rückgabe', async (x) => {
    const orderId = orderOf(x)
    if (!orderId) return false
    await db.shopReturnRequest.create({
      data: {
        orderId, email: String(x.email || ''), items: Array.isArray(x.items) ? x.items : [], reason: String(x.reason || ''), status: x.status,
        adminNote: x.adminNote ?? null, createdAt: asDate(x.createdAt) || undefined,
      },
    })
    return true
  })
  await each('couponUses', 'Shop-Gutscheineinlösung', async (x) => {
    const orderId = orderOf(x)
    const couponId = couponIds.get(String(x?.couponId))
    if (!orderId || !couponId) return false
    await db.shopCouponUse.create({ data: { couponId, orderId, usedAt: asDate(x.usedAt) || undefined } })
    return true
  })
  await each('digitalFiles', 'Shop-Datei', async (x) => {
    const formatId = formatIds.get(String(x?.formatId))
    const storedName = String(x?.storedName || '')
    if (!formatId || !storedName) return false
    const fields = { formatId, filename: String(x.filename || storedName), sizeBytes: Number(x.sizeBytes) || 0, mime: x.mime ?? null }
    await db.shopDigitalFile.upsert({ where: { storedName }, create: { storedName, ...fields }, update: fields })
    return true
  })
  await each('stockAlerts', 'Shop-Benachrichtigung', async (x) => {
    const formatId = formatIds.get(String(x?.formatId))
    const email = String(x?.email || '')
    if (!formatId || !email || !x.confirmToken || !x.unsubscribeToken) return false
    const fields = { locale: x.locale || 'de', confirmedAt: asDate(x.confirmedAt), notifiedAt: asDate(x.notifiedAt) }
    await db.shopStockAlert.upsert({
      where: { formatId_email: { formatId, email } },
      create: { formatId, email, confirmToken: String(x.confirmToken), unsubscribeToken: String(x.unsubscribeToken), ...fields },
      update: fields,
    })
    return true
  })
  await each('wishlist', 'Shop-Wunschliste', async (x) => {
    const productId = productIds.get(String(x?.productId))
    const email = String(x?.memberEmail || '').trim()
    if (!productId || !email) return false
    const member = await db.member.findUnique({ where: { email } })
    if (!member) return false // Mitglied fehlt auf der Zielinstanz: überspringen
    const memberId = member.id
    await db.shopWishlistItem.upsert({ where: { memberId_productId: { memberId, productId } }, create: { memberId, productId }, update: {} })
    return true
  })
  await each('counters', 'Shop-Zähler', async (x) => {
    const key = String(x?.key || '')
    const value = Number(x?.value)
    if (!key.startsWith('invoice') || !Number.isFinite(value)) return false
    const existing = await db.shopCounter.findUnique({ where: { key } })
    if (existing && existing.value >= value) return false
    await db.shopCounter.upsert({ where: { key }, create: { key, value }, update: { value } })
    return true
  })

  return result
}
