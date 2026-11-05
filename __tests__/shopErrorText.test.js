const { errorText } = require('../lib/shop/client/errors');
const { default: sf } = require('../lib/shop/i18n/storefront');

test('errorText: de uses server text, en maps known code, en unknown code falls back', () => {
  expect(errorText('de', { error: 'Zu viele', code: 'RATE_LIMIT_EXCEEDED' }, 'shop.checkout.orderError')).toBe('Zu viele');
  expect(errorText('en', { error: 'Zu viele', code: 'RATE_LIMIT_EXCEEDED' }, 'shop.checkout.orderError')).toBe(sf.en['shop.error.RATE_LIMIT_EXCEEDED']);
  expect(errorText('en', { error: 'Hä', code: 'WAT' }, 'shop.checkout.orderError')).toBe(sf.en['shop.checkout.orderError']);
  expect(errorText('en', null, 'shop.checkout.orderError')).toBe(sf.en['shop.checkout.orderError']);
});

test('shop.error keys exist in de and en', () => {
  const k = (l) => Object.keys(sf[l]).filter((x) => x.startsWith('shop.error.')).sort();
  expect(k('en')).toEqual(k('de'));
  expect(k('de').length).toBeGreaterThan(10);
});
