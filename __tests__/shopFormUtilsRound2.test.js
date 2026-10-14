import { emptyForm, formToPayload, productToForm } from '../components/shopFormUtils';

describe('shopFormUtils round 2 (tiers, bundles, related, translation)', () => {
  const withFormat = (patch) => {
    const f = emptyForm();
    f.title = 'T';
    f.formats = [{ key: 'a', sku: 'A-1', label: 'L', price: '20,00', tax: '7', weight: '100', stock: '5', digital: false, tiers: [], bundle: [], ...patch }];
    return formToPayload(f);
  };

  it('converts price tiers (euro -> cent) into the contract', () => {
    const { payload, errors } = withFormat({ tiers: [{ key: 't1', minQty: '3', price: '18,50' }, { key: 't2', minQty: '10', price: '15' }] });
    expect(errors).toEqual([]);
    expect(payload.formats[0].priceTiers).toEqual([{ minQty: 3, priceCents: 1850 }, { minQty: 10, priceCents: 1500 }]);
  });

  it('validates price tiers like the catalog', () => {
    const all = (tiers, extra = {}) => withFormat({ tiers, ...extra }).errors.join('|');
    expect(all([{ key: 'a', minQty: '1', price: '10' }])).toMatch(/2 bis 99/);
    expect(all([{ key: 'a', minQty: '100', price: '10' }])).toMatch(/2 bis 99/);
    expect(all([{ key: 'a', minQty: '3', price: '10' }, { key: 'b', minQty: '3', price: '9' }])).toMatch(/aufsteigend/);
    expect(all([{ key: 'a', minQty: '3', price: '20' }])).toMatch(/kleiner als der Basispreis/);
    expect(all([{ key: 'a', minQty: '3', price: '0' }])).toMatch(/Preis ungültig/);
    expect(all([{ key: 'a', minQty: '3', price: '1' }], { price: '' })).toMatch(/Basispreis/);
    const six = [2, 3, 4, 5, 6, 7].map((n) => ({ key: `k${n}`, minQty: String(n), price: '1' }));
    expect(all(six)).toMatch(/Höchstens 5 Staffelpreise/);
  });

  it('builds bundles: stock and weight null, digital false, price and tax required', () => {
    const ok = withFormat({ bundle: [{ key: 'b', sku: 'X-1', qty: '2' }], digital: true });
    expect(ok.errors).toEqual([]);
    expect(ok.payload.formats[0]).toMatchObject({ bundleItems: [{ sku: 'X-1', qty: 2 }], stock: null, weightG: null, digital: false });
    const bad = withFormat({ bundle: [{ key: 'b', sku: 'A-1', qty: '0' }, { key: 'c', sku: '', qty: '100' }], price: '', tax: '' }).errors.join('|');
    expect(bad).toMatch(/nicht selbst enthalten/);
    expect(bad).toMatch(/Menge muss eine ganze Zahl von 1 bis 99/);
    expect(bad).toMatch(/SKU wählen/);
    expect(bad).toMatch(/Bündel braucht Preis und MwSt/);
    expect(withFormat({ bundle: [{ key: 'a', sku: 'X', qty: '1' }, { key: 'b', sku: 'X', qty: '1' }] }).errors.join('|')).toMatch(/mehrfach/);
  });

  it('round-trips tiers, bundle, related and the English translation', () => {
    const f = productToForm({
      id: 'p1', updatedAt: 'u', slug: 's', title: 'T', active: true, related: ['a', 'b'],
      translations: { en: { title: 'Title', description: 'Desc' } },
      formats: [{ id: 'f1', sku: 'S', label: 'L', priceCents: 2000, taxRateBp: 700, weightG: null, stock: null, digital: false, priceTiers: [{ minQty: 5, priceCents: 1750 }], bundleItems: [{ sku: 'Q', qty: 3 }] }],
    });
    expect(f.formats[0].tiers).toMatchObject([{ minQty: '5', price: '17,50' }]);
    expect(f.formats[0].bundle).toMatchObject([{ sku: 'Q', qty: '3' }]);
    const { payload, errors } = formToPayload(f);
    expect(errors).toEqual([]);
    expect(payload.related).toEqual(['a', 'b']);
    expect(payload.translations).toEqual({ en: { title: 'Title', description: 'Desc' } });
    expect(payload.formats[0].priceTiers).toEqual([{ minQty: 5, priceCents: 1750 }]);
  });

  it('limits related and translation lengths', () => {
    const f = emptyForm();
    f.title = 'T';
    f.formats = [{ key: 'a', sku: 'A', label: 'L', price: '', tax: '', weight: '', stock: '', digital: false, tiers: [], bundle: [] }];
    f.related = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    f.en.title = 'x'.repeat(151);
    const all = formToPayload(f).errors.join('|');
    expect(all).toMatch(/Höchstens 6 Empfehlungen/);
    expect(all).toMatch(/Übersetzung EN: Titel/);
  });
});
