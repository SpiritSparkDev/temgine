import { prisma } from '../prisma'

/** Seiten, die das Add-on benötigt. Shop, Warenkorb, Kasse. */
export const SHOP_PAGES = [
  { slug: 'shop', title: 'Shop', blocks: [{ type: 'shop-products' }] },
  { slug: 'warenkorb', title: 'Warenkorb', blocks: [{ type: 'shop-cart' }] },
  { slug: 'kasse', title: 'Kasse', blocks: [{ type: 'shop-checkout' }] },
  { slug: 'bestellung', title: 'Bestellung', blocks: [{ type: 'shop-order' }] },
]

/** Legt fehlende Shop-Seiten veröffentlicht an. Vorhandene Seiten (gleicher Slug) werden nie verändert. */
export async function ensureShopPages(prismaClient = prisma) {
  const created = []
  for (const p of SHOP_PAGES) {
    const existing = await prismaClient.page.findUnique({ where: { slug: p.slug } })
    if (existing) continue
    await prismaClient.page.create({
      data: { slug: p.slug, title: p.title, blocks: p.blocks, status: 'PUBLISHED', data: {}, children: [], accessGroups: [] },
    })
    created.push(p.slug)
  }
  return created
}
