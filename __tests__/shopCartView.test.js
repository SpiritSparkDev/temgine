jest.disableAutomock();
const { hydrateShop } = require('../lib/shop/client/hydrate');

const flush = () => new Promise((r) => setTimeout(r, 0));
const resp = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const cartData = {
  lines: [{ sku: 'A', title: '<b>Titel</b>', label: 'HC', qty: 2, unitCents: 2490, lineCents: 4980, digital: false }],
  subtotalCents: 4980, taxBreakdown: { 700: 326 }, shippingCents: null, totalCents: null,
};
const mount = () => {
  document.body.innerHTML = '<div id="r"><span data-shop-cart-count></span><div class="shop-block" data-shop="cart"></div></div>';
  hydrateShop(document.getElementById('r'));
  return document.getElementById('r');
};
const store = (items) => window.localStorage.setItem('temgine_shop_cart', JSON.stringify(items));

beforeEach(() => { document.head.innerHTML = ''; window.localStorage.clear(); });

test('empty cart shows empty state with shop link and no fetch', async () => {
  global.fetch = jest.fn();
  const root = mount();
  await flush();
  expect(root.textContent).toContain('Ihr Warenkorb ist leer');
  expect(root.querySelector('a[href="/shop"]')).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});

test('renders lines escaped, prices from API, checkout link, hint', async () => {
  store([{ sku: 'A b', qty: 2 }]);
  global.fetch = jest.fn(() => resp(200, cartData));
  const root = mount();
  await flush();
  expect(fetch).toHaveBeenCalledWith('/api/shop/cart?items=A%20b:2');
  expect(root.querySelector('b')).toBeNull();
  expect(root.textContent).toContain('<b>Titel</b>');
  expect(root.textContent).toContain('49,80 €');
  expect(root.textContent).toContain('Versandkosten werden in der Kasse berechnet');
  expect(root.querySelector('a[href="/kasse"]').textContent).toBe('Zur Kasse');
});

test('qty change and remove update storage and reload', async () => {
  store([{ sku: 'A', qty: 2 }]);
  global.fetch = jest.fn(() => resp(200, cartData));
  const root = mount();
  await flush();
  const input = root.querySelector('[data-shop-qty="A"]');
  input.value = '5'; input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
  expect(JSON.parse(window.localStorage.getItem('temgine_shop_cart'))).toEqual([{ sku: 'A', qty: 5 }]);
  expect(root.querySelector('[data-shop-cart-count]').textContent).toBe('5');
  root.querySelector('[data-shop-remove="A"]').click();
  await flush();
  expect(window.localStorage.getItem('temgine_shop_cart')).toBe('[]');
  expect(root.textContent).toContain('Ihr Warenkorb ist leer');
});

test('422 with details.sku shows hint on that line with remove button, no checkout link', async () => {
  store([{ sku: 'A', qty: 1 }, { sku: 'B', qty: 1 }]);
  global.fetch = jest.fn(() => resp(422, { error: 'Nicht mehr verfügbar', code: 'NOT_ORDERABLE', details: { sku: 'B' } }));
  const root = mount();
  await flush();
  const row = root.querySelector('[data-shop-line="B"]');
  expect(row.textContent).toContain('Nicht mehr verfügbar');
  expect(root.querySelector('[data-shop-line="A"]').textContent).not.toContain('Nicht mehr verfügbar');
  expect(root.querySelector('a[href="/kasse"]')).toBeNull();
  global.fetch = jest.fn(() => resp(200, cartData));
  row.querySelector('[data-shop-remove]').click();
  await flush();
  expect(JSON.parse(window.localStorage.getItem('temgine_shop_cart'))).toEqual([{ sku: 'A', qty: 1 }]);
  expect(root.querySelector('a[href="/kasse"]')).toBeTruthy();
});
