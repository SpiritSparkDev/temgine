jest.disableAutomock();
const { hydrateAccount } = require('../lib/shop/client/accountView');
const { hydrateReturn, parseItems } = require('../lib/shop/client/returnView');
const { mountProductExtras } = require('../lib/shop/client/productExtras');
const { mountCartExtras } = require('../lib/shop/client/cartExtras');
const { t } = require('../lib/shop/i18n');
const account = require('../lib/shop/i18n/account').default;

const flush = () => new Promise((r) => setTimeout(r, 0));
const res = (status, body = {}) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
const route = (map) => jest.fn((url, opts = {}) => {
  const key = `${opts.method || 'GET'} ${url.split('?')[0]}`;
  const h = map[key];
  return h ? Promise.resolve(typeof h === 'function' ? h(url, opts) : h) : res(404);
});
const setUrl = (q) => window.history.replaceState({}, '', `/x${q}`);
const mk = () => { document.body.innerHTML = '<div id="b"></div>'; return document.getElementById('b'); };

beforeEach(() => { document.body.innerHTML = ''; setUrl(''); });

test('i18n: de and en have the same keys', () => {
  expect(Object.keys(account.en).sort()).toEqual(Object.keys(account.de).sort());
  expect(t('en', 'account.ordersTitle')).toBe('My orders');
});

test('account: not logged in shows login link with return target', async () => {
  global.fetch = route({ 'GET /api/shop/account/orders': res(401, { code: 'LOGIN_REQUIRED' }) });
  const el = mk();
  await hydrateAccount(el);
  const a = el.querySelector('a');
  expect(a.getAttribute('href')).toBe('/member-login?redirect=%2Fx');
});

test('account: list, detail with invoice/downloads/https-only tracking, wishlist remove', async () => {
  let items = [{ slug: 'p1', title: 'Prod', fromPriceCents: 990 }];
  global.fetch = route({
    'GET /api/shop/account/orders': res(200, { orders: [{ reference: 'ORD-1', status: 'SHIPPED', totalCents: 2490, currency: 'EUR', createdAt: '2026-01-02T10:00:00Z', tracking: { carrier: 'DHL', number: '123', url: 'javascript:alert(1)' } }] }),
    'GET /api/shop/account/orders/ORD-1': res(200, { order: { reference: 'ORD-1', status: 'SHIPPED', currency: 'EUR', createdAt: '2026-01-02T10:00:00Z', items: [{ title: '<b>X</b>', label: 'HC', qty: 2, unitCents: 1000, discountCents: 0 }], subtotalCents: 2000, discountCents: 0, shippingCents: 490, totalCents: 2490, refundedCents: 0, taxBreakdown: { 700: 163 }, tracking: { carrier: 'DHL', number: '123', url: 'https://dhl.example/t/123' }, downloads: [{ filename: 'a.pdf', url: '/api/shop/download/tok', remaining: 3 }, { filename: 'evil', url: 'javascript:1' }], invoiceUrl: '/api/shop/account/orders/ORD-1/invoice' } }),
    'GET /api/shop/account/wishlist': () => res(200, { items }),
    'DELETE /api/shop/account/wishlist': () => { items = []; return res(200, { ok: true }); },
  });
  const el = mk();
  await hydrateAccount(el);
  expect(el.textContent).toContain('ORD-1');
  expect(el.textContent).toContain('Versendet');
  expect(el.innerHTML).not.toContain('javascript:');
  expect(el.querySelector('[data-wish-remove]')).not.toBeNull();
  el.querySelector('[data-wish-remove]').click();
  await flush();
  expect(el.textContent).toContain('Deine Wunschliste ist leer');
  el.querySelector('[data-account-open]').click();
  await flush();
  expect(el.innerHTML).not.toContain('<b>X</b>');
  expect(el.querySelector('a[href="/api/shop/account/orders/ORD-1/invoice"]')).not.toBeNull();
  expect(el.querySelector('a[href="/api/shop/download/tok"]')).not.toBeNull();
  expect(el.querySelector('a[href="https://dhl.example/t/123"]')).not.toBeNull();
  expect(el.innerHTML).not.toContain('javascript:');
});

test('return: prefill from ?ref, validation, success, error codes', async () => {
  setUrl('?ref=ORD-7');
  let out = res(201, { id: 'r1', status: 'NEW' });
  global.fetch = route({ 'POST /api/shop/public/returns': () => out });
  const el = mk();
  hydrateReturn(el);
  expect(el.querySelector('#rt-ref').value).toBe('ORD-7');
  el.querySelector('#rt-email').value = 'a@b.de';
  el.querySelector('#rt-reason').value = 'abc';
  el.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(fetch).not.toHaveBeenCalled();
  expect(el.querySelector('[data-err="rt-reason"]').hidden).toBe(false);
  el.querySelector('#rt-reason').value = 'Zu klein bestellt';
  el.querySelector('#rt-items').value = 'ABC-1:2';
  el.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ reference: 'ORD-7', email: 'a@b.de', reason: 'Zu klein bestellt', items: [{ sku: 'ABC-1', qty: 2 }] });
  expect(el.querySelector('[data-return-ok]').hidden).toBe(false);
  out = res(422, { code: 'RETURN_PERIOD_OVER' });
  el.querySelector('#rt-email').value = 'a@b.de';
  el.querySelector('#rt-reason').value = 'Zu klein bestellt';
  el.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(el.querySelector('[data-return-error]').textContent).toContain('Rückgabefrist');
  out = res(404, { code: 'NOT_FOUND' });
  el.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(el.querySelector('[data-return-error]').textContent).toContain('keine passende Bestellung');
  expect(parseItems('A:0')).toBeNull();
  expect(parseItems('')).toEqual([]);
});

const product = { slug: 'p1', title: 'P', formats: [{ sku: 'A', label: 'HC', priceCents: 1000, inStock: false }, { sku: 'B', label: 'PDF', priceCents: 500, inStock: true }], related: [{ slug: 'r1', title: 'Rel', image: null, fromPriceCents: 700 }] };

test('product extras: login hint when 401, notify form neutral, related, stockalert notice', async () => {
  setUrl('?stockalert=confirmed');
  global.fetch = route({
    'GET /api/shop/account/wishlist': res(401, {}),
    'POST /api/shop/public/stock-alerts': res(202, { ok: true }),
  });
  const el = mk();
  mountProductExtras(el, { product, locale: 'de' });
  await flush();
  expect(el.querySelector('[data-extras-alert]').textContent).toContain('aktiv');
  expect(el.querySelector('[data-extras-wish] a').getAttribute('href')).toContain('/member-login');
  expect(el.querySelector('a[href="/shop/r1"]')).not.toBeNull();
  el.querySelector('#nt-email').value = 'bad';
  el.querySelector('[data-extras-notify]').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  expect(el.querySelector('[data-notify-error]').hidden).toBe(false);
  el.querySelector('#nt-email').value = 'x@y.de';
  el.querySelector('[data-extras-notify]').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  const post = fetch.mock.calls.find((c) => c[0] === '/api/shop/public/stock-alerts');
  expect(JSON.parse(post[1].body)).toEqual({ sku: 'A', email: 'x@y.de', locale: 'de' });
  expect(el.querySelector('[data-notify-ok]').hidden).toBe(false);
});

test('product extras: wishlist toggle when logged in; no notify form if all in stock', async () => {
  let items = [];
  global.fetch = route({
    'GET /api/shop/account/wishlist': () => res(200, { items }),
    'POST /api/shop/account/wishlist': () => { items = [{ slug: 'p1' }]; return res(200, { ok: true }); },
    'DELETE /api/shop/account/wishlist': () => { items = []; return res(200, { ok: true }); },
  });
  const el = mk();
  mountProductExtras(el, { product: { ...product, formats: [product.formats[1]], related: [] }, locale: 'de' });
  await flush();
  expect(el.querySelector('[data-extras-notify]')).toBeNull();
  el.querySelector('[data-wish-toggle]').click();
  await flush();
  expect(JSON.parse(fetch.mock.calls.find((c) => c[1] && c[1].method === 'POST')[1].body)).toEqual({ productSlug: 'p1' });
  expect(el.querySelector('[data-wish-toggle]').getAttribute('aria-pressed')).toBe('true');
  el.querySelector('[data-wish-toggle]').click();
  await flush();
  expect(el.querySelector('[data-wish-toggle]').getAttribute('aria-pressed')).toBe('false');
});

test('cart extras: recommendations as cards', async () => {
  global.fetch = route({ 'GET /api/shop/public/recommendations': res(200, { products: [{ slug: 'r2', title: 'Reco <i>', image: null, fromPriceCents: 1290 }] }) });
  const el = mk();
  await mountCartExtras(el, { items: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }], locale: 'en' });
  expect(fetch.mock.calls[0][0]).toBe('/api/shop/public/recommendations?skus=A,B&lang=en');
  expect(el.querySelector('a[href="/shop/r2"]')).not.toBeNull();
  expect(el.textContent).toContain('from');
  expect(el.innerHTML).not.toContain('<i>');
});
