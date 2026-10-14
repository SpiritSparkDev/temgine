import { statusLabel, formatCents, formatDateTime, buildOrdersQuery, formatRate } from '../components/shopOrdersUtils';

describe('shopOrdersUtils', () => {
  it('labels statuses in German', () => {
    expect(statusLabel('PAID')).toBe('Bezahlt');
    expect(statusLabel('FAILED')).toBe('Fehlgeschlagen');
    expect(statusLabel('XYZ')).toBe('XYZ');
  });

  it('formats cents and dates', () => {
    expect(formatCents(2490).replace(/\s/g, ' ')).toBe('24,90 €');
    expect(formatCents(null)).toBe('');
    expect(formatDateTime('')).toBe('');
    expect(formatDateTime('garbage')).toBe('');
    expect(formatDateTime('2026-03-05T10:20:00Z')).toMatch(/05\.03\.26/);
  });

  it('builds the query', () => {
    expect(buildOrdersQuery({})).toBe('?page=1');
    expect(buildOrdersQuery({ status: 'PAID', q: ' a&b ', page: 2 })).toBe('?status=PAID&q=a%26b&page=2');
  });

  it('formats tax rates', () => {
    expect(formatRate(700)).toBe('7 %');
    expect(formatRate(1950)).toBe('19,5 %');
  });
});
