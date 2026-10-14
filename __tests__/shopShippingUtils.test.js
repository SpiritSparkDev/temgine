import { configToForm, formToPayload } from '../components/shopShippingUtils';

const cfg = {
  countries: { DE: 'Deutschland', AT: 'Österreich' },
  zones: [{ id: 'DE', name: 'Deutschland', countries: ['DE'], tiers: [{ maxG: 500, priceCents: 490 }, { maxG: 2000, priceCents: 690 }] }],
};

describe('shopShippingUtils', () => {
  it('round-trips config to payload in cents', () => {
    const { payload, errors } = formToPayload(configToForm(cfg));
    expect(errors).toEqual([]);
    expect(payload).toEqual(cfg);
  });

  it('parses euro input and integer grams', () => {
    const f = configToForm(cfg);
    f.zones[0].tiers[0].price = '5,5';
    f.zones[0].tiers[0].maxG = '600';
    expect(formToPayload(f).payload.zones[0].tiers[0]).toEqual({ maxG: 600, priceCents: 550 });
  });

  it('rejects non-ascending tiers, bad prices and empty names', () => {
    const f = configToForm(cfg);
    f.zones[0].tiers[1].maxG = '500';
    f.zones[0].tiers[0].price = 'abc';
    f.zones[0].name = ' ';
    const { errors } = formToPayload(f);
    expect(errors.length).toBe(3);
  });

  it('rejects a country in two zones and unknown codes', () => {
    const f = configToForm(cfg);
    f.zones.push({ key: 'x', id: 'EU', name: 'EU', countries: ['DE', 'FR'], tiers: [] });
    const { errors } = formToPayload(f);
    expect(errors.some((e) => e.includes('mehreren Zonen'))).toBe(true);
    expect(errors.some((e) => e.includes('„FR“'))).toBe(true);
  });
});
