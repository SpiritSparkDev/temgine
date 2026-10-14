jest.disableAutomock();
const { hydrateShop } = require('../lib/shop/client/hydrate');

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const resp = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const config = { currency: 'EUR', countries: [{ code: 'DE', name: 'Deutschland' }, { code: 'US', name: 'USA' }] };
const line = (o = {}) => ({ sku: 'A', title: 'Buch', label: 'HC', qty: 1, unitCents: 2490, lineCents: 2490, digital: false, ...o });
const priced = (o = {}) => ({ lines: [line()], subtotalCents: 2490, taxBreakdown: {}, shippingCents: 500, totalCents: 2990, ...o });

let cartResp;
let checkoutResp;
const setup = (items = [{ sku: 'A', qty: 1 }]) => {
  window.localStorage.setItem('temgine_shop_cart', JSON.stringify(items));
  global.fetch = jest.fn((url, opts) => {
    if (url === '/api/shop/public/config') return resp(200, config);
    if (url === '/api/shop/checkout') return checkoutResp(opts);
    return cartResp(url);
  });
  document.body.innerHTML = '<div id="r"><div class="shop-block" data-shop="checkout"></div></div>';
  hydrateShop(document.getElementById('r'));
  return document.getElementById('r');
};
const fill = (root, name, value) => { root.querySelector(`[name="${name}"]`).value = value; };
const fillAll = (root) => {
  fill(root, 'email', 'a@b.de');
  ['name:Max', 'street:Weg 1', 'zip:12345', 'city:Ort'].forEach((p) => { const [k, v] = p.split(':'); fill(root, `billing.${k}`, v); });
  root.querySelector('[name="acceptTerms"]').checked = true;
};
const submit = (root) => root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

beforeEach(() => { document.head.innerHTML = ''; window.localStorage.clear(); cartResp = () => resp(200, priced()); checkoutResp = () => resp(201, { reference: 'ORD-2026-000001', totalCents: 2990, status: 'PENDING', payment: null }); });

test('empty cart shows empty state', async () => {
  const root = setup([]);
  await flush();
  expect(root.textContent).toContain('Ihr Warenkorb ist leer');
  expect(root.querySelector('form')).toBeNull();
});

test('renders form, summary, exact button text, terms links; waiver hidden without digital', async () => {
  const root = setup();
  await flush();
  const btn = root.querySelector('[data-shop-submit]');
  expect(btn.textContent).toBe('Zahlungspflichtig bestellen');
  expect(btn.disabled).toBe(false);
  expect(root.textContent).toContain('29,90 €');
  expect(root.querySelector('a[href="/agb"]')).toBeTruthy();
  expect(root.querySelector('a[href="/widerruf"]')).toBeTruthy();
  expect(root.textContent).toContain('[PLATZHALTER – Rechtstext folgt]');
  expect(root.querySelector('[data-shop-waiver]').hidden).toBe(true);
  expect(root.querySelector('[data-shop-shipping-group]').hidden).toBe(true);
  root.querySelector('[data-shop-diff]').click();
  expect(root.querySelector('[data-shop-shipping-group]').hidden).toBe(false);
});

test('waiver checkbox appears for digital lines', async () => {
  cartResp = () => resp(200, priced({ lines: [line({ digital: true })] }));
  const root = setup();
  await flush();
  expect(root.querySelector('[data-shop-waiver]').hidden).toBe(false);
});

test('country change reloads summary; shipping error blocks button', async () => {
  const root = setup();
  await flush();
  cartResp = () => resp(200, priced({ shippingCents: null, totalCents: null, shippingError: { code: 'SHIPPING_UNAVAILABLE', message: 'Versand in dieses Land nicht möglich.' } }));
  const sel = root.querySelector('[name="billing.country"]');
  sel.value = 'US'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
  expect(fetch).toHaveBeenLastCalledWith('/api/shop/cart?items=A:1&country=US');
  expect(root.textContent).toContain('Versand in dieses Land nicht möglich.');
  expect(root.querySelector('[data-shop-submit]').disabled).toBe(true);
});

test('submit posts only allowed keys, shows note, keeps cart, ignores double submit', async () => {
  const root = setup();
  await flush();
  fillAll(root);
  let resolve;
  checkoutResp = () => new Promise((r) => { resolve = r; });
  submit(root); submit(root);
  expect(fetch.mock.calls.filter((c) => c[0] === '/api/shop/checkout')).toHaveLength(1);
  resolve({ ok: true, status: 201, json: () => Promise.resolve({ reference: 'ORD-2026-000001' }) });
  await flush();
  const body = JSON.parse(fetch.mock.calls.find((c) => c[0] === '/api/shop/checkout')[1].body);
  expect(Object.keys(body).sort()).toEqual(['acceptTerms', 'acceptWaiver', 'billing', 'email', 'items']);
  expect(body.billing).toEqual({ name: 'Max', street: 'Weg 1', zip: '12345', city: 'Ort', country: 'DE' });
  expect(root.textContent).toContain('Bestellung ORD-2026-000001 angelegt. Die Zahlung wird in einem nächsten Schritt angebunden.');
  expect(JSON.parse(window.localStorage.getItem('temgine_shop_cart'))).toEqual([{ sku: 'A', qty: 1 }]);
});

test('sends shipping when different address is checked', async () => {
  const root = setup();
  await flush();
  fillAll(root);
  root.querySelector('[data-shop-diff]').click();
  await flush();
  ['name', 'street', 'zip', 'city'].forEach((k) => fill(root, `shipping.${k}`, 'S'));
  submit(root);
  await flush();
  const body = JSON.parse(fetch.mock.calls.find((c) => c[0] === '/api/shop/checkout')[1].body);
  expect(body.shipping).toMatchObject({ name: 'S', country: 'DE' });
});

test('422 field errors are shown per field with aria-invalid', async () => {
  const root = setup();
  await flush();
  checkoutResp = () => resp(422, { error: 'Eingaben prüfen', code: 'VALIDATION_ERROR', details: { fields: { 'billing.zip': 'PLZ ungültig', email: 'E-Mail ungültig' } } });
  submit(root);
  await flush();
  expect(root.querySelector('[name="billing.zip"]').getAttribute('aria-invalid')).toBe('true');
  expect(root.querySelector('[data-error-for="billing.zip"]').textContent).toBe('PLZ ungültig');
  expect(root.querySelector('[data-error-for="email"]').hidden).toBe(false);
  expect(root.querySelector('[data-shop-submit]').disabled).toBe(false);
});
