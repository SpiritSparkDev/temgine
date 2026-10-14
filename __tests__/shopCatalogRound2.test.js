jest.disableAutomock();

jest.mock('../lib/shop/reservations', () => ({ reservedByOthers: jest.fn() }));
const { validateProductInput, toPublicProduct, toRecommendation, availableQty, collectReferences, loadPublicContext, loadLookup, localeFromQuery } = require('../lib/shop/catalog');
const { reservedByOthers } = require('../lib/shop/reservations');

const fmt = (o = {}) => ({ sku: 'DS-HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, weightG: 1200, stock: 20, digital: false, ...o });
const input = (o = {}) => ({ title: 'Dark Space', formats: [fmt()], ...o });
const row = (o = {}) => ({
  id: 'p1', slug: 'dark-space', title: 'Dark Space', category: 'Rollenspiel', subtitle: null, shortText: 'kurz', description: 'Text',
  images: ['/uploads/a.webp'], active: true, sortOrder: 2, updatedAt: new Date('2026-01-02T03:04:05.000Z'),
  formats: [{ id: 'f1', sku: 'DS-HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, weightG: 1200, stock: 5, digital: false, sortOrder: 0 }],
  ...o,
});

describe('validateProductInput: Staffelpreise', () => {
  const tiers = (t, o = {}) => validateProductInput(input({ formats: [fmt({ priceTiers: t, ...o })] }));
  test('gültig; alte Eingaben ohne neue Felder bleiben gültig', () => {
    expect(tiers([{ minQty: 2, priceCents: 4500 }, { minQty: 10, priceCents: 4000 }]).data.formats[0].priceTiers).toEqual([{ minQty: 2, priceCents: 4500 }, { minQty: 10, priceCents: 4000 }]);
    const old = validateProductInput(input());
    expect(old.errors).toEqual([]);
    expect(old.data.formats[0].priceTiers).toEqual([]);
    expect(old.data.formats[0].bundleItems).toEqual([]);
    expect(old.data.related).toEqual([]);
    expect(old.data.translations).toEqual({});
  });
  test('Preis gleich/größer Basispreis, 0 oder negativ', () => {
    expect(tiers([{ minQty: 2, priceCents: 4990 }]).errors.join()).toMatch(/kleiner als der Basispreis/);
    expect(tiers([{ minQty: 2, priceCents: 5000 }]).errors.length).toBe(1);
    expect(tiers([{ minQty: 2, priceCents: 0 }]).errors.length).toBe(1);
    expect(tiers([{ minQty: 2, priceCents: -5 }]).errors.length).toBe(1);
    expect(tiers([{ minQty: 2, priceCents: 4989 }]).errors).toEqual([]);
  });
  test('minQty: Grenzen, doppelt, nicht aufsteigend', () => {
    expect(tiers([{ minQty: 1, priceCents: 100 }]).errors.length).toBe(1);
    expect(tiers([{ minQty: 100, priceCents: 100 }]).errors.length).toBe(1);
    expect(tiers([{ minQty: 2.5, priceCents: 100 }]).errors.length).toBe(1);
    expect(tiers([{ minQty: 99, priceCents: 100 }]).errors).toEqual([]);
    expect(tiers([{ minQty: 3, priceCents: 400 }, { minQty: 3, priceCents: 300 }]).errors.join()).toMatch(/aufsteigend/);
    expect(tiers([{ minQty: 5, priceCents: 400 }, { minQty: 3, priceCents: 300 }]).errors.join()).toMatch(/aufsteigend/);
  });
  test('maximal 5 Stufen, Liste Pflicht, Basispreis Pflicht', () => {
    const six = [2, 3, 4, 5, 6, 7].map((q) => ({ minQty: q, priceCents: 100 }));
    expect(tiers(six).errors.join()).toMatch(/Höchstens 5/);
    expect(tiers(six.slice(0, 5)).errors).toEqual([]);
    expect(tiers('x').errors.length).toBe(1);
    expect(tiers([{ minQty: 2, priceCents: 100 }], { priceCents: null }).errors.join()).toMatch(/Basispreis/);
  });
});

describe('validateProductInput: Bündel', () => {
  const lookup = { knownSkus: new Set(['A', 'B']), bundleSkus: new Set(['BUN']), knownSlugs: new Set() };
  const bundle = (items, o = {}, l = lookup) => validateProductInput(input({ formats: [fmt({ sku: 'MY', bundleItems: items, ...o })] }), l);
  test('gültig: stock und weightG werden null', () => {
    const { errors, data } = bundle([{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }]);
    expect(errors).toEqual([]);
    expect(data.formats[0]).toMatchObject({ stock: null, weightG: null, bundleItems: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }] });
  });
  test('Selbstbezug, Verschachtelung, unbekannte SKU, doppelt', () => {
    expect(bundle([{ sku: 'MY', qty: 1 }]).errors.join()).toMatch(/nicht selbst/);
    expect(bundle([{ sku: 'BUN', qty: 1 }]).errors.join()).toMatch(/Verschachtelung/);
    expect(bundle([{ sku: 'ZZ', qty: 1 }]).errors.join()).toMatch(/existiert nicht/);
    expect(bundle([{ sku: 'A', qty: 1 }, { sku: 'A', qty: 1 }]).errors.join()).toMatch(/mehrfach/);
  });
  test('Geschwister im selben Produkt: bekannt, aber nicht wenn selbst Bündel', () => {
    const ok = validateProductInput(input({ formats: [fmt({ sku: 'NEW' }), fmt({ sku: 'MY', bundleItems: [{ sku: 'NEW', qty: 1 }] })] }), lookup);
    expect(ok.errors).toEqual([]);
    const nested = validateProductInput(input({ formats: [fmt({ sku: 'X', bundleItems: [{ sku: 'A', qty: 1 }] }), fmt({ sku: 'MY', bundleItems: [{ sku: 'X', qty: 1 }] })] }), lookup);
    expect(nested.errors.join()).toMatch(/Verschachtelung/);
  });
  test('qty-Grenzen, max. 10, Preis/Steuersatz Pflicht', () => {
    expect(bundle([{ sku: 'A', qty: 0 }]).errors.length).toBe(1);
    expect(bundle([{ sku: 'A', qty: 100 }]).errors.length).toBe(1);
    expect(bundle([{ sku: 'A', qty: 99 }]).errors).toEqual([]);
    const l = { knownSkus: new Set(Array.from({ length: 11 }, (_, i) => `S${i}`)) };
    expect(bundle(Array.from({ length: 11 }, (_, i) => ({ sku: `S${i}`, qty: 1 })), {}, l).errors.join()).toMatch(/Höchstens 10/);
    expect(bundle([{ sku: 'A', qty: 1 }], { priceCents: null }).errors.join()).toMatch(/Preis und Steuersatz/);
    expect(bundle([{ sku: 'A', qty: 1 }], { priceCents: 0 }).errors.join()).toMatch(/Preis und Steuersatz/);
    expect(bundle([{ sku: 'A', qty: 1 }], { taxRateBp: null }).errors.join()).toMatch(/Preis und Steuersatz/);
  });
  test('ohne lookup entfallen die Datenbankprüfungen', () => {
    expect(bundle([{ sku: 'ZZ', qty: 1 }], {}, {}).errors).toEqual([]);
  });
});

describe('validateProductInput: related und translations', () => {
  const lookup = { knownSlugs: new Set(['karten', 'abenteuer']) };
  test('related: gültig, dedupliziert, eigener Slug, unbekannt, Maximum', () => {
    expect(validateProductInput(input({ related: ['karten', 'karten', 'abenteuer'] }), lookup).data.related).toEqual(['karten', 'abenteuer']);
    expect(validateProductInput(input({ slug: 'karten', related: ['karten'] }), lookup).errors.join()).toMatch(/selbst/);
    expect(validateProductInput(input({ related: ['weg'] }), lookup).errors.join()).toMatch(/existiert nicht/);
    expect(validateProductInput(input({ related: ['Bad Slug'] }), lookup).errors.length).toBe(1);
    const seven = Array.from({ length: 7 }, (_, i) => `p${i}`);
    expect(validateProductInput(input({ related: seven })).errors.join()).toMatch(/Höchstens 6/);
    expect(validateProductInput(input({ related: seven.slice(0, 6) })).errors).toEqual([]);
    expect(validateProductInput(input({ related: 'x' })).errors.length).toBe(1);
  });
  test('translations.en: Grenzen, Trimmen, leere Felder entfallen', () => {
    const t = (en) => validateProductInput(input({ translations: { en } }));
    expect(t({ title: ' Dark Space EN ', subtitle: '  ' }).data.translations).toEqual({ en: { title: 'Dark Space EN' } });
    for (const [k, max] of [['title', 150], ['subtitle', 120], ['shortText', 300], ['description', 10000]]) {
      expect(t({ [k]: 'a'.repeat(max) }).errors).toEqual([]);
      expect(t({ [k]: 'a'.repeat(max + 1) }).errors.join()).toContain(String(max));
    }
    expect(t({}).data.translations).toEqual({});
    expect(validateProductInput(input({ translations: [] })).errors.length).toBe(1);
    expect(validateProductInput(input({ translations: { en: 'x' } })).errors.length).toBe(1);
    expect(validateProductInput(input({ translations: { fr: { title: 'x' } } })).data.translations).toEqual({});
  });
  test('collectReferences', () => {
    expect(collectReferences({ related: ['a', 'a'], formats: [{ bundleItems: [{ sku: 'X' }, { sku: 'X' }] }, {}] })).toEqual({ skus: ['X'], slugs: ['a'] });
    expect(collectReferences(null)).toEqual({ skus: [], slugs: [] });
  });
});

describe('toPublicProduct: neue Felder', () => {
  const comp = (o = {}) => ({ id: 'c1', sku: 'A', label: 'Heft', stock: 10, digital: false, product: { title: 'Heftreihe', translations: { en: { title: 'Booklets' } } }, ...o });
  const bundleRow = (o = {}) => row({ formats: [{ id: 'b1', sku: 'BUN', label: 'Set', priceCents: 3000, taxRateBp: 700, weightG: null, stock: null, digital: false, priceTiers: [{ minQty: 2, priceCents: 2700 }], bundleItems: [{ sku: 'A', qty: 2 }], sortOrder: 0 }], ...o });
  test('Übersetzung nur bei en und vorhandenem Feld', () => {
    const r = row({ subtitle: 'Sub', translations: { en: { title: 'Dark Space EN', shortText: '' } } });
    const en = toPublicProduct(r, { locale: 'en' });
    expect(en.title).toBe('Dark Space EN');
    expect(en.shortText).toBe('kurz');
    expect(en.subtitle).toBe('Sub');
    expect(toPublicProduct(r, { locale: 'de' }).title).toBe('Dark Space');
    expect(toPublicProduct(r).title).toBe('Dark Space');
  });
  test('Staffeln und Bündel-Inhalt, keine Interna', () => {
    const p = toPublicProduct(bundleRow(), { locale: 'en', componentFormats: [comp()] });
    expect(p.formats[0].tiers).toEqual([{ minQty: 2, priceCents: 2700 }]);
    expect(p.formats[0].bundle).toEqual([{ title: 'Booklets', label: 'Heft', qty: 2 }]);
    expect(p.formats[0]).toMatchObject({ orderable: true, inStock: true, digital: false });
    expect(JSON.stringify(p)).not.toMatch(/weightG|"stock"|"id"|bundleItems/);
  });
  test('Bündel digital nur wenn alle Bestandteile digital', () => {
    expect(toPublicProduct(bundleRow(), { componentFormats: [comp({ digital: true })] }).formats[0].digital).toBe(true);
    expect(toPublicProduct(bundleRow(), { componentFormats: [comp()] }).formats[0].digital).toBe(false);
  });
  test('Bündelbestand: Bestandteil/Menge, reserviert, fehlender Bestandteil', () => {
    const f = bundleRow().formats[0];
    expect(availableQty(f, { componentFormats: [comp({ stock: 5 })] })).toBe(2);
    expect(availableQty(f, { componentFormats: [comp({ stock: 5 })], reserved: new Map([['c1', 2]]) })).toBe(1);
    expect(availableQty(f, { componentFormats: [comp({ stock: 5 })], reserved: new Map([['c1', 4]]) })).toBe(0);
    expect(availableQty(f, { componentFormats: [comp({ stock: null })] })).toBeNull();
    expect(availableQty(f, { componentFormats: [] })).toBe(0);
    const p = toPublicProduct(bundleRow(), { componentFormats: [comp({ stock: 3 })], reserved: new Map([['c1', 2]]) });
    expect(p.formats[0]).toMatchObject({ orderable: false, inStock: false });
    expect(p.fromPriceCents).toBeNull();
  });
  test('reserviert reduziert Bestand normaler Formate; Preis 0 nicht bestellbar', () => {
    const r = row({ formats: [{ id: 'f1', sku: 'X', label: 'X', priceCents: 100, taxRateBp: 700, stock: 3, sortOrder: 0 }, { id: 'f2', sku: 'Y', label: 'Y', priceCents: 0, taxRateBp: 700, stock: null, sortOrder: 1 }] });
    expect(toPublicProduct(r, { reserved: new Map([['f1', 2]]) }).formats[0].orderable).toBe(true);
    const p = toPublicProduct(r, { reserved: new Map([['f1', 3]]) });
    expect(p.formats[0]).toMatchObject({ orderable: false, inStock: false });
    expect(p.formats[1].orderable).toBe(false);
  });
  test('related: Kurzform, nur aktive, übersetzter Titel, Reihenfolge der Slugs', () => {
    const mk = (slug, o = {}) => row({ id: slug, slug, title: slug.toUpperCase(), images: [`/uploads/${slug}.webp`], formats: [{ id: `f-${slug}`, sku: slug, label: 'L', priceCents: 500, taxRateBp: 700, stock: null, sortOrder: 0 }], ...o });
    const rel = [mk('b', { translations: { en: { title: 'B EN' } } }), mk('c', { active: false }), mk('a', { images: [] })];
    const p = toPublicProduct(row({ related: ['a', 'c', 'b', 'gone'] }), { locale: 'en', relatedRows: rel });
    expect(p.related).toEqual([
      { slug: 'a', title: 'A', image: null, fromPriceCents: 500 },
      { slug: 'b', title: 'B EN', image: '/uploads/b.webp', fromPriceCents: 500 },
    ]);
    expect(toPublicProduct(row()).related).toEqual([]);
    expect(toRecommendation(rel[0], { locale: 'de' }).title).toBe('B');
  });
});

describe('loadPublicContext / loadLookup / localeFromQuery', () => {
  test('lädt Bestandteile nur bei Bündeln und fragt Reservierungen ab', async () => {
    reservedByOthers.mockResolvedValue(new Map([['f1', 1]]));
    const db = { shopFormat: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', sku: 'A' }]) } };
    const rows = [row({ formats: [{ id: 'b1', sku: 'BUN', bundleItems: [{ sku: 'A', qty: 1 }] }] })];
    const ctx = await loadPublicContext(db, rows);
    expect(db.shopFormat.findMany.mock.calls[0][0].where).toEqual({ sku: { in: ['A'] } });
    expect(reservedByOthers).toHaveBeenCalledWith(['b1', 'c1'], {});
    expect(ctx.reserved.get('f1')).toBe(1);
    db.shopFormat.findMany.mockClear();
    await loadPublicContext(db, [row()]);
    expect(db.shopFormat.findMany).not.toHaveBeenCalled();
  });
  test('loadLookup', async () => {
    const db = {
      shopFormat: { findMany: jest.fn().mockResolvedValue([{ sku: 'A', bundleItems: null }, { sku: 'BUN', bundleItems: [{ sku: 'A', qty: 1 }] }]) },
      shopProduct: { findMany: jest.fn().mockResolvedValue([{ slug: 'karten' }]) },
    };
    const l = await loadLookup(db, { related: ['karten'], formats: [{ bundleItems: [{ sku: 'A' }, { sku: 'BUN' }] }] });
    expect([...l.knownSkus]).toEqual(['A', 'BUN']);
    expect([...l.bundleSkus]).toEqual(['BUN']);
    expect([...l.knownSlugs]).toEqual(['karten']);
    db.shopFormat.findMany.mockClear();
    await loadLookup(db, { title: 'x' });
    expect(db.shopFormat.findMany).not.toHaveBeenCalled();
  });
  test('localeFromQuery', () => {
    expect(localeFromQuery('en')).toBe('en');
    expect(localeFromQuery('de')).toBe('de');
    expect(['fr', undefined, ['en']].map(localeFromQuery)).toEqual(['de', 'de', 'de']);
  });
});
