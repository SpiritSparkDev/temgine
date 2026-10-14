jest.disableAutomock();
jest.mock('../lib/prisma', () => ({ prisma: { setting: { findMany: jest.fn(), findUnique: jest.fn() }, page: { findMany: jest.fn() } } }));
const { prisma } = require('../lib/prisma');
const { buildPageMeta } = require('../lib/seo');
const sitemap = require('../pages/api/sitemap.xml').default;
const robots = require('../pages/api/robots.txt').default;

const page = { title: 'X', data: { seo: { robots: 'index, follow' } }, accessGroups: [] };
const meta = (routePath, shopEnabled) => buildPageMeta({ page, routePath, baseUrl: 'https://e.de', settings: {}, shopEnabled });

test('robots forced noindex only when add-on active and only for the three slugs', () => {
  for (const s of ['warenkorb', 'kasse', 'bestellung']) {
    expect(meta(`/${s}`, true).robots).toBe('noindex, nofollow');
    expect(meta(`/${s}`, false).robots).toBe('index, follow');
  }
  for (const s of ['agb', 'widerruf', 'widerrufsformular', 'versand-zahlung', 'shop']) {
    expect(meta(`/${s}`, true).robots).toBe('index, follow');
  }
});

const run = async (handler, shopOn) => {
  prisma.setting.findUnique.mockResolvedValue(shopOn ? { value: 'true' } : null);
  prisma.setting.findMany.mockResolvedValue([]);
  prisma.page.findMany.mockResolvedValue(['shop', 'warenkorb', 'kasse', 'bestellung', 'agb', 'widerruf'].map((slug) => ({ slug, status: 'PUBLISHED', children: [], accessGroups: [], data: {}, updatedAt: new Date() })));
  const res = { setHeader() {}, status() { return this; }, json() {}, send: jest.fn() };
  await handler({ method: 'GET', headers: { host: 'e.de' } }, res);
  return res.send.mock.calls[0][0];
};

test('sitemap excludes cart/checkout/order when active, keeps legal pages', async () => {
  const on = await run(sitemap, true);
  for (const s of ['warenkorb', 'kasse', 'bestellung']) expect(on).not.toContain(`/${s}<`);
  for (const s of ['agb', 'widerruf', 'shop']) expect(on).toContain(`/${s}<`);
  expect(await run(sitemap, false)).toContain('/kasse<');
});

test('robots.txt disallows the three paths only when add-on active', async () => {
  const on = await run(robots, true);
  for (const s of ['warenkorb', 'kasse', 'bestellung']) expect(on).toContain(`Disallow: /${s}\n`);
  expect(on).not.toContain('Disallow: /agb');
  expect(await run(robots, false)).not.toContain('Disallow: /kasse');
});
