import { parseEuroToCents, centsToEuro, parsePercentToBp, bpToPercent, formToPayload, emptyForm, productToForm } from '../components/shopFormUtils';

describe('shopFormUtils', () => {
  it('converts euro input to cents', () => {
    expect(parseEuroToCents('24,90')).toBe(2490);
    expect(parseEuroToCents('24.9')).toBe(2490);
    expect(parseEuroToCents('24')).toBe(2400);
    expect(parseEuroToCents('0')).toBe(0);
    expect(parseEuroToCents('')).toBeNull();
    expect(parseEuroToCents('abc')).toBeNaN();
    expect(parseEuroToCents('1,234')).toBeNaN();
    expect(parseEuroToCents('-1')).toBeNaN();
  });

  it('formats cents and percent for the form', () => {
    expect(centsToEuro(2490)).toBe('24,90');
    expect(centsToEuro(5)).toBe('0,05');
    expect(centsToEuro(null)).toBe('');
    expect(parsePercentToBp('7')).toBe(700);
    expect(parsePercentToBp('19 %')).toBe(1900);
    expect(parsePercentToBp('7,5')).toBe(750);
    expect(parsePercentToBp('')).toBeNull();
    expect(parsePercentToBp('x')).toBeNaN();
    expect(bpToPercent(700)).toBe('7');
    expect(bpToPercent(750)).toBe('7,5');
    expect(bpToPercent(null)).toBe('');
  });

  const filled = () => {
    const f = emptyForm();
    f.title = ' Buch ';
    f.formats = [
      { key: 'a', id: 5, sku: 'B-HC', label: 'Hardcover', price: '24,90', tax: '7', weight: '800', stock: '', digital: false },
      { key: 'b', id: undefined, sku: 'B-PDF', label: 'PDF', price: '', tax: '', weight: '123', stock: '3', digital: true },
    ];
    return f;
  };

  it('builds the contract payload (new product, no id/updatedAt)', () => {
    const { payload, errors } = formToPayload(filled());
    expect(errors).toEqual([]);
    expect(payload).toEqual({
      slug: '', title: 'Buch', category: '', subtitle: '', shortText: '', description: '', images: [], active: true, sortOrder: 0, related: [], translations: {},
      formats: [
        { id: 5, sku: 'B-HC', label: 'Hardcover', priceCents: 2490, taxRateBp: 700, weightG: 800, stock: null, digital: false, priceTiers: [], bundleItems: [], sortOrder: 0 },
        { sku: 'B-PDF', label: 'PDF', priceCents: null, taxRateBp: null, weightG: null, stock: 3, digital: true, priceTiers: [], bundleItems: [], sortOrder: 1 },
      ],
    });
  });

  it('includes id and updatedAt for existing products', () => {
    const f = productToForm({ id: 9, updatedAt: '2026-01-01T00:00:00.000Z', slug: 'x', title: 'X', active: false, formats: [{ id: 1, sku: 'S', label: 'L', priceCents: 100, taxRateBp: 1900, weightG: null, stock: 0, digital: true }] });
    const { payload } = formToPayload(f);
    expect(payload.id).toBe(9);
    expect(payload.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(payload.formats[0]).toMatchObject({ priceCents: 100, taxRateBp: 1900, stock: 0 });
  });

  it('reports validation errors before sending', () => {
    const f = emptyForm();
    f.slug = 'Bad Slug';
    f.images = ['http://x/y.jpg'];
    f.formats = [
      { key: 'a', sku: 'bad sku', label: '', price: '1,234', tax: '200', weight: '-1', stock: 'x', digital: false },
      { key: 'b', sku: 'A', label: 'L', price: '10000', tax: '', weight: '', stock: '', digital: false },
      { key: 'c', sku: 'A', label: 'L', price: '', tax: '', weight: '', stock: '', digital: false },
    ];
    const { errors } = formToPayload(f);
    const all = errors.join('|');
    expect(all).toMatch(/Titel ist erforderlich/);
    expect(all).toMatch(/Slug/);
    expect(all).toMatch(/Bilder müssen/);
    expect(all).toMatch(/Format 1: SKU/);
    expect(all).toMatch(/Format 1: Bezeichnung/);
    expect(all).toMatch(/Format 1: Preis/);
    expect(all).toMatch(/Format 1: MwSt/);
    expect(all).toMatch(/Format 1: Gewicht/);
    expect(all).toMatch(/Format 1: Bestand/);
    expect(all).toMatch(/Format 2: Preis/);
    expect(all).toMatch(/Format 3: SKU „A“ kommt doppelt/);
  });
});
