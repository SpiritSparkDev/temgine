jest.disableAutomock();
const mockPrisma = { setting: { findUnique: jest.fn() }, page: { findUnique: jest.fn() }, shopProduct: { findFirst: jest.fn() } };
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
const { buildProductMeta, findProductForRoute, escapeJsonLd } = require('../lib/seo');

beforeEach(() => jest.clearAllMocks());

const product = { slug: 'x', title: 'Dark </script> Space', shortText: 'Kurz', images: ['/uploads/a.webp'],
  formats: [{ sku: 'A', priceCents: 2490, taxRateBp: 700, stock: 3 }, { sku: 'B', priceCents: 990, taxRateBp: 700, stock: 0 }, { sku: 'C', priceCents: null, taxRateBp: null, stock: null }] };

test('buildProductMeta builds Product JSON-LD and cannot break out of script', () => {
  const meta = buildProductMeta({ product, routePath: '/shop/x', baseUrl: 'https://e.com', settings: { seo_site_name: 'Firma' } });
  expect(meta.title).toBe('Dark </script> Space – Firma');
  expect(meta.canonical).toBe('https://e.com/shop/x');
  expect(meta.og.image).toBe('https://e.com/uploads/a.webp');
  const ld = meta.jsonLd[0];
  expect(ld['@type']).toBe('Product');
  expect(ld.offers).toHaveLength(2);
  expect(ld.offers[0]).toMatchObject({ price: '24.90', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' });
  expect(ld.offers[1].availability).toBe('https://schema.org/OutOfStock');
  expect(escapeJsonLd(meta.jsonLd)).not.toContain('</script>');
});

test('findProductForRoute: 404 cases and hit', async () => {
  mockPrisma.setting.findUnique.mockResolvedValue({ value: 'false' });
  expect(await findProductForRoute('x')).toBeNull();
  mockPrisma.setting.findUnique.mockResolvedValue({ value: 'true' });
  mockPrisma.page.findUnique.mockResolvedValue({ status: 'DRAFT' });
  expect(await findProductForRoute('x')).toBeNull();
  mockPrisma.page.findUnique.mockResolvedValue({ status: 'PUBLISHED' });
  mockPrisma.shopProduct.findFirst.mockResolvedValue(null);
  expect(await findProductForRoute('x')).toBeNull();
  expect(mockPrisma.shopProduct.findFirst.mock.calls[0][0].where).toEqual({ slug: 'x', active: true });
  mockPrisma.shopProduct.findFirst.mockResolvedValue(product);
  expect(await findProductForRoute('x')).toBe(product);
});

test('digital formats are InStock regardless of stock; physical 0 stays OutOfStock', () => {
  const p = { ...product, formats: [
    { sku: 'D', priceCents: 990, taxRateBp: 700, stock: 0, digital: true },
    { sku: 'P', priceCents: 990, taxRateBp: 700, stock: 0, digital: false },
  ] };
  const offers = buildProductMeta({ product: p, routePath: '/shop/x', baseUrl: 'https://e.com' }).jsonLd[0].offers;
  expect(offers[0].availability).toBe('https://schema.org/InStock');
  expect(offers[1].availability).toBe('https://schema.org/OutOfStock');
});
