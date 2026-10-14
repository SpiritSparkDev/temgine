import { prisma } from '../prisma'

const PLACEHOLDER = '<p>[PLATZHALTER – Rechtstext folgt]</p>'

// Freies HTML-Feld (Block ohne Template, props.html), siehe pages/api/pages.js.
const legal = (heading, extra = '') => [{ type: 'free-html', props: { html: `<h1>${heading}</h1>\n${extra}${PLACEHOLDER}` } }]

/** Seiten, die das Add-on benötigt. Shop, Warenkorb, Kasse, Bestellung und Rechtsseiten (nur Platzhalter). */
export const SHOP_PAGES = [
  { slug: 'shop', title: 'Shop', blocks: [{ type: 'shop-products' }] },
  { slug: 'warenkorb', title: 'Warenkorb', blocks: [{ type: 'shop-cart' }] },
  { slug: 'kasse', title: 'Kasse', blocks: [{ type: 'shop-checkout' }] },
  { slug: 'bestellung', title: 'Bestellung', blocks: [{ type: 'shop-order' }] },
  { slug: 'agb', title: 'AGB', blocks: legal('AGB') },
  { slug: 'widerruf', title: 'Widerrufsbelehrung', blocks: legal('Widerrufsbelehrung') },
  { slug: 'widerrufsformular', title: 'Muster-Widerrufsformular', blocks: legal('Muster-Widerrufsformular') },
  {
    slug: 'versand-zahlung',
    title: 'Versand & Zahlung',
    blocks: legal('Versand &amp; Zahlung', '<p>Die Zahlung erfolgt über die im Shop aktivierten Zahlungsanbieter.</p>\n'),
  },
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
