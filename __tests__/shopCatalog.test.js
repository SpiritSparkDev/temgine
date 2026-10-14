jest.disableAutomock();

const { slugify, validateProductInput, isOrderable, toAdminProduct, toPublicProduct } = require('../lib/shop/catalog');

const fmt = (o = {}) => ({ sku: 'DS-HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, weightG: 1200, stock: 20, digital: false, ...o });
const input = (o = {}) => ({ title: 'Dark Space', formats: [fmt()], ...o });

describe('slugify', () => {
  test('umlauts, symbols, trimming', () => {
    expect(slugify('Dark Space – Grundregelwerk')).toBe('dark-space-grundregelwerk');
    expect(slugify('Äpfel, Öl & Übermaß')).toBe('aepfel-oel-uebermass');
    expect(slugify('  --Hi!!  ')).toBe('hi');
    expect(slugify('')).toBe('');
    expect(slugify('x'.repeat(100))).toHaveLength(80);
  });
});

describe('validateProductInput', () => {
  test('valid input, slug auto-formed, defaults', () => {
    const { errors, data } = validateProductInput(input());
    expect(errors).toEqual([]);
    expect(data.slug).toBe('dark-space');
    expect(data.active).toBe(false);
    expect(data.images).toEqual([]);
    expect(data.category).toBeNull();
    expect(data.formats[0].sortOrder).toBe(0);
  });
  test('title required and limited', () => {
    expect(validateProductInput(input({ title: '  ' })).errors.length).toBeGreaterThan(0);
    expect(validateProductInput(input({ title: 'x'.repeat(151) })).errors.join()).toMatch(/150/);
    expect(validateProductInput(input({ title: 'x'.repeat(150) })).errors).toEqual([]);
  });
  test('field limits', () => {
    for (const [k, max] of [['category', 80], ['subtitle', 120], ['shortText', 300], ['description', 10000]]) {
      expect(validateProductInput(input({ [k]: 'a'.repeat(max) })).errors).toEqual([]);
      expect(validateProductInput(input({ [k]: 'a'.repeat(max + 1) })).errors.join()).toContain(String(max));
    }
  });
  test('slug rules', () => {
    expect(validateProductInput(input({ slug: 'Bad Slug' })).errors.length).toBe(1);
    expect(validateProductInput(input({ slug: 'a--b' })).errors.length).toBe(1);
    expect(validateProductInput(input({ slug: 'a'.repeat(81) })).errors.length).toBe(1);
    expect(validateProductInput(input({ slug: 'ok-slug' })).data.slug).toBe('ok-slug');
    expect(validateProductInput(input({ title: '!!!' })).errors.join()).toMatch(/Slug/);
  });
  test('images', () => {
    expect(validateProductInput(input({ images: ['/uploads/shop/a.webp'] })).errors).toEqual([]);
    for (const bad of ['https://x/a.png', '/uploads/../etc', '/img/a.png', '/uploads/a b.png', 5]) {
      expect(validateProductInput(input({ images: [bad] })).errors.length).toBe(1);
    }
    expect(validateProductInput(input({ images: Array(11).fill('/uploads/a.png') })).errors.join()).toMatch(/10/);
    expect(validateProductInput(input({ images: 'x' })).errors.length).toBe(1);
  });
  test('at least one format', () => {
    expect(validateProductInput(input({ formats: [] })).errors.join()).toMatch(/Format/);
    expect(validateProductInput({ title: 'T' }).errors.join()).toMatch(/Format/);
    expect(validateProductInput(null).errors.length).toBeGreaterThan(0);
  });
  test('sku pattern and duplicates within product', () => {
    expect(validateProductInput(input({ formats: [fmt({ sku: 'bad sku' })] })).errors.length).toBe(1);
    expect(validateProductInput(input({ formats: [fmt({ sku: '' })] })).errors.length).toBe(1);
    expect(validateProductInput(input({ formats: [fmt({ sku: 'A'.repeat(41) })] })).errors.length).toBe(1);
    expect(validateProductInput(input({ formats: [fmt({ sku: 'A'.repeat(40) })] })).errors).toEqual([]);
    const dup = validateProductInput(input({ formats: [fmt(), fmt({ label: 'Zwei' })] }));
    expect(dup.errors.join()).toMatch(/mehrfach/);
  });
  test('format limits', () => {
    const bad = (o) => validateProductInput(input({ formats: [fmt(o)] })).errors.length;
    expect(bad({ label: '' })).toBe(1);
    expect(bad({ label: 'x'.repeat(61) })).toBe(1);
    expect(bad({ priceCents: 1000000 })).toBe(1);
    expect(bad({ priceCents: -1 })).toBe(1);
    expect(bad({ priceCents: 19.9 })).toBe(1);
    expect(bad({ priceCents: '1990' })).toBe(1);
    expect(bad({ taxRateBp: 10001 })).toBe(1);
    expect(bad({ weightG: 1000001 })).toBe(1);
    expect(bad({ stock: -1 })).toBe(1);
    expect(bad({ stock: 1000001 })).toBe(1);
    expect(bad({ priceCents: 999999, taxRateBp: 10000, weightG: 1000000, stock: 1000000 })).toBe(0);
    expect(bad({ priceCents: 0, stock: 0 })).toBe(0);
  });
  test('null/empty price, tax, stock stay null', () => {
    const { errors, data } = validateProductInput(input({ formats: [fmt({ priceCents: null, taxRateBp: '', stock: undefined })] }));
    expect(errors).toEqual([]);
    expect(data.formats[0]).toMatchObject({ priceCents: null, taxRateBp: null, stock: null });
  });
  test('digital forces weightG null', () => {
    const { data } = validateProductInput(input({ formats: [fmt({ digital: true, weightG: 500 })] }));
    expect(data.formats[0].weightG).toBeNull();
    expect(data.formats[0].digital).toBe(true);
  });
  test('format id is passed through, sortOrder defaults to index', () => {
    const { data } = validateProductInput(input({ formats: [fmt({ id: 'f1' }), fmt({ sku: 'B', sortOrder: 7 }), fmt({ sku: 'C' })] }));
    expect(data.formats.map((f) => f.id)).toEqual(['f1', undefined, undefined]);
    expect(data.formats.map((f) => f.sortOrder)).toEqual([0, 7, 2]);
  });
  test('trims text, empty optional becomes null, active only for true', () => {
    const { data } = validateProductInput(input({ title: '  Titel ', subtitle: '  ', active: 'yes' }));
    expect(data.title).toBe('Titel');
    expect(data.subtitle).toBeNull();
    expect(data.active).toBe(false);
    expect(validateProductInput(input({ active: true })).data.active).toBe(true);
  });
});

describe('isOrderable', () => {
  test('rules', () => {
    expect(isOrderable(fmt())).toBe(true);
    expect(isOrderable(fmt({ stock: null }))).toBe(true);
    expect(isOrderable(fmt({ stock: 0 }))).toBe(false);
    expect(isOrderable(fmt({ priceCents: null }))).toBe(false);
    expect(isOrderable(fmt({ taxRateBp: null }))).toBe(false);
    expect(isOrderable(fmt({ priceCents: 0 }))).toBe(true);
    expect(isOrderable(fmt({ taxRateBp: 0 }))).toBe(true);
  });
});

const row = (o = {}) => ({
  id: 'p1', slug: 'dark-space', title: 'Dark Space', category: 'Rollenspiel', subtitle: null, shortText: 'kurz', description: 'Text',
  images: ['/uploads/a.webp'], active: true, sortOrder: 2, updatedAt: new Date('2026-01-02T03:04:05.000Z'),
  formats: [
    { id: 'f2', sku: 'DS-PDF', label: 'PDF', priceCents: 1990, taxRateBp: 700, weightG: null, stock: null, digital: true, sortOrder: 1 },
    { id: 'f1', sku: 'DS-HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, weightG: 1200, stock: 0, digital: false, sortOrder: 0 },
  ],
  ...o,
});

describe('toAdminProduct', () => {
  test('maps all fields, ISO date, formats sorted', () => {
    const p = toAdminProduct(row());
    expect(p.updatedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(p.formats.map((f) => f.sku)).toEqual(['DS-HC', 'DS-PDF']);
    expect(p.formats[0]).toEqual({ id: 'f1', sku: 'DS-HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, weightG: 1200, stock: 0, digital: false, sortOrder: 0 });
    expect(Object.keys(p).sort()).toEqual(['active', 'category', 'description', 'formats', 'id', 'images', 'shortText', 'slug', 'sortOrder', 'subtitle', 'title', 'updatedAt']);
  });
  test('non-array images become []', () => {
    expect(toAdminProduct(row({ images: null })).images).toEqual([]);
  });
});

describe('toPublicProduct', () => {
  test('hides ids, stock, weight; computes orderable/inStock/fromPrice', () => {
    const p = toPublicProduct(row());
    expect(p.fromPriceCents).toBe(1990);
    expect(p.formats).toEqual([
      { sku: 'DS-HC', label: 'Hardcover', priceCents: 4990, taxRateBp: 700, digital: false, orderable: false, inStock: false },
      { sku: 'DS-PDF', label: 'PDF', priceCents: 1990, taxRateBp: 700, digital: true, orderable: true, inStock: true },
    ]);
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/stock"|weightG|"id"|updatedAt|active/);
  });
  test('fromPriceCents null without orderable formats', () => {
    const p = toPublicProduct(row({ formats: [{ id: 'x', sku: 'A', label: 'A', priceCents: null, taxRateBp: 700, stock: null, sortOrder: 0 }] }));
    expect(p.fromPriceCents).toBeNull();
    expect(p.formats[0].orderable).toBe(false);
  });
});
