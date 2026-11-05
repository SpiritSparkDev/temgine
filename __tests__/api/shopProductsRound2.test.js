/**
 * __tests__/api/shopProductsRound2.test.js
 * Erweiterungsrunde 2 (Paket C): Staffelpreise, Bündel, Empfehlungen, Übersetzungen in den Produkt-APIs.
 */

jest.disableAutomock();

const mockTx = {
  shopProduct: { findUnique: jest.fn(), update: jest.fn() },
  shopFormat: { deleteMany: jest.fn(), update: jest.fn(), create: jest.fn() },
};
const mockPrisma = {
  setting: { findUnique: jest.fn() },
  shopProduct: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  shopFormat: { findMany: jest.fn() },
  $transaction: jest.fn((fn) => fn(mockTx)),
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/auth', () => ({
  requireAuth: jest.fn(),
  PERMISSIONS: { SHOP_PRODUCTS_VIEW: ['VIEW'], SHOP_PRODUCTS_EDIT: ['EDIT'] },
}));
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }));
jest.mock('../../lib/shop/reservations', () => ({ reservedByOthers: jest.fn() }));
jest.mock('../../lib/shop/stockAlerts', () => ({ notifyRestock: jest.fn() }));

const { requireAuth } = require('../../lib/auth');
const { reservedByOthers } = require('../../lib/shop/reservations');
const { notifyRestock } = require('../../lib/shop/stockAlerts');
const list = require('../../pages/api/shop/products').default;
const one = require('../../pages/api/shop/products/[id]').default;
const pubList = require('../../pages/api/shop/public/products').default;
const pubOne = require('../../pages/api/shop/public/products/[slug]').default;
const reco = require('../../pages/api/shop/public/recommendations').default;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}
const UPD = new Date('2026-01-02T03:04:05.000Z');
const fmtRow = (o = {}) => ({ id: 'f1', sku: 'DS-HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, weightG: 1200, stock: 5, digital: false, sortOrder: 0, ...o });
const prodRow = (o = {}) => ({ id: 'p1', slug: 'dark-space', title: 'Dark Space', category: 'Rollenspiel', subtitle: null, shortText: null, description: null, images: [], related: [], translations: {}, active: true, sortOrder: 0, updatedAt: UPD, formats: [fmtRow()], ...o });
const fbody = (o = {}) => ({ sku: 'DS-HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, weightG: 1200, stock: 5, digital: false, ...o });
const CACHE = 'public, s-maxage=15, stale-while-revalidate=60';

beforeEach(() => {
  jest.resetAllMocks();
  mockPrisma.$transaction.mockImplementation((fn) => fn(mockTx));
  mockPrisma.setting.findUnique.mockResolvedValue({ value: 'true' });
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } });
  reservedByOthers.mockResolvedValue(new Map());
  mockPrisma.shopFormat.findMany.mockResolvedValue([]);
});

describe('Admin POST: Lookup und neue Felder', () => {
  test('speichert priceTiers, bundleItems, related, translations; Bündel ohne stock/weightG', async () => {
    mockPrisma.shopFormat.findMany.mockResolvedValue([{ sku: 'A', bundleItems: null }]);
    mockPrisma.shopProduct.findMany.mockResolvedValue([{ slug: 'karten' }]);
    mockPrisma.shopProduct.create.mockResolvedValue(prodRow());
    const res = makeRes();
    await list({
      method: 'POST',
      body: {
        title: 'Set',
        related: ['karten'],
        translations: { en: { title: 'Set EN' } },
        formats: [fbody({ sku: 'SET', stock: 9, weightG: 100, priceTiers: [{ minQty: 2, priceCents: 4000 }], bundleItems: [{ sku: 'A', qty: 2 }] })],
      },
    }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockPrisma.shopFormat.findMany.mock.calls[0][0].where).toEqual({ sku: { in: ['A'] } });
    const data = mockPrisma.shopProduct.create.mock.calls[0][0].data;
    expect(data.related).toEqual(['karten']);
    expect(data.translations).toEqual({ en: { title: 'Set EN' } });
    expect(data.formats.create[0]).toMatchObject({ stock: null, weightG: null, priceTiers: [{ minQty: 2, priceCents: 4000 }], bundleItems: [{ sku: 'A', qty: 2 }] });
  });

  test('unbekannte SKU, Verschachtelung und unbekannter Slug -> 422', async () => {
    mockPrisma.shopFormat.findMany.mockResolvedValue([{ sku: 'BUN', bundleItems: [{ sku: 'A', qty: 1 }] }]);
    mockPrisma.shopProduct.findMany.mockResolvedValue([]);
    const res = makeRes();
    await list({
      method: 'POST',
      body: { title: 'Set', related: ['weg'], formats: [fbody({ sku: 'SET', bundleItems: [{ sku: 'BUN', qty: 1 }, { sku: 'NIX', qty: 1 }] })] },
    }, res);
    expect(res.status).toHaveBeenCalledWith(422);
    const errors = res.json.mock.calls[0][0].details.errors.join('|');
    expect(errors).toMatch(/Verschachtelung/);
    expect(errors).toMatch(/NIX/);
    expect(errors).toMatch(/weg/);
    expect(mockPrisma.shopProduct.create).not.toHaveBeenCalled();
  });

  test('alte Eingabe ohne neue Felder braucht keine Lookup-Abfragen', async () => {
    mockPrisma.shopProduct.create.mockResolvedValue(prodRow());
    const res = makeRes();
    await list({ method: 'POST', body: { title: 'Alt', formats: [fbody()] } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockPrisma.shopFormat.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.shopProduct.findMany).not.toHaveBeenCalled();
  });
});

describe('Admin PUT: Wiederauffüllung', () => {
  const q = { id: 'p1' };
  const putBody = (formats) => ({ title: 'Dark Space', updatedAt: UPD.toISOString(), formats });
  function setup(current) {
    mockTx.shopProduct.findUnique.mockResolvedValueOnce(current).mockResolvedValue(prodRow());
  }

  test('Bestand von 0 auf >0 ruft notifyRestock nach der Transaktion; sonst nicht', async () => {
    setup(prodRow({ formats: [fmtRow({ id: 'f1', stock: 0 }), fmtRow({ id: 'f2', sku: 'B', stock: 3 }), fmtRow({ id: 'f3', sku: 'C', stock: -1 }), fmtRow({ id: 'f4', sku: 'D', stock: 0 }), fmtRow({ id: 'f5', sku: 'E', stock: null })] }));
    mockTx.shopProduct.update.mockImplementation(() => {
      expect(notifyRestock).not.toHaveBeenCalled();
    });
    const res = makeRes();
    await one({
      method: 'PUT', query: q,
      body: putBody([
        fbody({ id: 'f1', stock: 4 }),
        fbody({ id: 'f2', sku: 'B', stock: 10 }),
        fbody({ id: 'f3', sku: 'C', stock: 1 }),
        fbody({ id: 'f4', sku: 'D', stock: 0 }),
        fbody({ id: 'f5', sku: 'E', stock: 5 }),
        fbody({ sku: 'NEU', stock: 5 }),
      ]),
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(notifyRestock).toHaveBeenCalledTimes(1);
    expect(notifyRestock).toHaveBeenCalledWith(['f1', 'f3']);
  });

  test('ohne Wiederauffüllung kein Aufruf; Fehler von notifyRestock brechen das Speichern nicht', async () => {
    setup(prodRow());
    const res = makeRes();
    await one({ method: 'PUT', query: q, body: putBody([fbody({ id: 'f1', stock: 9 })]) }, res);
    expect(notifyRestock).not.toHaveBeenCalled();

    jest.spyOn(console, 'error').mockImplementation(() => {});
    setup(prodRow({ formats: [fmtRow({ stock: 0 })] }));
    notifyRestock.mockRejectedValue(new Error('smtp'));
    const res2 = makeRes();
    await one({ method: 'PUT', query: q, body: putBody([fbody({ id: 'f1', stock: 2 })]) }, res2);
    expect(res2.status).toHaveBeenCalledWith(200);
    expect(console.error).toHaveBeenCalled();
    console.error.mockRestore();
  });

  test('PUT validiert Bündel gegen die Datenbank und schreibt neue Felder', async () => {
    mockPrisma.shopFormat.findMany.mockResolvedValue([{ sku: 'A', bundleItems: [] }]);
    mockPrisma.shopProduct.findMany.mockResolvedValue([{ slug: 'karten' }]);
    setup(prodRow());
    const res = makeRes();
    await one({
      method: 'PUT', query: q,
      body: {
        ...putBody([fbody({ id: 'f1', bundleItems: [{ sku: 'A', qty: 1 }], priceTiers: [{ minQty: 3, priceCents: 100 }] })]),
        related: ['karten'], translations: { en: { shortText: 'short' } },
      },
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockTx.shopProduct.update.mock.calls[0][0].data).toMatchObject({ related: ['karten'], translations: { en: { shortText: 'short' } } });
    expect(mockTx.shopFormat.update.mock.calls[0][0].data).toMatchObject({ stock: null, weightG: null, bundleItems: [{ sku: 'A', qty: 1 }], priceTiers: [{ minQty: 3, priceCents: 100 }] });
  });

  test('Bündel mit eigener SKU -> 422', async () => {
    mockPrisma.shopFormat.findMany.mockResolvedValue([{ sku: 'DS-HC', bundleItems: null }]);
    const res = makeRes();
    await one({ method: 'PUT', query: q, body: putBody([fbody({ id: 'f1', bundleItems: [{ sku: 'DS-HC', qty: 1 }] })]) }, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  test('PUT: Format, das Bestandteil eines Bündels eines anderen Produkts ist, darf kein Bündel werden -> 422', async () => {
    mockPrisma.shopFormat.findMany.mockResolvedValue([
      { sku: 'X', productId: 'p9', bundleItems: null },
      { sku: 'P', productId: 'p9', bundleItems: [{ sku: 'A', qty: 1 }] },
    ]);
    const res = makeRes();
    await one({ method: 'PUT', query: q, body: putBody([fbody({ id: 'f1', sku: 'A', bundleItems: [{ sku: 'X', qty: 1 }] })]) }, res);
    expect(res.status).toHaveBeenCalledWith(422);
    const out = res.json.mock.calls[0][0];
    expect(out.code).toBe('VALIDATION_ERROR');
    expect(out.details.errors.join(' ')).toContain('Verschachtelung');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  test('PUT: Bündel, dessen SKU in keinem fremden Bündel steckt (nur im eigenen Produkt) -> 200', async () => {
    mockPrisma.shopFormat.findMany.mockResolvedValue([
      { sku: 'X', productId: 'p9', bundleItems: null },
      { sku: 'A', productId: 'p1', bundleItems: [{ sku: 'X', qty: 1 }] },
      { sku: 'P', productId: 'p9', bundleItems: [{ sku: 'X', qty: 2 }] },
    ]);
    setup(prodRow());
    const res = makeRes();
    await one({ method: 'PUT', query: q, body: putBody([fbody({ id: 'f1', sku: 'A', bundleItems: [{ sku: 'X', qty: 1 }] })]) }, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('öffentliche Produkt-APIs', () => {
  const bundle = fmtRow({ id: 'b1', sku: 'BUN', stock: null, weightG: null, bundleItems: [{ sku: 'A', qty: 2 }], priceTiers: [{ minQty: 2, priceCents: 4000 }] });
  const compRow = { id: 'c1', sku: 'A', label: 'Heft', stock: 5, digital: false, product: { title: 'Heftreihe', translations: {} } };

  test('Liste: lang=en, Bündel mit Reservierung der Bestandteile, Cache-Header', async () => {
    mockPrisma.shopProduct.findMany.mockResolvedValue([prodRow({ translations: { en: { title: 'Dark Space EN' } }, formats: [bundle] })]);
    mockPrisma.shopFormat.findMany.mockResolvedValue([compRow]);
    reservedByOthers.mockResolvedValue(new Map([['c1', 4]]));
    const res = makeRes();
    await pubList({ method: 'GET', query: { lang: 'en' } }, res);
    expect(reservedByOthers).toHaveBeenCalledWith(['b1', 'c1'], {});
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', CACHE);
    const p = res.json.mock.calls[0][0].products[0];
    expect(p.title).toBe('Dark Space EN');
    expect(p.formats[0]).toMatchObject({ orderable: false, inStock: false, bundle: [{ title: 'Heftreihe', label: 'Heft', qty: 2 }], tiers: [{ minQty: 2, priceCents: 4000 }] });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/weightG|"stock"|"id"|bundleItems/);
  });

  test('Liste: ungültiges lang fällt auf de, related als Kurzform aus der Liste', async () => {
    mockPrisma.shopProduct.findMany.mockResolvedValue([
      prodRow({ translations: { en: { title: 'EN' } }, related: ['karten'] }),
      prodRow({ id: 'p2', slug: 'karten', title: 'Karten', images: ['/uploads/k.webp'], formats: [fmtRow({ id: 'f9', sku: 'K1' })] }),
    ]);
    const res = makeRes();
    await pubList({ method: 'GET', query: { lang: 'fr' } }, res);
    const p = res.json.mock.calls[0][0].products[0];
    expect(p.title).toBe('Dark Space');
    expect(p.related).toEqual([{ slug: 'karten', title: 'Karten', image: '/uploads/k.webp', fromPriceCents: 4990 }]);
  });

  test('Detail: lädt related-Produkte (nur aktive) und Kontext', async () => {
    mockPrisma.shopProduct.findFirst.mockResolvedValue(prodRow({ related: ['karten'] }));
    mockPrisma.shopProduct.findMany.mockResolvedValue([prodRow({ id: 'p2', slug: 'karten', title: 'Karten', formats: [fmtRow({ id: 'f9', sku: 'K1' })] })]);
    const res = makeRes();
    await pubOne({ method: 'GET', query: { slug: 'dark-space' } }, res);
    expect(mockPrisma.shopProduct.findMany.mock.calls[0][0].where).toEqual({ slug: { in: ['karten'] }, active: true });
    expect(reservedByOthers).toHaveBeenCalledWith(['f1', 'f9'], {});
    expect(res.json.mock.calls[0][0].product.related[0].slug).toBe('karten');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', CACHE);
  });

  test('Detail ohne related lädt keine weiteren Produkte; Reservierung mindert Bestand', async () => {
    mockPrisma.shopProduct.findFirst.mockResolvedValue(prodRow());
    reservedByOthers.mockResolvedValue(new Map([['f1', 5]]));
    const res = makeRes();
    await pubOne({ method: 'GET', query: { slug: 'dark-space', lang: 'en' } }, res);
    expect(mockPrisma.shopProduct.findMany).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].product.formats[0]).toMatchObject({ orderable: false, inStock: false });
  });
});

describe('GET /api/shop/public/recommendations', () => {
  const mk = (id, o = {}) => prodRow({ id, slug: id, title: id.toUpperCase(), formats: [fmtRow({ id: `f-${id}`, sku: `S-${id}` })], ...o });
  const setup = (active, cart) => {
    mockPrisma.shopProduct.findMany.mockResolvedValue(active);
    mockPrisma.shopFormat.findMany.mockResolvedValue(cart);
  };

  test('Add-on aus -> 404; Nicht-GET -> 405', async () => {
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    let res = makeRes();
    await reco({ method: 'GET', query: { skus: 'A' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    res = makeRes();
    await reco({ method: 'POST', query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('ohne SKUs leere Liste ohne Abfragen', async () => {
    const res = makeRes();
    await reco({ method: 'GET', query: {} }, res);
    expect(res.json).toHaveBeenCalledWith({ products: [] });
    expect(mockPrisma.shopProduct.findMany).not.toHaveBeenCalled();
  });

  test('zuerst related in Reihenfolge, dann Kategorie, nie Warenkorbprodukte, max. 4', async () => {
    const a = mk('a', { related: ['x', 'b', 'gone'], category: 'Rollen' });
    const b = mk('b', { category: 'Rollen' });
    const x = mk('x', { category: 'Karten' });
    const c = mk('c', { category: 'Rollen' });
    const d = mk('d', { category: 'Rollen' });
    const e = mk('e', { category: 'Rollen' });
    setup([a, b, x, c, d, e], [{ sku: 'S-a', productId: 'a' }, { sku: 'S-b', productId: 'b' }]);
    const res = makeRes();
    await reco({ method: 'GET', query: { skus: 'S-a,S-b,S-a' } }, res);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', CACHE);
    expect(res.json.mock.calls[0][0].products.map((p) => p.slug)).toEqual(['x', 'c', 'd', 'e']);
  });

  test('Kurzform, aktive Produkte, lang=en übersetzt Titel, unbekannte SKU ohne Treffer', async () => {
    const a = mk('a', { category: 'Rollen', related: ['x'] });
    const x = mk('x', { translations: { en: { title: 'X EN' } }, images: ['/uploads/x.webp'] });
    setup([a, x], [{ sku: 'S-a', productId: 'a' }]);
    const res = makeRes();
    await reco({ method: 'GET', query: { skus: 'S-a,nix', lang: 'en' } }, res);
    expect(mockPrisma.shopProduct.findMany.mock.calls[0][0].where).toEqual({ active: true });
    expect(res.json.mock.calls[0][0].products).toEqual([{ slug: 'x', title: 'X EN', image: '/uploads/x.webp', fromPriceCents: 4990 }]);

    setup([a, x], []);
    const res2 = makeRes();
    await reco({ method: 'GET', query: { skus: 'nix' } }, res2);
    expect(res2.json.mock.calls[0][0].products).toEqual([]);
  });

  test('max. 20 SKUs, ungültige SKUs werden verworfen', async () => {
    setup([], []);
    const skus = Array.from({ length: 30 }, (_, i) => `S${i}`).join(',') + ',bad sku,';
    await reco({ method: 'GET', query: { skus } }, makeRes());
    const where = mockPrisma.shopFormat.findMany.mock.calls[0][0].where;
    expect(where.sku.in).toHaveLength(20);
    expect(where.sku.in).not.toContain('bad sku');
  });
});
