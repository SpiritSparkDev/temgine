/**
 * __tests__/api/shopCheckoutApi.test.js
 * POST /api/shop/checkout: Prisma, Session, Pricing und Versandkonfiguration gemockt.
 */

jest.disableAutomock();

const mockTx = { shopOrder: { create: jest.fn(), update: jest.fn() } };
const mockPrisma = {
  setting: { findUnique: jest.fn() },
  shopFormat: { findMany: jest.fn() },
  member: { findUnique: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockTx)),
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
jest.mock('../../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));
jest.mock('../../lib/shop/config', () => ({ isShopEnabled: jest.fn() }));
jest.mock('../../lib/shop/shippingConfig', () => ({ loadShippingConfig: jest.fn() }));
jest.mock('../../lib/shop/pricing', () => {
  class ShopPricingError extends Error {
    constructor(code, message, details = {}) { super(message); this.code = code; this.details = details; }
  }
  return { priceOrder: jest.fn(), ShopPricingError };
});

const { getServerSession } = require('next-auth/next');
const { isShopEnabled } = require('../../lib/shop/config');
const { loadShippingConfig } = require('../../lib/shop/shippingConfig');
const { priceOrder, ShopPricingError } = require('../../lib/shop/pricing');
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

const line = { formatId: 'f1', sku: 'A', title: 'Buch', label: 'Hardcover', qty: 2, unitCents: 1000, lineCents: 2000, taxRateBp: 700, digital: false, weightG: 500 };
const priced = { lines: [line], subtotalCents: 2000, taxBreakdown: { 700: 131 }, hasPhysical: true, shippingCents: 400, totalCents: 2400 };

beforeEach(() => {
  jest.clearAllMocks();
  isShopEnabled.mockResolvedValue(true);
  loadShippingConfig.mockResolvedValue({ countries: { DE: 'Deutschland', AT: 'Österreich' }, zones: [] });
  getServerSession.mockResolvedValue(null);
  mockPrisma.setting.findUnique.mockResolvedValue(null);
  mockPrisma.shopFormat.findMany.mockResolvedValue([{ id: 'f1', sku: 'A' }]);
  priceOrder.mockReturnValue(priced);
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
  expect(res.json).toHaveBeenCalledWith({ reference: ref, totalCents: 2400, status: 'PENDING', payment: null });

  expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  // Client-Preise erreichen priceOrder nicht
  expect(priceOrder.mock.calls[0][0].items).toEqual([{ sku: 'A', qty: 2 }]);
  expect(priceOrder.mock.calls[0][0].country).toBe('DE');
  const data = mockTx.shopOrder.create.mock.calls[0][0].data;
  expect(data.reference).toMatch(/^TMP-/);
  expect(data).toMatchObject({ email: 'a@b.de', subtotalCents: 2000, shippingCents: 400, totalCents: 2400, taxBreakdown: { 700: 131 }, acceptedWaiver: false, memberId: null });
  expect(data.acceptedTermsAt).toBeInstanceOf(Date);
  expect(data.items.create).toEqual([{ formatId: 'f1', sku: 'A', title: 'Buch', label: 'Hardcover', qty: 2, unitCents: 1000, taxRateBp: 700, digital: false, weightG: 500 }]);
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
