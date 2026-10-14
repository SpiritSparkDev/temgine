// Seiten ohne Suchmaschinen-Relevanz (Warenkorb, Kasse, Bestellstatus). Gilt nur bei aktivem Add-on.
export const SHOP_NOINDEX_SLUGS = ['warenkorb', 'kasse', 'bestellung']

export const isShopNoindexPath = (routePath) =>
  SHOP_NOINDEX_SLUGS.some((s) => String(routePath || '').replace(/\/+$/, '') === `/${s}`)
