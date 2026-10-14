jest.disableAutomock();
const { hydrateShop } = require('../lib/shop/client/hydrate');

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const resp = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const countries = [{ code: 'DE', name: 'Deutschland' }, { code: 'US', name: 'USA' }];
let config;
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

beforeEach(() => { config = { currency: 'EUR', countries, paymentProviders: [{ id: 'sumup', label: 'SumUp' }] }; delete window.SumUpCard; document.head.innerHTML = ''; window.localStorage.clear(); cartResp = () => resp(200, priced()); checkoutResp = () => resp(201, { reference: 'ORD-2026-000001', totalCents: 2990, status: 'PENDING', payment: null }); });

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

test('submit posts only allowed keys, hides form, keeps cart, ignores double submit', async () => {
  const root = setup();
  await flush();
  fillAll(root);
  let resolve;
  checkoutResp = () => new Promise((r) => { resolve = r; });
  submit(root); submit(root);
  expect(fetch.mock.calls.filter((c) => c[0] === '/api/shop/checkout')).toHaveLength(1);
  resolve({ ok: true, status: 201, json: () => Promise.resolve({ reference: 'ORD-2026-000001', payment: { provider: 'sumup', client: { type: 'redirect', url: 'https://pay.example/x' } } }) });
  await flush();
  const body = JSON.parse(fetch.mock.calls.find((c) => c[0] === '/api/shop/checkout')[1].body);
  expect(Object.keys(body).sort()).toEqual(['acceptTerms', 'acceptWaiver', 'billing', 'email', 'items', 'provider']);
  expect(body.provider).toBe('sumup');
  expect(body.billing).toEqual({ name: 'Max', street: 'Weg 1', zip: '12345', city: 'Ort', country: 'DE' });
  expect(root.textContent).toContain('Bestellung ORD-2026-000001 angelegt.');
  expect(root.textContent).not.toContain('nächsten Schritt');
  expect(root.querySelector('form').hidden).toBe(true);
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

const widget = { provider: 'sumup', client: { type: 'widget', sdkUrl: 'https://gateway.sumup.com/sdk.js', checkoutId: 'co1', locale: 'de-DE' } };
const created = (payment) => () => resp(201, { reference: 'ORD-2026-000001', totalCents: 2990, status: 'PENDING', payment });
const sdkScripts = () => document.querySelectorAll('script[data-shop-sdk]');

test('single provider: no radio, id still sent; several: radios, choice sent', async () => {
  let root = setup();
  await flush();
  expect(root.querySelector('[name="provider"]')).toBeNull();
  config.paymentProviders = [{ id: 'sumup', label: 'SumUp' }, { id: 'paypal', label: 'PayPal' }];
  root = setup();
  await flush();
  expect(root.querySelectorAll('[name="provider"]')).toHaveLength(2);
  expect(root.querySelector('[name="provider"]').checked).toBe(true);
  root.querySelector('[value="paypal"]').checked = true;
  fillAll(root);
  submit(root);
  await flush();
  expect(JSON.parse(fetch.mock.calls.find((c) => c[0] === '/api/shop/checkout')[1].body).provider).toBe('paypal');
});

test('no provider: notice and disabled button', async () => {
  config.paymentProviders = [];
  const root = setup();
  await flush();
  expect(root.textContent).toContain('Zurzeit ist keine Zahlungsart verfügbar.');
  expect(root.querySelector('[data-shop-submit]').disabled).toBe(true);
});

test('widget: SDK loaded only after 201 and once, mount params, success redirects', async () => {
  const { nav } = require('../lib/shop/client/checkoutView');
  const go = jest.spyOn(nav, 'go').mockImplementation(() => {});
  checkoutResp = created(widget);
  const root = setup();
  await flush();
  expect(sdkScripts()).toHaveLength(0);
  fillAll(root);
  submit(root);
  await flush();
  expect(sdkScripts()).toHaveLength(1);
  expect(sdkScripts()[0].src).toBe('https://gateway.sumup.com/sdk.js');
  expect(root.querySelector('form').hidden).toBe(true);
  expect(root.querySelector('#shop-sumup-card')).toBeTruthy();
  const mount = jest.fn();
  window.SumUpCard = { mount };
  sdkScripts()[0].dispatchEvent(new Event('load'));
  await flush();
  expect(sdkScripts()).toHaveLength(1);
  expect(mount).toHaveBeenCalledTimes(1);
  const arg = mount.mock.calls[0][0];
  expect(arg).toMatchObject({ id: 'shop-sumup-card', checkoutId: 'co1', locale: 'de-DE' });
  arg.onResponse('success', {});
  expect(go).toHaveBeenCalledWith('/bestellung?ref=ORD-2026-000001');
  expect(JSON.parse(window.localStorage.getItem('temgine_shop_cart'))).toHaveLength(1);
  go.mockRestore();
});

test('widget: error shows message and retry remounts without second script', async () => {
  checkoutResp = created(widget);
  const mount = jest.fn();
  window.SumUpCard = { mount };
  const root = setup();
  await flush();
  fillAll(root);
  submit(root);
  await flush();
  expect(sdkScripts()).toHaveLength(0);
  mount.mock.calls[0][0].onResponse('fail', {});
  const retry = root.querySelector('[data-shop-retry]');
  expect(retry.hidden).toBe(false);
  expect(root.querySelector('[data-shop-payerror]').hidden).toBe(false);
  retry.click();
  await flush();
  expect(mount).toHaveBeenCalledTimes(2);
  expect(retry.hidden).toBe(true);
});

test('widget: SDK load error shows message', async () => {
  checkoutResp = created(widget);
  const root = setup();
  await flush();
  fillAll(root);
  submit(root);
  await flush();
  sdkScripts()[0].dispatchEvent(new Event('error'));
  await flush();
  expect(root.querySelector('[data-shop-payerror]').textContent).toContain('konnte nicht geladen werden');
  expect(root.querySelector('[data-shop-retry]').hidden).toBe(false);
});

test('redirect: navigates to client.url', async () => {
  const { nav } = require('../lib/shop/client/checkoutView');
  const go = jest.spyOn(nav, 'go').mockImplementation(() => {});
  checkoutResp = created({ provider: 'paypal', client: { type: 'redirect', url: 'https://pay.example/x' } });
  const root = setup();
  await flush();
  fillAll(root);
  submit(root);
  await flush();
  expect(go).toHaveBeenCalledWith('https://pay.example/x');
  go.mockRestore();
});

test.each([
  [409, 'NO_PAYMENT_PROVIDER', 'Zurzeit ist keine Zahlungsart verfügbar.'],
  [502, 'PAYMENT_UNAVAILABLE', 'derzeit nicht verfügbar'],
])('%i %s shows readable message', async (status, code, text) => {
  checkoutResp = () => resp(status, { error: 'x', code });
  const root = setup();
  await flush();
  fillAll(root);
  submit(root);
  await flush();
  expect(root.querySelector('[data-shop-formerror]').textContent).toContain(text);
  expect(root.querySelector('form').hidden).toBe(false);
  expect(root.querySelector('[data-shop-submit]').disabled).toBe(false);
});

// ---- Review-Fixes: a11y, SDK, Redirect, Race, Selektor ----

test('a11y: required fields carry aria-required; error span linked via aria-describedby and cleared; focus on first error', async () => {
  const root = setup();
  await flush();
  ['email', 'billing.name', 'billing.street', 'billing.zip', 'billing.city', 'billing.country', 'acceptTerms'].forEach((n) => {
    const el = root.querySelector(`[name="${n}"]`);
    expect(el.required).toBe(true);
    expect(el.getAttribute('aria-required')).toBe('true');
  });
  expect(root.querySelector('[name="shipping.name"]').required).toBe(false);
  expect(root.querySelector('form').hasAttribute('novalidate')).toBe(true);
  expect(root.querySelector('[data-shop-formerror]').getAttribute('role')).toBe('alert');
  checkoutResp = () => resp(422, { code: 'VALIDATION_ERROR', details: { fields: { 'billing.zip': 'PLZ ungültig', email: 'E-Mail ungültig' } } });
  submit(root);
  await flush();
  const email = root.querySelector('[name="email"]');
  expect(email.getAttribute('aria-describedby')).toBe(root.querySelector('[data-error-for="email"]').id);
  expect(document.activeElement).toBe(email);
  checkoutResp = () => resp(422, { code: 'VALIDATION_ERROR', details: { fields: { 'billing.zip': 'PLZ ungültig' } } });
  submit(root);
  await flush();
  expect(email.hasAttribute('aria-describedby')).toBe(false);
  expect(document.activeElement).toBe(root.querySelector('[name="billing.zip"]'));
  root.querySelector('[data-shop-diff]').click();
  expect(root.querySelector('[name="shipping.city"]').required).toBe(true);
});

test('server error without field focuses the form error', async () => {
  const root = setup();
  await flush();
  checkoutResp = () => resp(502, { code: 'PAYMENT_UNAVAILABLE' });
  submit(root);
  await flush();
  expect(document.activeElement).toBe(root.querySelector('[data-shop-formerror]'));
});

test('field key with quote does not crash and does not trigger the send-failure message', async () => {
  const root = setup();
  await flush();
  checkoutResp = () => resp(422, { code: 'VALIDATION_ERROR', details: { fields: { 'x"]y': 'Komisch' } } });
  submit(root);
  await flush();
  const fe = root.querySelector('[data-shop-formerror]');
  expect(fe.textContent).toBe('Komisch');
  expect(fe.textContent).not.toContain('nicht gesendet');
});

test.each([
  ['javascript:alert(1)'], ['http://evil.example/x'], ['not a url'], [undefined],
])('redirect to %s is refused', async (url) => {
  const { nav } = require('../lib/shop/client/checkoutView');
  const go = jest.spyOn(nav, 'go').mockImplementation(() => {});
  checkoutResp = created({ provider: 'paypal', client: { type: 'redirect', url } });
  const root = setup();
  await flush();
  fillAll(root);
  submit(root);
  await flush();
  expect(go).not.toHaveBeenCalled();
  expect(root.querySelector('[data-shop-formerror]').textContent).toBe('Die Zahlung konnte nicht gestartet werden.');
  expect(root.querySelector('form').hidden).toBe(false);
  go.mockRestore();
});

test('redirect to http://localhost is allowed', async () => {
  const { nav } = require('../lib/shop/client/checkoutView');
  const go = jest.spyOn(nav, 'go').mockImplementation(() => {});
  checkoutResp = created({ provider: 'paypal', client: { type: 'redirect', url: 'http://localhost:3000/pay' } });
  const root = setup();
  await flush();
  fillAll(root);
  submit(root);
  await flush();
  expect(go).toHaveBeenCalledWith('http://localhost:3000/pay');
  go.mockRestore();
});

test('stale country-change response is discarded', async () => {
  const pending = [];
  cartResp = () => new Promise((r) => pending.push(r));
  const root = setup();
  await flush();
  const sel = root.querySelector('[name="billing.country"]');
  sel.value = 'US';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
  expect(pending).toHaveLength(2);
  pending[1](await resp(200, priced({ totalCents: 3490 })));
  await flush();
  pending[0](await resp(200, priced({ totalCents: 2990 })));
  await flush();
  expect(root.querySelector('[data-shop-summary]').textContent).toContain('34,90 €');
  expect(root.querySelector('[data-shop-summary]').textContent).not.toContain('29,90 €');
});

describe('SDK loading', () => {
  const flushP = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  afterEach(() => jest.useRealTimers());

  test('stale script without window.SumUpCard is replaced', async () => {
    const stale = document.createElement('script');
    stale.setAttribute('data-shop-sdk', '1');
    document.head.appendChild(stale);
    checkoutResp = created(widget);
    const root = setup();
    await flush();
    fillAll(root);
    submit(root);
    await flush();
    expect(sdkScripts()).toHaveLength(1);
    expect(sdkScripts()[0]).not.toBe(stale);
  });

  test('15 s timeout shows message with retry; retry creates a fresh script', async () => {
    checkoutResp = created(widget);
    const root = setup();
    await flush();
    fillAll(root);
    jest.useFakeTimers();
    submit(root);
    await flushP();
    expect(sdkScripts()).toHaveLength(1);
    jest.advanceTimersByTime(15000);
    await flushP();
    expect(sdkScripts()).toHaveLength(0);
    expect(root.querySelector('[data-shop-payerror]').textContent).toContain('Zeitüberschreitung');
    const retry = root.querySelector('[data-shop-retry]');
    expect(retry.hidden).toBe(false);
    retry.click();
    await flushP();
    expect(sdkScripts()).toHaveLength(1);
    expect(retry.hidden).toBe(true);
  });

  test('load event without SumUpCard rejects instead of hanging', async () => {
    checkoutResp = created(widget);
    const root = setup();
    await flush();
    fillAll(root);
    submit(root);
    await flush();
    sdkScripts()[0].dispatchEvent(new Event('load'));
    await flush();
    expect(root.querySelector('[data-shop-retry]').hidden).toBe(false);
  });
});
