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
  expect(await ensureShopPages(p)).toEqual(['shop']);
  const data = p.page.create.mock.calls[0][0].data;
  expect(data).toMatchObject({ slug: 'shop', status: 'PUBLISHED', blocks: [{ type: 'shop-products' }] });
  expect(data.title).toBeTruthy();
});

test('never touches existing pages (idempotent)', async () => {
  const p = mk({ shop: { id: '1', slug: 'shop', status: 'DRAFT' } });
  expect(await ensureShopPages(p)).toEqual([]);
  expect(p.page.create).not.toHaveBeenCalled();
  expect(p.page.update).not.toHaveBeenCalled();
  expect(p.page.upsert).not.toHaveBeenCalled();
  expect(SHOP_PAGES[0].slug).toBe('shop');
});
