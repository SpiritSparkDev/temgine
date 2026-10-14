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
  return { calls, shopProduct: mk('product'), shopFormat: mk('format'), shopOrder: mk('order'), shopOrderItem: mk('item'), shopPayment: mk('payment'), shopStockMovement: mk('move') };
}

const data = {
  products: [{ id: 'p1', slug: 'a', title: 'A' }],
  formats: [{ id: 'f1', productId: 'p1', sku: 'A-1', label: 'HC', priceCents: 100 }],
  orders: [{ id: 'o1', reference: 'ORD-2026-000001', status: 'PAID', email: 'x@y.de', totalCents: 100 }],
  orderItems: [{ orderId: 'o1', formatId: 'f1', sku: 'A-1', title: 'A', label: 'HC', qty: 1, unitCents: 100, taxRateBp: 700 }],
  payments: [{ orderId: 'o1', provider: 'STRIPE', externalId: 'cs_1', status: 'PAID', amountCents: 100 }],
  stockMovements: [{ orderId: 'o1', sku: 'A-1', delta: -1, reason: 'ORDER_PAID' }],
};

describe('shop backup', () => {
  test('export reads exactly the six shop tables and nothing else', async () => {
    const db = fakeDb();
    const out = await exportShopData(db);
    expect(Object.keys(out)).toEqual(['products', 'formats', 'orders', 'orderItems', 'payments', 'stockMovements']);
    expect(db.setting).toBeUndefined();
  });

  test('import respects foreign key order and remaps ids', async () => {
    const db = fakeDb();
    const r = await importShopData(data, 'merge', db);
    expect(r.errors).toEqual([]);
    expect(db.calls).toEqual(['up:product', 'up:format', 'cr:order', 'cr:item', 'cr:payment', 'cr:move']);
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
  });

  test('replace deletes children before parents', async () => {
    const db = fakeDb();
    await importShopData({}, 'replace', db);
    expect(db.calls).toEqual(['del:move', 'del:payment', 'del:item', 'del:order', 'del:format', 'del:product']);
  });
});
