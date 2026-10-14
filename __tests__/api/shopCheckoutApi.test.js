/**
 * __tests__/api/shopCheckoutApi.test.js
 * POST /api/shop/checkout: Prisma, Session, Pricing und Versandkonfiguration gemockt.
 */

jest.disableAutomock();

const mockTx = { shopOrder: { create: jest.fn(), update: jest.fn() } };
const mockPrisma = {
  setting: { findUnique: jest.fn() },
  shopOrder: { updateMany: jest.fn() },
  shopFormat: { findMany: jest.fn() },
  member: { findUnique: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockTx)),
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
jest.mock('../../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));
jest.mock('../../lib/shop/config', () => ({ isShopEnabled: jest.fn(), loadShopSettings: jest.fn() }));
jest.mock('../../lib/shop/providers', () => ({ listAvailableProviders: jest.fn() }));
jest.mock('../../lib/shop/payments', () => ({ startPayment: jest.fn() }));
jest.mock('../../lib/shop/shippingConfig', () => ({ loadShippingConfig: jest.fn() }));
jest.mock('../../lib/shop/coupons', () => ({ lookupCoupon: jest.fn() }));
jest.mock('../../lib/shop/reservations', () => ({ reservedByOthers: jest.fn(), reserveStock: jest.fn(), releaseReservations: jest.fn() }));
jest.mock('../../lib/shop/events', () => ({ logOrderEvent: jest.fn() }));
jest.mock('../../lib/shop/pricing', () => {
  class ShopPricingError extends Error {
    constructor(code, message, details = {}) { super(message); this.code = code; this.details = details; }
  }
  return { priceOrder: jest.fn(), ShopPricingError };
});

const { getServerSession } = require('next-auth/next');
const { isShopEnabled, loadShopSettings } = require('../../lib/shop/config');
const { listAvailableProviders } = require('../../lib/shop/providers');
const { startPayment } = require('../../lib/shop/payments');
const { loadShippingConfig } = require('../../lib/shop/shippingConfig');
const { priceOrder, ShopPricingError } = require('../../lib/shop/pricing');
const { lookupCoupon } = require('../../lib/shop/coupons');
const { reservedByOthers, reserveStock, releaseReservations } = require('../../lib/shop/reservations');
const { logOrderEvent } = require('../../lib/shop/events');
const handler = require('../../pages/api/shop/checkout').default;

let ipCounter = 0;
function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}
const addr = (o = {}) => ({ name: 'Max', street: 'Weg 1', zip: '12345', city: 'Stadt', country: 'DE', ...o });
const body = (o = {}) => ({ items: [{ sku: 'A', qty: 2 }], email: 'a@b.de', billing: addr(), acceptTerms: true, ...o });
const call = async (b, method = 'POST') => {
  const res = makeRes();
  await handler({ method, body: b, headers: { 'x-forwarded-for': `10.0.0.${++ipCounter}` } }, res);
  return res;
};

const line = { formatId: 'f1', sku: 'A', title: 'Buch', label: 'Hardcover', qty: 2, unitCents: 1000, lineCents: 2000, discountCents: 0, taxRateBp: 700, digital: false, weightG: 500, bundle: null };
const priced = { lines: [line], subtotalCents: 2000, discountCents: 0, taxBreakdown: { 700: 131 }, hasPhysical: true, shippingCents: 400, shippingTaxBp: null, totalCents: 2400, coupon: null, currency: 'EUR' };

beforeEach(() => {
  jest.clearAllMocks();
  isShopEnabled.mockResolvedValue(true);
  loadShopSettings.mockResolvedValue({});
  listAvailableProviders.mockReturnValue([{ id: 'sumup', label: 'SumUp' }]);
  startPayment.mockResolvedValue({ provider: 'sumup', client: { type: 'widget', checkoutId: 'c1' } });
  mockPrisma.shopOrder.updateMany.mockResolvedValue({ count: 1 });
  loadShippingConfig.mockResolvedValue({ countries: { DE: 'Deutschland', AT: 'Österreich' }, zones: [] });
  getServerSession.mockResolvedValue(null);
  mockPrisma.setting.findUnique.mockResolvedValue(null);
  mockPrisma.shopFormat.findMany.mockResolvedValue([{ id: 'f1', sku: 'A' }]);
  priceOrder.mockReturnValue(priced);
  lookupCoupon.mockResolvedValue(null);
  reservedByOthers.mockResolvedValue(new Map());
  reserveStock.mockResolvedValue([]);
  releaseReservations.mockResolvedValue(1);
  mockTx.shopOrder.create.mockResolvedValue({ id: 'o1', number: 123 });
  mockTx.shopOrder.update.mockImplementation(async ({ data }) => ({ id: 'o1', totalCents: 2400, ...data }));
});

test('404 when add-on is off, 405 for other methods', async () => {
  isShopEnabled.mockResolvedValue(false);
  expect((await call(body())).status).toHaveBeenCalledWith(404);
  isShopEnabled.mockResolvedValue(true);
  expect((await call(body(), 'GET')).status).toHaveBeenCalledWith(405);
});

test('429 after 10 requests from one IP, with retryAfter', async () => {
  let last;
  for (let i = 0; i < 11; i++) {
    const res = makeRes();
    await handler({ method: 'POST', body: {}, headers: { 'x-forwarded-for': '9.9.9.9' } }, res);
    last = res;
  }
  expect(last.status).toHaveBeenCalledWith(429);
  expect(last.json.mock.calls[0][0].retryAfter).toBeGreaterThan(0);
});

test('422 with field errors, nothing is priced or stored', async () => {
  const res = await call(body({ billing: addr({ zip: '' }), acceptTerms: false }));
  expect(res.status).toHaveBeenCalledWith(422);
  const out = res.json.mock.calls[0][0];
  expect(out.code).toBe('VALIDATION_ERROR');
  expect(out.details.fields['billing.zip']).toBeTruthy();
  expect(out.details.fields.acceptTerms).toBeTruthy();
  expect(priceOrder).not.toHaveBeenCalled();
  expect(mockPrisma.$transaction).not.toHaveBeenCalled();
});

test('pricing errors are passed through with code and details', async () => {
  priceOrder.mockImplementation(() => { throw new ShopPricingError('STOCK_EXCEEDED', 'Nicht genug Bestand', { sku: 'A' }); });
  const res = await call(body());
  expect(res.status).toHaveBeenCalledWith(422);
  expect(res.json).toHaveBeenCalledWith({ error: 'Nicht genug Bestand', code: 'STOCK_EXCEEDED', details: { sku: 'A' } });
  expect(mockPrisma.$transaction).not.toHaveBeenCalled();
});

test('unexpected pricing exception is a 500', async () => {
  priceOrder.mockImplementation(() => { throw new Error('boom'); });
  expect((await call(body())).status).toHaveBeenCalledWith(500);
});

test('digital line requires acceptWaiver', async () => {
  priceOrder.mockReturnValue({ ...priced, lines: [{ ...line, digital: true }] });
  const res = await call(body());
  expect(res.status).toHaveBeenCalledWith(422);
  expect(res.json.mock.calls[0][0].details.fields.acceptWaiver).toBeTruthy();
  expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  const ok = await call(body({ acceptWaiver: true }));
  expect(ok.status).toHaveBeenCalledWith(201);
  expect(mockTx.shopOrder.create.mock.calls[0][0].data.acceptedWaiver).toBe(true);
});

test('creates order + items in a transaction from server prices; reference built from number', async () => {
  mockPrisma.setting.findUnique.mockResolvedValue({ value: 'pf' });
  const res = await call(body({ items: [{ sku: 'A', qty: 2, priceCents: 1, unitCents: 1 }], totalCents: 1 }));
  expect(res.status).toHaveBeenCalledWith(201);
  const year = new Date().getUTCFullYear();
  const ref = `PF-${year}-000123`;
  expect(res.json).toHaveBeenCalledWith({ reference: ref, totalCents: 2400, status: 'PENDING', accessToken: expect.stringMatching(/^[0-9a-f]{48}$/), payment: { provider: 'sumup', client: { type: 'widget', checkoutId: 'c1' } } });

  expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  // Client-Preise erreichen priceOrder nicht
  expect(priceOrder.mock.calls[0][0].items).toEqual([{ sku: 'A', qty: 2 }]);
  expect(priceOrder.mock.calls[0][0].country).toBe('DE');
  const data = mockTx.shopOrder.create.mock.calls[0][0].data;
  expect(data.reference).toMatch(/^TMP-/);
  expect(data).toMatchObject({ email: 'a@b.de', subtotalCents: 2000, shippingCents: 400, totalCents: 2400, taxBreakdown: { 700: 131 }, acceptedWaiver: false, memberId: null });
  expect(data.acceptedTermsAt).toBeInstanceOf(Date);
  expect(data.items.create).toEqual([{ formatId: 'f1', sku: 'A', title: 'Buch', label: 'Hardcover', qty: 2, unitCents: 1000, taxRateBp: 700, digital: false, weightG: 500, discountCents: 0, bundleItems: undefined }]);
  expect(data).toMatchObject({ couponCode: null, discountCents: 0, shippingTaxBp: null, currency: 'EUR', locale: 'de' });
  expect(data.accessToken).toMatch(/^[0-9a-f]{48}$/);
  expect(res.json.mock.calls[0][0].accessToken).toBe(data.accessToken);
  expect(reserveStock).toHaveBeenCalledWith(mockTx, expect.objectContaining({ orderId: 'o1', lines: priced.lines }));
  expect(logOrderEvent).toHaveBeenCalledWith('o1', 'CREATED', expect.any(String), { client: mockTx });
  expect(mockTx.shopOrder.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { reference: ref } });
});

test('default prefix ORD; formats loaded for active products only', async () => {
  const res = await call(body());
  expect(res.json.mock.calls[0][0].reference).toMatch(/^ORD-\d{4}-000123$/);
  expect(mockPrisma.shopFormat.findMany.mock.calls[0][0].where).toEqual({ sku: { in: ['A'] }, product: { active: true } });
});

test('shipping defaults to billing; pricing uses shipping country when given', async () => {
  await call(body({ billing: addr({ city: 'Berlin' }) }));
  let data = mockTx.shopOrder.create.mock.calls[0][0].data;
  expect(data.shipping).toEqual(data.billing);

  await call(body({ shipping: addr({ country: 'AT', city: 'Wien' }) }));
  expect(priceOrder.mock.calls[1][0].country).toBe('AT');
  data = mockTx.shopOrder.create.mock.calls[1][0].data;
  expect(data.shipping.city).toBe('Wien');
  expect(data.billing.country).toBe('DE');
});

test('member is linked only for a member session', async () => {
  mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1' });
  getServerSession.mockResolvedValue({ user: { id: 'm1', accountType: 'member' } });
  await call(body());
  expect(mockTx.shopOrder.create.mock.calls[0][0].data.memberId).toBe('m1');

  getServerSession.mockResolvedValue({ user: { id: 'u1', accountType: 'admin' } });
  await call(body());
  expect(mockTx.shopOrder.create.mock.calls[1][0].data.memberId).toBeNull();

  getServerSession.mockRejectedValue(new Error('no session'));
  const res = await call(body());
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mockTx.shopOrder.create.mock.calls[2][0].data.memberId).toBeNull();
});

test('a stale member id (member deleted) is ignored and the order is created as a guest order', async () => {
  mockPrisma.member.findUnique.mockResolvedValue(null);
  getServerSession.mockResolvedValue({ user: { id: 'gone', accountType: 'member' } });
  const res = await call(body());
  expect(res.status).toHaveBeenCalledWith(201);
  expect(mockTx.shopOrder.create.mock.calls[0][0].data.memberId).toBeNull();
});

test('empty cart reaches pricing (CART_EMPTY) without a DB lookup; too many items is a field error', async () => {
  priceOrder.mockImplementation(() => { throw new ShopPricingError('CART_EMPTY', 'Warenkorb ist leer', {}); });
  const res = await call(body({ items: [] }));
  expect(res.json.mock.calls[0][0].code).toBe('CART_EMPTY');
  expect(mockPrisma.shopFormat.findMany).not.toHaveBeenCalled();

  const many = await call(body({ items: Array.from({ length: 51 }, () => ({ sku: 'A', qty: 1 })) }));
  expect(many.json.mock.calls[0][0].details.fields.items).toBeTruthy();
});

test('responses are no-store', async () => {
  const res = await call(body());
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
});

describe('payment provider', () => {
  test('409 NO_PAYMENT_PROVIDER before any order is created', async () => {
    listAvailableProviders.mockReturnValue([]);
    const res = await call(body());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('NO_PAYMENT_PROVIDER');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(startPayment).not.toHaveBeenCalled();
  });

  test('single provider is used by default, with absolute urls', async () => {
    await call(body());
    const arg = startPayment.mock.calls[0][0];
    expect(arg.providerId).toBe('sumup');
    expect(arg.urls.returnUrl).toMatch(/^https?:\/\/.+\/bestellung\?ref=ORD-\d{4}-000123&t=[0-9a-f]{48}$/);
    expect(arg.urls.webhookUrl).toMatch(/\/api\/shop\/webhooks\/sumup$/);
    expect(arg.order.items).toHaveLength(1);
  });

  test('NEXTAUTH_URL (valid absolute origin) wins over the Host header; invalid values fall back', async () => {
    const old = process.env.NEXTAUTH_URL;
    try {
      process.env.NEXTAUTH_URL = 'https://shop.example.org';
      await call(body());
      expect(startPayment.mock.calls[0][0].urls.webhookUrl).toBe('https://shop.example.org/api/shop/webhooks/sumup');
      expect(startPayment.mock.calls[0][0].urls.cancelUrl).toBe('https://shop.example.org/kasse');
      for (const bad of ['shop.example.org', 'https://shop.example.org/sub', 'ftp://x.de']) {
        process.env.NEXTAUTH_URL = bad;
        startPayment.mockClear();
        await call(body());
        expect(startPayment.mock.calls[0][0].urls.webhookUrl).not.toContain('shop.example.org/sub');
        expect(startPayment.mock.calls[0][0].urls.webhookUrl).not.toMatch(/^ftp/);
      }
    } finally {
      if (old === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = old;
    }
  });

  test('several providers: provider is required and must be available', async () => {
    listAvailableProviders.mockReturnValue([{ id: 'sumup', label: 'SumUp' }, { id: 'stripe', label: 'Stripe' }]);
    let res = await call(body());
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].details.fields.provider).toBeTruthy();
    res = await call(body({ provider: 'paypal' }));
    expect(res.status).toHaveBeenCalledWith(422);
    res = await call(body({ provider: 'stripe' }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(startPayment.mock.calls[0][0].providerId).toBe('stripe');
  });

  test('startPayment failure: order FAILED, 502 without provider details', async () => {
    startPayment.mockRejectedValue(new Error('secret-detail'));
    const res = await call(body());
    expect(res.status).toHaveBeenCalledWith(502);
    const out = res.json.mock.calls[0][0];
    expect(out.code).toBe('PAYMENT_UNAVAILABLE');
    expect(JSON.stringify(out)).not.toMatch(/secret-detail/);
    expect(mockPrisma.shopOrder.updateMany).toHaveBeenCalledWith({ where: { id: 'o1', status: 'PENDING' }, data: { status: 'FAILED' } });
    expect(releaseReservations).toHaveBeenCalledWith('o1');
  });
});

describe('coupon, locale, reservations', () => {
  test('coupon code from the body is looked up, priced and stored; reservations feed the pricing', async () => {
    const row = { code: 'SOMMER', type: 'PERCENT', value: 1000 };
    lookupCoupon.mockResolvedValue(row);
    reservedByOthers.mockResolvedValue(new Map([['f1', 2]]));
    priceOrder.mockReturnValue({
      ...priced, discountCents: 200, totalCents: 2200, shippingTaxBp: 1900, coupon: { code: 'SOMMER', type: 'PERCENT', value: 1000 },
      lines: [{ ...line, discountCents: 200, bundle: [{ formatId: 'c1', sku: 'C', title: 'T', label: 'L', qty: 1, digital: false, weightG: 5 }] }],
    });
    const res = await call(body({ coupon: 'sommer', discountCents: 99999, locale: 'en' }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(lookupCoupon).toHaveBeenCalledWith('sommer');
    expect(reservedByOthers).toHaveBeenCalledWith(['f1'], {});
    const arg = priceOrder.mock.calls[0][0];
    expect(arg.coupon).toBe(row);
    expect(arg.reserved.get('f1')).toBe(2);
    expect(arg.currency).toBe('EUR');
    expect(Object.keys(arg).sort()).toEqual(['country', 'coupon', 'currency', 'formats', 'items', 'reserved', 'shipping']);
    const data = mockTx.shopOrder.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ couponCode: 'SOMMER', discountCents: 200, totalCents: 2200, shippingTaxBp: 1900, locale: 'en' });
    expect(data.items.create[0]).toMatchObject({ discountCents: 200, bundleItems: [{ sku: 'C', qty: 1 }] });
  });

  test('invalid coupon: 422 with COUPON_* code and nothing stored', async () => {
    lookupCoupon.mockRejectedValue(new ShopPricingError('COUPON_INVALID', 'Gutscheincode ist ungültig.', { code: 'XX' }));
    const res = await call(body({ coupon: 'XX' }));
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'COUPON_INVALID', details: { code: 'XX' } });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  test('locale falls back to the shop default; currency comes from the settings', async () => {
    loadShopSettings.mockResolvedValue({ shop_default_locale: 'en', shop_currency: 'CHF' });
    await call(body({ locale: 'fr' }));
    expect(mockTx.shopOrder.create.mock.calls[0][0].data).toMatchObject({ locale: 'en', currency: 'CHF' });
    expect(priceOrder.mock.calls[0][0].currency).toBe('CHF');
  });
});
