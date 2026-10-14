jest.disableAutomock();
jest.mock('marked', () => ({ marked: { parse: (s) => s, setOptions: () => {} } }));
const { formatPriceCents, renderProductList, renderProductDetail } = require('../lib/shop/templates');

const fmt = (o = {}) => ({ sku: 'A', label: 'Hardcover', priceCents: 2490, taxRateBp: 700, digital: false, orderable: true, inStock: true, ...o });
const product = (o = {}) => ({ slug: 'x', title: 'Titel', category: 'Rollenspiel', subtitle: '', shortText: '', description: 'Eins\n\nZwei', images: ['/uploads/a.webp', '/uploads/b.webp'], fromPriceCents: 2490, formats: [fmt()], ...o });

test('formatPriceCents formats de-DE', () => {
  expect(formatPriceCents(2490)).toBe('24,90 €');
  expect(formatPriceCents(5)).toBe('0,05 €');
  expect(formatPriceCents(123456)).toBe('1.234,56 €');
  expect(formatPriceCents(null)).toBe('');
});

test('detail renders price, button, paragraphs', () => {
  const html = renderProductDetail(product());
  expect(html).toContain('24,90 €');
  expect(html).toContain('inkl. MwSt. zzgl. Versand');
  expect(html).toContain('In den Warenkorb');
  expect(html).not.toMatch(/data-shop-add disabled/);
  expect(html).toContain('<p>Eins</p>');
  expect(html).toContain('<p>Zwei</p>');
});

test('escapes script in title and description', () => {
  const evil = '<script>alert(1)</script>';
  const html = renderProductDetail(product({ title: evil, description: evil }));
  const list = renderProductList({ products: [product({ title: evil })], categories: [evil] });
  for (const h of [html, list]) {
    expect(h).not.toContain('<script>');
    expect(h).toContain('&lt;script&gt;');
  }
});

test('not orderable disables button and shows hint', () => {
  const html = renderProductDetail(product({ fromPriceCents: null, formats: [fmt({ orderable: false, priceCents: null })] }));
  expect(html).toMatch(/data-shop-add disabled/);
  expect(html).toContain('nicht bestellbar');
});

test('list: empty state, categories, from-price', () => {
  expect(renderProductList({ products: [], categories: [] })).toContain('Keine Produkte');
  const html = renderProductList({ products: [product()], categories: ['Rollenspiel'] }, 'Rollenspiel');
  expect(html).toContain('ab 24,90 €');
  expect(html).toContain('is-active');
});

test('renderPage emits shop containers', () => {
  const { renderPage } = require('../lib/templateEngine');
  const out = renderPage({ blocks: [{ type: 'shop-products' }, { type: 'shop-order' }, { type: 'shop-product', props: { slug: 'a"b' } }] });
  expect(out).toContain('<div class="shop-block" data-shop="products"></div>');
  expect(out).toContain('<div class="shop-block" data-shop="order"></div>');
  expect(out).toContain('data-shop="product" data-slug="a&quot;b"');
});

test('shipping mentions link to /versand-zahlung', () => {
  const { CART_TEMPLATE, CHECKOUT_TEMPLATE, SUMMARY_TEMPLATE } = require('../lib/shop/templates');
  expect(renderProductDetail({ title: 'A', formats: [{ sku: 'x', label: 'L', priceCents: 100, orderable: true }] })).toContain('href="/versand-zahlung"');
  for (const tpl of [CART_TEMPLATE, CHECKOUT_TEMPLATE, SUMMARY_TEMPLATE]) expect(tpl).toContain('href="/versand-zahlung"');
});

test('product card shows VAT/shipping note without nested link', () => {
  const html = renderProductList({ products: [{ title: 'T', slug: 't', fromPriceCents: 2490 }], categories: [] });
  expect(html).toContain('ab 24,90 € <small>inkl. MwSt. zzgl. Versand</small>');
  const card = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  expect(card.match(/<a /g)).toHaveLength(1);
});
