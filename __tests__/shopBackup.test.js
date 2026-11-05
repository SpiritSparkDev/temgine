const { exportShopData, importShopData } = require('../lib/shop/backup');

function fakeDb() {
  const calls = [];
  const mk = (name) => ({
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    deleteMany: jest.fn(async () => { calls.push(`del:${name}`); }),
    upsert: jest.fn(async ({ where }) => { calls.push(`up:${name}`); return { id: `new-${Object.values(where)[0]}` }; }),
    create: jest.fn(async () => { calls.push(`cr:${name}`); return { id: `new-${name}` }; }),
  });
  return { calls, shopProduct: mk('product'), shopFormat: mk('format'), shopOrder: mk('order'), shopOrderItem: mk('item'), shopPayment: mk('payment'), shopStockMovement: mk('move'), shopCoupon: mk('coupon'),
    shopInvoice: mk('invoice'), shopRefund: mk('refund'), shopOrderEvent: mk('event'), shopReturnRequest: mk('return'), shopCouponUse: mk('use'),
    shopDigitalFile: mk('file'), shopStockAlert: mk('alert'), shopWishlistItem: mk('wish'), shopCounter: mk('counter'), member: { findUnique: jest.fn().mockResolvedValue(null) } };
}

const data = {
  products: [{ id: 'p1', slug: 'a', title: 'A' }],
  formats: [{ id: 'f1', productId: 'p1', sku: 'A-1', label: 'HC', priceCents: 100 }],
  orders: [{ id: 'o1', reference: 'ORD-2026-000001', status: 'PAID', email: 'x@y.de', totalCents: 100 }],
  orderItems: [{ orderId: 'o1', formatId: 'f1', sku: 'A-1', title: 'A', label: 'HC', qty: 1, unitCents: 100, taxRateBp: 700 }],
  payments: [{ id: 'pay1', orderId: 'o1', provider: 'STRIPE', externalId: 'cs_1', status: 'PAID', amountCents: 100 }],
  stockMovements: [{ orderId: 'o1', sku: 'A-1', delta: -1, reason: 'ORDER_PAID' }],
  coupons: [{ id: 'c1', code: 'SAVE', type: 'FIXED', value: 100 }],
  invoices: [{ orderId: 'o1', number: 'RE-2026-000001' }],
  refunds: [{ orderId: 'o1', paymentId: 'pay1', amountCents: 50, status: 'SUCCEEDED' }],
  orderEvents: [{ orderId: 'o1', type: 'PAID' }],
  returnRequests: [{ orderId: 'o1', email: 'x@y.de', reason: 'r', status: 'NEW' }],
  couponUses: [{ couponId: 'c1', orderId: 'o1' }],
  digitalFiles: [{ formatId: 'f1', filename: 'a.pdf', storedName: 'abc', sizeBytes: 5 }],
  stockAlerts: [{ formatId: 'f1', email: 'a@b.de', confirmToken: 't1', unsubscribeToken: 't2' }],
  wishlist: [{ memberEmail: 'm@x.de', productId: 'p1' }, { memberEmail: 'gone@x.de', productId: 'p1' }],
  counters: [{ key: 'invoice-2026', value: 7 }, { key: 'other', value: 9 }],
};

describe('shop backup', () => {
  test('export reads exactly the shop tables and nothing else', async () => {
    const db = fakeDb();
    const out = await exportShopData(db);
    expect(Object.keys(out)).toEqual(['products', 'formats', 'orders', 'orderItems', 'payments', 'stockMovements', 'coupons', 'invoices', 'refunds', 'orderEvents', 'returnRequests', 'couponUses', 'digitalFiles', 'stockAlerts', 'wishlist', 'counters']);
    expect(db.setting).toBeUndefined();
  });

  test('import respects foreign key order and remaps ids', async () => {
    const db = fakeDb();
    const r = await importShopData(data, 'merge', db);
    expect(r.errors).toEqual([]);
    expect(db.calls).toEqual(['up:product', 'up:format', 'up:coupon', 'cr:order', 'cr:item', 'cr:payment', 'cr:move', 'cr:invoice', 'cr:refund', 'cr:event', 'cr:return', 'cr:use', 'up:file', 'up:alert', 'up:counter']);
    expect(db.shopCouponUse.create.mock.calls[0][0].data).toMatchObject({ couponId: 'new-SAVE', orderId: 'new-order' });
    expect(db.shopRefund.create.mock.calls[0][0].data.paymentId).toBe('new-payment');
    expect(db.shopDownloadToken).toBeUndefined();
    expect(db.shopFormat.upsert.mock.calls[0][0].create.productId).toBe('new-a');
    expect(db.shopOrderItem.create.mock.calls[0][0].data).toMatchObject({ orderId: 'new-order', formatId: 'new-A-1' });
    expect(db.shopOrder.create.mock.calls[0][0].data.number).toBeUndefined();
    expect(db.shopOrder.create.mock.calls[0][0].data.memberId).toBeUndefined();
  });

  test('existing order is kept and its children are not duplicated', async () => {
    const db = fakeDb();
    db.shopOrder.findUnique.mockResolvedValue({ id: 'x' });
    await importShopData(data, 'merge', db);
    expect(db.shopOrder.create).not.toHaveBeenCalled();
    expect(db.shopOrderItem.create).not.toHaveBeenCalled();
    expect(db.shopPayment.create).not.toHaveBeenCalled();
    expect(db.shopStockMovement.create).not.toHaveBeenCalled();
    for (const m of ['shopInvoice', 'shopRefund', 'shopOrderEvent', 'shopReturnRequest', 'shopCouponUse']) expect(db[m].create).not.toHaveBeenCalled();
  });

  test('wishlist needs a resolvable member; counters take the max', async () => {
    const db = fakeDb();
    db.member.findUnique.mockImplementation(async ({ where }) => (where.email === 'm@x.de' ? { id: 'mem1' } : null));
    db.shopCounter.findUnique.mockResolvedValue({ value: 10 });
    await importShopData(data, 'merge', db);
    expect(db.shopWishlistItem.upsert).toHaveBeenCalledTimes(1);
    expect(db.shopWishlistItem.upsert.mock.calls[0][0].create).toEqual({ memberId: 'mem1', productId: 'new-a' });
    expect(db.shopCounter.upsert).not.toHaveBeenCalled(); // vorhanden 10 >= importiert 7
    db.shopCounter.findUnique.mockResolvedValue({ value: 3 });
    await importShopData(data, 'merge', db);
    expect(db.shopCounter.upsert.mock.calls[0][0].update).toEqual({ value: 7 });
  });

  test('order accessToken is imported', async () => {
    const db = fakeDb();
    await importShopData({ ...data, orders: [{ ...data.orders[0], accessToken: 'tok' }] }, 'merge', db);
    expect(db.shopOrder.create.mock.calls[0][0].data.accessToken).toBe('tok');
  });

  test('replace deletes children before parents', async () => {
    const db = fakeDb();
    await importShopData({}, 'replace', db);
    expect(db.calls).toEqual(['del:wish', 'del:alert', 'del:file', 'del:use', 'del:return', 'del:event', 'del:refund', 'del:invoice', 'del:move', 'del:coupon', 'del:payment', 'del:item', 'del:order', 'del:format', 'del:product']);
  });
});
