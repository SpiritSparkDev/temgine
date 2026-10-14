/**
 * __tests__/api/shopProducts.test.js
 * Admin- und öffentliche Produkt-APIs des Shop-Add-ons.
 */

jest.disableAutomock();

const mockTx = {
  shopProduct: { findUnique: jest.fn(), update: jest.fn() },
  shopFormat: { deleteMany: jest.fn(), update: jest.fn(), create: jest.fn() },
};
const mockPrisma = {
  setting: { findUnique: jest.fn() },
  shopProduct: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockTx)),
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/auth', () => ({
  requireAuth: jest.fn(),
  PERMISSIONS: { SHOP_PRODUCTS_VIEW: ['VIEW'], SHOP_PRODUCTS_EDIT: ['EDIT'] },
}));
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }));
jest.mock('../../lib/shop/reservations', () => ({ reservedByOthers: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('../../lib/shop/stockAlerts', () => ({ notifyRestock: jest.fn() }));

const { requireAuth } = require('../../lib/auth');
const { logAudit } = require('../../lib/audit');
const list = require('../../pages/api/shop/products').default;
const one = require('../../pages/api/shop/products/[id]').default;
const pubList = require('../../pages/api/shop/public/products').default;
const pubOne = require('../../pages/api/shop/public/products/[slug]').default;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}
const ok = { authorized: true, user: { id: 'u1' } };
const UPD = new Date('2026-01-02T03:04:05.000Z');
const fmtRow = (o = {}) => ({ id: 'f1', sku: 'DS-HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, weightG: 1200, stock: 5, digital: false, sortOrder: 0, ...o });
const prodRow = (o = {}) => ({ id: 'p1', slug: 'dark-space', title: 'Dark Space', category: 'Rollenspiel', subtitle: null, shortText: null, description: null, images: [], active: true, sortOrder: 0, updatedAt: UPD, formats: [fmtRow()], ...o });
const body = (o = {}) => ({ title: 'Dark Space', formats: [{ sku: 'DS-HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, weightG: 1200, stock: 5, digital: false }], ...o });

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((fn) => fn(mockTx));
  mockPrisma.setting.findUnique.mockResolvedValue({ value: 'true' });
  requireAuth.mockResolvedValue(ok);
});

describe('admin list/create', () => {
  test('permissions: GET needs VIEW, POST needs EDIT; auth failure is passed through', async () => {
    mockPrisma.shopProduct.findMany.mockResolvedValue([]);
    await list({ method: 'GET' }, makeRes());
    expect(requireAuth.mock.calls[0][2]).toEqual(['VIEW']);
    mockPrisma.shopProduct.create.mockResolvedValue(prodRow());
    await list({ method: 'POST', body: body() }, makeRes());
    expect(requireAuth.mock.calls[1][2]).toEqual(['EDIT']);

    requireAuth.mockResolvedValue({ authorized: false, error: 'Zugriff verweigert', status: 403 });
    const res = makeRes();
    await list({ method: 'GET' }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.shopProduct.findMany).toHaveBeenCalledTimes(1);
  });

  test('add-on disabled -> 403 ADDON_DISABLED', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue({ value: 'false' });
    for (const [h, req] of [[list, { method: 'GET' }], [list, { method: 'POST', body: body() }], [one, { method: 'GET', query: { id: 'p1' } }], [one, { method: 'PUT', query: { id: 'p1' }, body: body() }]]) {
      const res = makeRes();
      await h(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Add-on Shop nicht aktiviert', code: 'ADDON_DISABLED' });
    }
    expect(mockPrisma.shopProduct.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.shopProduct.create).not.toHaveBeenCalled();
  });

  test('GET returns mapped products, sorted by sortOrder then title, no-store', async () => {
    mockPrisma.shopProduct.findMany.mockResolvedValue([prodRow()]);
    const res = makeRes();
    await list({ method: 'GET' }, res);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(mockPrisma.shopProduct.findMany.mock.calls[0][0].orderBy).toEqual([{ sortOrder: 'asc' }, { title: 'asc' }]);
    const p = res.json.mock.calls[0][0].products[0];
    expect(p.id).toBe('p1');
    expect(p.updatedAt).toBe(UPD.toISOString());
    expect(p.formats[0].stock).toBe(5);
  });

  test('POST creates (201), nests formats without id, audits', async () => {
    mockPrisma.shopProduct.create.mockResolvedValue(prodRow());
    const res = makeRes();
    await list({ method: 'POST', body: body({ formats: [{ id: 'evil', ...body().formats[0] }] }) }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const arg = mockPrisma.shopProduct.create.mock.calls[0][0];
    expect(arg.data.slug).toBe('dark-space');
    expect(arg.data.formats.create[0].id).toBeUndefined();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.product.create', resource: 'shop-product', userId: 'u1' }));
  });

  test('POST invalid -> 422 with details.errors', async () => {
    const res = makeRes();
    await list({ method: 'POST', body: { title: '' } }, res);
    expect(res.status).toHaveBeenCalledWith(422);
    const out = res.json.mock.calls[0][0];
    expect(out.code).toBe('VALIDATION_ERROR');
    expect(out.details.errors.length).toBeGreaterThan(1);
    expect(mockPrisma.shopProduct.create).not.toHaveBeenCalled();
  });

  test('POST duplicate slug/SKU (P2002) -> 409 DUPLICATE', async () => {
    mockPrisma.shopProduct.create.mockRejectedValue({ code: 'P2002', message: 'unique' });
    const res = makeRes();
    await list({ method: 'POST', body: body() }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('DUPLICATE');
  });

  test('unsupported method -> 405; unexpected error -> 500', async () => {
    let res = makeRes();
    await list({ method: 'DELETE' }, res);
    expect(res.status).toHaveBeenCalledWith(405);
    mockPrisma.shopProduct.findMany.mockRejectedValue(new Error('db'));
    res = makeRes();
    await list({ method: 'GET' }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('admin [id]', () => {
  const q = { id: 'p1' };

  test('GET returns product or 404', async () => {
    mockPrisma.shopProduct.findUnique.mockResolvedValue(prodRow());
    let res = makeRes();
    await one({ method: 'GET', query: q }, res);
    expect(res.json.mock.calls[0][0].product.id).toBe('p1');
    expect(requireAuth.mock.calls[0][2]).toEqual(['VIEW']);

    mockPrisma.shopProduct.findUnique.mockResolvedValue(null);
    res = makeRes();
    await one({ method: 'GET', query: q }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  function setupPut(current = prodRow({ formats: [fmtRow(), fmtRow({ id: 'f2', sku: 'DS-OLD' })] })) {
    mockTx.shopProduct.findUnique.mockResolvedValueOnce(current).mockResolvedValue(prodRow({ title: 'Neu' }));
  }
  const putBody = (o = {}) => body({ updatedAt: UPD.toISOString(), formats: [{ id: 'f1', ...body().formats[0] }, { sku: 'DS-PDF', label: 'PDF', priceCents: 1990, taxRateBp: 700, digital: true }], ...o });

  test('PUT replaces product in a transaction: updates by id, creates new, deletes missing', async () => {
    setupPut();
    const res = makeRes();
    await one({ method: 'PUT', query: q, body: putBody() }, res);
    expect(requireAuth.mock.calls[0][2]).toEqual(['EDIT']);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.shopFormat.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['f2'] } } });
    expect(mockTx.shopProduct.update.mock.calls[0][0].where).toEqual({ id: 'p1' });
    expect(mockTx.shopProduct.update.mock.calls[0][0].data.formats).toBeUndefined();
    expect(mockTx.shopFormat.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'f1' } }));
    expect(mockTx.shopFormat.update.mock.calls[0][0].data.id).toBeUndefined();
    expect(mockTx.shopFormat.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sku: 'DS-PDF', productId: 'p1', weightG: null, digital: true }) });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].product.title).toBe('Neu');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.product.update', resource: 'shop-product', resourceId: 'p1' }));
  });

  test('PUT with stale updatedAt -> 409 CONFLICT and nothing written', async () => {
    setupPut();
    const res = makeRes();
    await one({ method: 'PUT', query: q, body: putBody({ updatedAt: '2025-01-01T00:00:00.000Z' }) }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('CONFLICT');
    expect(mockTx.shopProduct.update).not.toHaveBeenCalled();
    expect(mockTx.shopFormat.deleteMany).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  test('PUT without updatedAt or with invalid data -> 422, no transaction', async () => {
    let res = makeRes();
    await one({ method: 'PUT', query: q, body: putBody({ updatedAt: undefined }) }, res);
    expect(res.status).toHaveBeenCalledWith(422);
    res = makeRes();
    await one({ method: 'PUT', query: q, body: putBody({ formats: [] }) }, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  test('PUT with foreign format id -> 422; unknown product -> 404', async () => {
    setupPut();
    let res = makeRes();
    await one({ method: 'PUT', query: q, body: putBody({ formats: [{ id: 'other', ...body().formats[0] }] }) }, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockTx.shopFormat.deleteMany).not.toHaveBeenCalled();

    mockTx.shopProduct.findUnique.mockReset().mockResolvedValue(null);
    res = makeRes();
    await one({ method: 'PUT', query: q, body: putBody() }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('PUT duplicate SKU from DB (P2002) -> 409 DUPLICATE', async () => {
    setupPut();
    mockTx.shopFormat.update.mockRejectedValue({ code: 'P2002', message: 'unique' });
    const res = makeRes();
    await one({ method: 'PUT', query: q, body: putBody() }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].code).toBe('DUPLICATE');
  });
});

describe('public API', () => {
  const rows = [
    prodRow(),
    prodRow({ id: 'p2', slug: 'karten', title: 'Karten', category: 'Kartenspiel', formats: [fmtRow({ id: 'f9', sku: 'K1', stock: 0 })] }),
  ];

  test('add-on disabled -> 404 for both routes', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    let res = makeRes();
    await pubList({ method: 'GET', query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    res = makeRes();
    await pubOne({ method: 'GET', query: { slug: 'dark-space' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.shopProduct.findMany).not.toHaveBeenCalled();
    expect(requireAuth).not.toHaveBeenCalled();
  });

  test('list: queries only active, returns categories, cache header, no internal fields', async () => {
    mockPrisma.shopProduct.findMany.mockResolvedValue(rows);
    const res = makeRes();
    await pubList({ method: 'GET', query: {} }, res);
    expect(mockPrisma.shopProduct.findMany.mock.calls[0][0].where).toEqual({ active: true });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
    const out = res.json.mock.calls[0][0];
    expect(out.categories).toEqual(['Kartenspiel', 'Rollenspiel']);
    expect(out.products).toHaveLength(2);
    expect(JSON.stringify(out)).not.toMatch(/weightG|"stock"|"id"|"active"|updatedAt/);
    expect(out.products[1].formats[0].orderable).toBe(false);
  });

  test('list: category filter keeps all categories', async () => {
    mockPrisma.shopProduct.findMany.mockResolvedValue(rows);
    const res = makeRes();
    await pubList({ method: 'GET', query: { category: 'Kartenspiel' } }, res);
    const out = res.json.mock.calls[0][0];
    expect(out.products.map((p) => p.slug)).toEqual(['karten']);
    expect(out.categories).toHaveLength(2);
  });

  test('detail: finds active by slug, hides internals; unknown/inactive -> 404', async () => {
    mockPrisma.shopProduct.findFirst.mockResolvedValue(prodRow());
    let res = makeRes();
    await pubOne({ method: 'GET', query: { slug: 'dark-space' } }, res);
    expect(mockPrisma.shopProduct.findFirst.mock.calls[0][0].where).toEqual({ slug: 'dark-space', active: true });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/weightG|"stock"|"id"/);

    mockPrisma.shopProduct.findFirst.mockResolvedValue(null);
    res = makeRes();
    await pubOne({ method: 'GET', query: { slug: 'weg' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('non-GET -> 405', async () => {
    const res = makeRes();
    await pubList({ method: 'POST', query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
