jest.disableAutomock();
jest.mock('../lib/shop/client/productExtras', () => ({ mountProductExtras: jest.fn() }));
jest.mock('../lib/shop/client/cartExtras', () => ({ mountCartExtras: jest.fn() }));
const { hydrateShop } = require('../lib/shop/client/hydrate');
const { renderProductDetail, formatPriceCents } = require('../lib/shop/templates');
const { mountProductExtras } = require('../lib/shop/client/productExtras');
const { mountCartExtras } = require('../lib/shop/client/cartExtras');
const { t } = require('../lib/shop/i18n');

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const resp = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const store = (items) => window.localStorage.setItem('temgine_shop_cart', JSON.stringify(items));
const isConfig = (url) => url === '/api/shop/public/config';
const fmt = (o = {}) => ({ sku: 'A', label: 'HC', priceCents: 2000, taxRateBp: 700, digital: false, orderable: true, inStock: true, tiers: [], bundle: null, ...o });
const prod = (formats) => ({ slug: 'x', title: 'Titel', description: 'D', images: [], fromPriceCents: 2000, formats });
const line = (o = {}) => ({ sku: 'A', title: 'Buch', label: 'HC', qty: 2, unitCents: 2000, lineCents: 4000, discountCents: 0, digital: false, bundle: null, ...o });
const cart = (o = {}) => ({ lines: [line()], subtotalCents: 4000, discountCents: 0, coupon: null, taxBreakdown: {}, shippingCents: null, shippingTaxBp: null, totalCents: null, currency: 'EUR', freeShipping: null, ...o });

beforeEach(() => { document.head.innerHTML = ''; document.documentElement.lang = ''; window.localStorage.clear(); jest.clearAllMocks(); });

describe('formatting and dictionary', () => {
  test('currency and locale via Intl', () => {
    expect(formatPriceCents(2490, 'EUR', 'de')).toBe('24,90 €');
    expect(formatPriceCents(2490, 'CHF', 'en')).toMatch(/CHF\s?24\.90/);
    expect(formatPriceCents(2490, 'XX!', 'de')).toBe('24,90 €');
  });
  test('de and en have the same keys', () => {
    const { de, en } = require('../lib/shop/i18n/storefront').default;
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    expect(t('en', 'shop.addToCart')).toBe('Add to cart');
  });
});

describe('product page', () => {
  const mount = () => {
    document.body.innerHTML = '<div id="r"><div class="shop-block" data-shop="product" data-slug="x"></div></div>';
    hydrateShop(document.getElementById('r'));
    return document.getElementById('r');
  };

  test('tiers table, bundle, qty-based price, lang param, extras', async () => {
    const p = prod([fmt({ tiers: [{ minQty: 5, priceCents: 1500 }], bundle: [{ title: 'Teil', label: 'PDF', qty: 2 }] })]);
    global.fetch = jest.fn((url) => (isConfig(url) ? resp(200, { locale: 'en', currency: 'GBP' }) : resp(200, { product: p })));
    const root = mount();
    await flush();
    expect(fetch).toHaveBeenCalledWith('/api/shop/public/products/x?lang=en');
    expect(root.textContent).toContain('Quantity discounts');
    expect(root.querySelectorAll('.shop-tiers tbody tr')).toHaveLength(2);
    expect(root.querySelector('.shop-bundle').textContent).toContain('2 × Teil (PDF)');
    expect(root.querySelector('[data-shop-price]').textContent).toBe('£20.00');
    const q = root.querySelector('[data-shop-product-qty]');
    q.value = '5'; q.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-shop-price]').textContent).toBe('£15.00');
    root.querySelector('[data-shop-add]').click();
    expect(JSON.parse(window.localStorage.getItem('temgine_shop_cart'))).toEqual([{ sku: 'A', qty: 5 }]);
    expect(mountProductExtras).toHaveBeenCalledTimes(1);
    expect(mountProductExtras.mock.calls[0][0]).toBe(root.querySelector('[data-shop-product-extras]'));
    expect(mountProductExtras.mock.calls[0][1]).toMatchObject({ product: p, locale: 'en' });
  });

  test('a failing extras module does not break the page', async () => {
    mountProductExtras.mockImplementationOnce(() => { throw new Error('boom'); });
    global.fetch = jest.fn((url) => (isConfig(url) ? resp(200, {}) : resp(200, { product: prod([fmt()]) })));
    const root = mount();
    await flush();
    expect(root.textContent).toContain('In den Warenkorb');
  });

  test('not orderable: hint, disabled add and qty', () => {
    const html = renderProductDetail(prod([fmt({ orderable: false })]));
    expect(html).toContain('nicht bestellbar');
    expect(html).toMatch(/data-shop-add disabled/);
    expect(html).toMatch(/data-shop-product-qty disabled/);
  });
});

describe('cart', () => {
  const mount = () => {
    document.body.innerHTML = '<div id="r"><span data-shop-cart-count></span><div class="shop-block" data-shop="cart"></div></div>';
    hydrateShop(document.getElementById('r'));
    return document.getElementById('r');
  };

  test('apply and remove coupon, discount row, free-shipping hint, extras', async () => {
    store([{ sku: 'A', qty: 2 }]);
    const withCoupon = cart({ discountCents: 400, coupon: { code: 'SOMMER', type: 'FIXED', value: 400 }, freeShipping: { fromCents: 5000, remainingCents: 1400 } });
    global.fetch = jest.fn((url) => {
      if (isConfig(url)) return resp(200, {});
      return resp(200, url.includes('coupon=SOMMER') ? withCoupon : cart({ freeShipping: { fromCents: 5000, remainingCents: 1000 } }));
    });
    const root = mount();
    await flush();
    expect(root.textContent).toContain('Noch 10,00 € bis zum versandkostenfreien Versand.');
    root.querySelector('[data-shop-coupon-input]').value = 'sommer';
    root.querySelector('[data-shop-coupon-apply]').click();
    await flush();
    expect(fetch).toHaveBeenLastCalledWith('/api/shop/cart?items=A:2&coupon=SOMMER');
    expect(window.localStorage.getItem('temgine_shop_coupon')).toBe('SOMMER');
    expect(root.querySelector('.shop-discount').textContent).toContain('-4,00 €');
    expect(root.textContent).toContain('Noch 14,00 €');
    expect(mountCartExtras).toHaveBeenCalled();
    expect(mountCartExtras.mock.calls.pop()[1]).toMatchObject({ items: [{ sku: 'A', qty: 2 }], locale: 'de' });
    root.querySelector('[data-shop-coupon-remove]').click();
    await flush();
    expect(window.localStorage.getItem('temgine_shop_coupon')).toBeNull();
    expect(root.querySelector('.shop-discount')).toBeNull();
  });

  test('rejected coupon is dropped with a readable message', async () => {
    store([{ sku: 'A', qty: 2 }]);
    window.localStorage.setItem('temgine_shop_coupon', 'ALT');
    global.fetch = jest.fn((url) => {
      if (isConfig(url)) return resp(200, {});
      return url.includes('coupon=') ? resp(422, { error: 'x', code: 'COUPON_EXPIRED' }) : resp(200, cart());
    });
    const root = mount();
    await flush();
    expect(root.querySelector('[data-shop-coupon-message]').textContent).toBe(t('de', 'shop.coupon.COUPON_EXPIRED'));
    expect(window.localStorage.getItem('temgine_shop_coupon')).toBeNull();
    expect(root.querySelector('a[href="/kasse"]')).toBeTruthy();
  });

  test('shipping line with VAT and free shipping reached, English', async () => {
    store([{ sku: 'A', qty: 2 }]);
    global.fetch = jest.fn((url) => (isConfig(url) ? resp(200, { locale: 'en' }) : resp(200, cart({ shippingCents: 490, shippingTaxBp: 1900, totalCents: 4490, freeShipping: { fromCents: 3000, remainingCents: 0 } }))));
    const root = mount();
    await flush();
    expect(root.textContent).toContain('Shipping');
    expect(root.textContent).toContain('€4.90');
    expect(root.textContent).toContain('incl. 19 % VAT');
    expect(root.textContent).toContain('Your order ships for free.');
    expect(root.textContent).toContain('Total');
  });

  test('bundle contents are listed', async () => {
    store([{ sku: 'A', qty: 2 }]);
    global.fetch = jest.fn((url) => (isConfig(url) ? resp(200, {}) : resp(200, cart({ lines: [line({ bundle: [{ sku: 'B', title: 'Teil', label: 'PDF', qty: 2 }] })] }))));
    const root = mount();
    await flush();
    expect(root.querySelector('.shop-bundle-list').textContent).toContain('2 × Teil (PDF)');
  });
});

describe('checkout', () => {
  test('sends coupon and locale, summary shows discount, redirects to order page with token', async () => {
    const { nav } = require('../lib/shop/client/checkoutView');
    const go = jest.spyOn(nav, 'go').mockImplementation(() => {});
    store([{ sku: 'A', qty: 2 }]);
    window.localStorage.setItem('temgine_shop_coupon', 'SOMMER');
    const priced = cart({ discountCents: 400, coupon: { code: 'SOMMER' }, shippingCents: 490, shippingTaxBp: 700, totalCents: 4090 });
    global.fetch = jest.fn((url) => {
      if (isConfig(url)) return resp(200, { currency: 'EUR', locale: 'de', countries: [{ code: 'DE', name: 'Deutschland' }], paymentProviders: [{ id: 'sumup', label: 'SumUp' }] });
      if (url === '/api/shop/checkout') return resp(201, { reference: 'ORD-1', accessToken: 'tok12345678', payment: { client: { type: 'widget', sdkUrl: 'https://gateway.sumup.com/sdk.js', checkoutId: 'c', locale: 'de-DE' } } });
      return resp(200, priced);
    });
    window.SumUpCard = { mount: jest.fn() };
    document.body.innerHTML = '<div id="r"><div class="shop-block" data-shop="checkout"></div></div>';
    hydrateShop(document.getElementById('r'));
    await flush();
    const root = document.getElementById('r');
    expect(root.querySelector('[data-shop-summary]').textContent).toContain('-4,00 €');
    expect(root.querySelector('[data-shop-summary]').textContent).toContain('inkl. 7 % MwSt.');
    const set = (n, v) => { root.querySelector(`[name="${n}"]`).value = v; };
    set('email', 'a@b.de');
    ['name', 'street', 'zip', 'city'].forEach((k) => set(`billing.${k}`, 'X'));
    root.querySelector('[name="acceptTerms"]').checked = true;
    root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await flush();
    const body = JSON.parse(fetch.mock.calls.find((c) => c[0] === '/api/shop/checkout')[1].body);
    expect(body).toMatchObject({ coupon: 'SOMMER', locale: 'de' });
    window.SumUpCard.mount.mock.calls[0][0].onResponse('success', {});
    expect(go).toHaveBeenCalledWith('/bestellung?ref=ORD-1&t=tok12345678');
    delete window.SumUpCard;
    go.mockRestore();
  });
});

describe('order page', () => {
  const run = async (search, body, status = 200) => {
    window.history.pushState({}, '', '/bestellung' + search);
    global.fetch = jest.fn(() => resp(status, body));
    document.body.innerHTML = '<div id="r"><div class="shop-block" data-shop="order"></div></div>';
    hydrateShop(document.getElementById('r'));
    await flush();
    return document.getElementById('r');
  };

  test('missing token: readable message, no request', async () => {
    const root = await run('?ref=ORD-1', {});
    expect(fetch).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Zugangslink');
  });

  test('paid: downloads, invoice, tracking (only https clickable)', async () => {
    const paid = {
      reference: 'ORD-1', status: 'SHIPPED', paid: true, totalCents: 2990, currency: 'EUR',
      downloads: [{ filename: 'Regeln.pdf', url: '/api/shop/download/abc', remaining: 4, expiresAt: '2026-12-01T00:00:00.000Z' }, { filename: 'Evil', url: 'javascript:alert(1)' }],
      invoiceUrl: '/api/shop/public/orders/ORD-1/invoice?t=tok12345678',
      trackingCarrier: 'DHL', trackingNumber: '123', trackingUrl: 'https://track.example/123',
    };
    let root = await run('?ref=ORD-1&t=tok12345678', paid);
    expect(fetch).toHaveBeenCalledWith('/api/shop/public/orders/ORD-1?t=tok12345678');
    expect(root.querySelector('a[href="/api/shop/download/abc"]').textContent).toBe('Regeln.pdf');
    expect(root.textContent).toContain('noch 4 Downloads');
    expect(root.textContent).not.toContain('Evil');
    expect(root.querySelector('a[href^="/api/shop/public/orders/ORD-1/invoice"]')).toBeTruthy();
    expect(root.textContent).toContain('DHL');
    expect(root.querySelector('a[href="https://track.example/123"]')).toBeTruthy();
    root = await run('?ref=ORD-1&t=tok12345678', { ...paid, trackingUrl: 'javascript:alert(1)' });
    expect(root.querySelector('.shop-tracking a')).toBeNull();
    expect(root.textContent).toContain('123');
  });
});
