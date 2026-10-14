jest.disableAutomock();
jest.mock('../lib/prisma', () => ({ prisma: {} }));
const { SHOP_PAGES, ensureShopPages } = require('../lib/shop/pages');

const mk = (existing = {}) => ({ page: {
  findUnique: jest.fn(({ where }) => Promise.resolve(existing[where.slug] || null)),
  create: jest.fn(() => Promise.resolve({})),
  update: jest.fn(), upsert: jest.fn(), updateMany: jest.fn(),
} });

test('creates missing shop page published with block', async () => {
  const p = mk();
  expect(await ensureShopPages(p)).toEqual(['shop', 'warenkorb', 'kasse', 'bestellung', 'meine-bestellungen', 'rueckgabe', 'agb', 'widerruf', 'widerrufsformular', 'versand-zahlung']);
  const data = p.page.create.mock.calls[0][0].data;
  expect(p.page.create.mock.calls.map((c) => c[0].data.blocks[0].type)).toEqual(['shop-products', 'shop-cart', 'shop-checkout', 'shop-order', 'shop-account', 'shop-return', 'free-html', 'free-html', 'free-html', 'free-html']);
  expect(data).toMatchObject({ slug: 'shop', status: 'PUBLISHED', blocks: [{ type: 'shop-products' }] });
  expect(data.title).toBeTruthy();
});

test('never touches existing pages (idempotent)', async () => {
  const p = mk({ shop: { id: '1' }, warenkorb: { id: '2' }, kasse: { id: '3' }, bestellung: { id: '4' }, 'meine-bestellungen': {}, rueckgabe: {}, agb: {}, widerruf: {}, widerrufsformular: {}, 'versand-zahlung': {} });
  expect(await ensureShopPages(p)).toEqual([]);
  expect(p.page.create).not.toHaveBeenCalled();
  expect(p.page.update).not.toHaveBeenCalled();
  expect(p.page.upsert).not.toHaveBeenCalled();
  expect(SHOP_PAGES[0].slug).toBe('shop');
});

test('legal pages: published, placeholder only, no invented legal text', async () => {
  const p = mk();
  await ensureShopPages(p);
  const by = Object.fromEntries(p.page.create.mock.calls.map((c) => [c[0].data.slug, c[0].data]));
  expect(['agb', 'widerruf', 'widerrufsformular', 'versand-zahlung'].map((s) => by[s].title))
    .toEqual(['AGB', 'Widerrufsbelehrung', 'Muster-Widerrufsformular', 'Versand & Zahlung']);
  for (const s of ['agb', 'widerruf', 'widerrufsformular', 'versand-zahlung']) {
    expect(by[s].status).toBe('PUBLISHED');
    const html = by[s].blocks[0].props.html;
    expect(by[s].blocks[0].template).toBeUndefined();
    expect(html).toContain('<p>[PLATZHALTER – Rechtstext folgt]</p>');
    expect(html).not.toMatch(/§|Widerrufsfrist|vierzehn|14 Tage|Haftung|Gerichtsstand/i);
  }
  expect(by['versand-zahlung'].blocks[0].props.html).toContain('aktivierten Zahlungsanbieter');
});
