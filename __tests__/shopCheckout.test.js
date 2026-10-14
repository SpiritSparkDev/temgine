/**
 * __tests__/shopCheckout.test.js
 * lib/shop/checkout.js: Validierung, Grenzen, UTF-8, Referenzformat, Prefix.
 */

jest.disableAutomock();

const { validateCheckoutInput, formatReference, normalizePrefix, sanitizeItems } = require('../lib/shop/checkout');

const countries = { DE: 'Deutschland', AT: 'Österreich' };
const addr = (o = {}) => ({ name: 'Max Muster', street: 'Weg 1', zip: '12345', city: 'Stadt', country: 'DE', ...o });
const input = (o = {}) => ({ email: 'a@b.de', billing: addr(), acceptTerms: true, ...o });

describe('validateCheckoutInput', () => {
  test('valid input: trimmed, shipping defaults to billing', () => {
    const { errors, data } = validateCheckoutInput(input({ email: '  a@b.de ', billing: addr({ name: '  Max  ' }) }), { countries });
    expect(errors).toEqual({});
    expect(data.email).toBe('a@b.de');
    expect(data.billing.name).toBe('Max');
    expect(data.shipping).toEqual(data.billing);
    expect(data.acceptWaiver).toBe(false);
  });

  test('field errors use dotted keys', () => {
    const { errors } = validateCheckoutInput(input({ billing: addr({ zip: '', country: 'XX' }) }), { countries });
    expect(errors['billing.zip']).toBeTruthy();
    expect(errors['billing.country']).toBeTruthy();
    expect(errors['billing.name']).toBeUndefined();
  });

  test('shipping address is validated when given', () => {
    const { errors, data } = validateCheckoutInput(input({ shipping: addr({ city: '', country: 'AT' }) }), { countries });
    expect(errors['shipping.city']).toBeTruthy();
    expect(data.shipping.country).toBe('AT');
  });

  test('limits: name 100, street 150, zip 20, city 100, email 200', () => {
    const ok = validateCheckoutInput(input({ billing: addr({ name: 'a'.repeat(100), street: 'a'.repeat(150), zip: '1'.repeat(20), city: 'a'.repeat(100) }) }), { countries });
    expect(ok.errors).toEqual({});
    const bad = validateCheckoutInput(input({ billing: addr({ name: 'a'.repeat(101), street: 'a'.repeat(151), zip: '1'.repeat(21), city: 'a'.repeat(101) }) }), { countries });
    expect(Object.keys(bad.errors).sort()).toEqual(['billing.city', 'billing.name', 'billing.street', 'billing.zip']);
    expect(validateCheckoutInput(input({ email: 'a'.repeat(196) + '@b.de' }), { countries }).errors.email).toBeTruthy();
  });

  test('length counts characters, not UTF-16 units', () => {
    const emoji = '\u{1F600}'.repeat(100);
    expect(validateCheckoutInput(input({ billing: addr({ name: emoji }) }), { countries }).errors).toEqual({});
  });

  test('bad email', () => {
    for (const email of ['', 'abc', 'a@b', 42, null]) {
      expect(validateCheckoutInput(input({ email }), { countries }).errors.email).toBeTruthy();
    }
  });

  test('non-strings are errors', () => {
    const { errors } = validateCheckoutInput(input({ billing: addr({ name: 5, street: ['x'], zip: null }) }), { countries });
    expect(errors['billing.name']).toBeTruthy();
    expect(errors['billing.street']).toBeTruthy();
    expect(errors['billing.zip']).toBeTruthy();
    expect(validateCheckoutInput(input({ shipping: 'x' }), { countries }).errors.shipping).toBeTruthy();
  });

  test('acceptTerms must be true; acceptWaiver only true counts', () => {
    expect(validateCheckoutInput(input({ acceptTerms: 'true' }), { countries }).errors.acceptTerms).toBeTruthy();
    expect(validateCheckoutInput(input({ acceptTerms: undefined }), { countries }).errors.acceptTerms).toBeTruthy();
    expect(validateCheckoutInput(input({ acceptWaiver: true }), { countries }).data.acceptWaiver).toBe(true);
    expect(validateCheckoutInput(input({ acceptWaiver: 'yes' }), { countries }).data.acceptWaiver).toBe(false);
  });

  test('invalid UTF-8 (lone surrogate) and NUL are rejected', () => {
    expect(validateCheckoutInput(input({ billing: addr({ name: 'a\uD800b' }) }), { countries }).errors.input).toBeTruthy();
    expect(validateCheckoutInput(input({ billing: addr({ city: 'a\u0000' }) }), { countries }).errors.input).toBeTruthy();
    expect(validateCheckoutInput(input({ billing: addr({ name: 'Zoë 😀' }) }), { countries }).errors.input).toBeUndefined();
  });

  test('non-object body does not throw', () => {
    expect(Object.keys(validateCheckoutInput(null, { countries }).errors).length).toBeGreaterThan(0);
    expect(Object.keys(validateCheckoutInput('x', {}).errors).length).toBeGreaterThan(0);
  });

  test('country codes like "constructor" are not accepted', () => {
    expect(validateCheckoutInput(input({ billing: addr({ country: 'constructor' }) }), { countries }).errors['billing.country']).toBeTruthy();
  });
});

describe('sanitizeItems', () => {
  test('keeps only sku and qty, max 50', () => {
    expect(sanitizeItems([{ sku: ' A ', qty: 2, priceCents: 1 }])).toEqual([{ sku: 'A', qty: 2 }]);
    expect(sanitizeItems(Array.from({ length: 50 }, () => ({ sku: 'A', qty: 1 })))).toHaveLength(50);
    expect(sanitizeItems(Array.from({ length: 51 }, () => ({ sku: 'A', qty: 1 })))).toBeNull();
    expect(sanitizeItems([{ sku: 5 }])).toBeNull();
    expect(sanitizeItems('x')).toBeNull();
    expect(sanitizeItems(undefined)).toEqual([]);
  });
});

describe('reference and prefix', () => {
  test('formatReference pads to 6 digits and uses UTC year', () => {
    expect(formatReference('ORD', new Date('2026-05-01T10:00:00Z'), 123)).toBe('ORD-2026-000123');
    expect(formatReference('ORD', new Date('2026-12-31T23:30:00Z'), 1234567)).toBe('ORD-2026-1234567');
    expect(formatReference('X1', new Date('2027-01-01T00:00:00Z'), 1)).toBe('X1-2027-000001');
  });

  test('normalizePrefix: A-Z0-9, max 8, default ORD', () => {
    expect(normalizePrefix('pf-shop!')).toBe('PFSHOP');
    expect(normalizePrefix('ABCDEFGHIJK')).toBe('ABCDEFGH');
    expect(normalizePrefix('')).toBe('ORD');
    expect(normalizePrefix('---')).toBe('ORD');
    expect(normalizePrefix(null)).toBe('ORD');
  });
});

describe('pickLocale / loadPricingFormats', () => {
  const { pickLocale, loadPricingFormats } = require('../lib/shop/checkout')
  test('pickLocale: nur de|en, sonst Fallback', () => {
    expect(pickLocale('EN')).toBe('en')
    expect(pickLocale(' de ')).toBe('de')
    expect(pickLocale('fr', 'en')).toBe('en')
    expect(pickLocale(undefined)).toBe('de')
    expect(pickLocale(5, 'en')).toBe('en')
  })
  test('lädt Bündel-Bestandteile ohne Aktiv-Filter nach, nur wenn nötig', async () => {
    const findMany = jest.fn()
      .mockResolvedValueOnce([{ sku: 'SET', bundleItems: [{ sku: 'A', qty: 1 }, { sku: 'SET2', qty: 1 }] }, { sku: 'SET2', bundleItems: null }])
      .mockResolvedValueOnce([{ sku: 'A' }])
    const out = await loadPricingFormats({ shopFormat: { findMany } }, ['SET', 'SET2', 'SET'])
    expect(out.map((f) => f.sku)).toEqual(['SET', 'SET2', 'A'])
    expect(findMany.mock.calls[0][0].where).toEqual({ sku: { in: ['SET', 'SET2'] }, product: { active: true } })
    expect(findMany.mock.calls[1][0].where).toEqual({ sku: { in: ['A'] } })
    const once = jest.fn().mockResolvedValue([{ sku: 'X', bundleItems: null }])
    await loadPricingFormats({ shopFormat: { findMany: once } }, ['X'])
    expect(once).toHaveBeenCalledTimes(1)
    expect(await loadPricingFormats({ shopFormat: { findMany: once } }, [])).toEqual([])
  })
})
