jest.disableAutomock();
const { hydrateShop } = require('../lib/shop/client/hydrate');

const flush = () => new Promise((r) => setTimeout(r, 0));
const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const fail = (status) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) });
const prod = { slug: 'x', title: 'Titel', category: 'RPG', description: 'D', images: [], fromPriceCents: 2490,
  formats: [{ sku: 'A', label: 'HC', priceCents: 2490, taxRateBp: 700, digital: false, orderable: true, inStock: true },
            { sku: 'B', label: 'PDF', priceCents: 990, taxRateBp: 700, digital: true, orderable: true, inStock: true }] };

beforeEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; window.localStorage.clear(); });

test('renders list, loads css once, filters by category', async () => {
  global.fetch = jest.fn(() => ok({ products: [prod], categories: ['RPG'] }));
  document.body.innerHTML = '<div id="r"><div class="shop-block" data-shop="products"></div></div>';
  const root = document.getElementById('r');
  hydrateShop(root); hydrateShop(root);
  await flush();
  expect(root.textContent).toContain('24,90 €');
  expect(document.querySelectorAll('link#temgine-shop-css')).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  root.querySelector('[data-shop-category="RPG"]').click();
  await flush();
  expect(fetch).toHaveBeenLastCalledWith('/api/shop/public/products?category=RPG&lang=de');
});

test('renders detail, switches price and adds selected sku to cart', async () => {
  global.fetch = jest.fn(() => ok({ product: prod }));
  document.body.innerHTML = '<div id="r"><span data-shop-cart-count></span><div class="shop-block" data-shop="product" data-slug="x"></div></div>';
  const root = document.getElementById('r');
  hydrateShop(root);
  await flush();
  const sel = root.querySelector('[data-shop-format]');
  sel.value = 'B'; sel.dispatchEvent(new Event('change'));
  expect(root.querySelector('[data-shop-price]').textContent).toBe('9,90 €');
  root.querySelector('[data-shop-add]').click();
  expect(JSON.parse(window.localStorage.getItem('temgine_shop_cart'))).toEqual([{ sku: 'B', qty: 1 }]);
  expect(root.querySelector('[data-shop-cart-count]').textContent).toBe('1');
});

test('error states', async () => {
  global.fetch = jest.fn(() => fail(404));
  document.body.innerHTML = '<div id="r"><div class="shop-block" data-shop="product" data-slug="x"></div><div class="shop-block" data-shop="products"></div></div>';
  hydrateShop(document.getElementById('r'));
  await flush();
  const t = document.getElementById('r').textContent;
  expect(t).toContain('Produkt nicht gefunden');
  expect(t).toContain('konnten nicht geladen werden');
});
