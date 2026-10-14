jest.disableAutomock();

const { formatEuro, parsePriceInput, percentToBp, bpToPercent, vatIncluded } = require('../lib/shop/money');

const norm = (s) => s.replace(/ /g, ' ');

describe('formatEuro', () => {
  test('formats cents in de-DE', () => {
    expect(norm(formatEuro(2490))).toBe('24,90 €');
    expect(norm(formatEuro(0))).toBe('0,00 €');
    expect(norm(formatEuro(123456))).toBe('1.234,56 €');
  });
});

describe('parsePriceInput', () => {
  test.each([
    ['24,90', 2490], ['24.9', 2490], ['24', 2400], ['1.234,50', 123450], ['0', 0], [' 5,5 € ', 550],
  ])('%s -> %i', (input, cents) => {
    expect(parsePriceInput(input)).toEqual({ ok: true, cents });
  });
  test('empty is ok/null', () => {
    for (const v of ['', '  ', null, undefined]) expect(parsePriceInput(v)).toEqual({ ok: true, cents: null });
  });
  test.each(['abc', '-1', '1,234', '1,2,3', '12.345'])('%s is invalid', (v) => {
    expect(parsePriceInput(v)).toEqual({ ok: false, cents: null });
  });
});

describe('percent/bp', () => {
  test('percentToBp', () => {
    expect(percentToBp('7')).toEqual({ ok: true, bp: 700 });
    expect(percentToBp('19,5')).toEqual({ ok: true, bp: 1950 });
    expect(percentToBp('19 %')).toEqual({ ok: true, bp: 1900 });
    expect(percentToBp('')).toEqual({ ok: true, bp: null });
    expect(percentToBp('101')).toEqual({ ok: false, bp: null });
    expect(percentToBp('x')).toEqual({ ok: false, bp: null });
  });
  test('bpToPercent', () => {
    expect(bpToPercent(700)).toBe('7');
    expect(bpToPercent(1950)).toBe('19,5');
    expect(bpToPercent(null)).toBe('');
  });
});

describe('vatIncluded', () => {
  test('rounds included VAT', () => {
    expect(vatIncluded(10700, 700)).toBe(700);
    expect(vatIncluded(11900, 1900)).toBe(1900);
    expect(vatIncluded(4990, 700)).toBe(326);
    expect(vatIncluded(1000, 0)).toBe(0);
  });
});
