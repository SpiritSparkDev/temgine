import {
  statusLabel, eventLabel, formatCents, formatDateTime, buildOrdersQuery, formatRate, buildExportUrl, rightsFor, parseEuroToCents,
  centsToInput, maxRefundCents, canRefundOrder, canCancelOrder, hasInvoice, trackingBody, validateRefundAmount, sortEvents, STATUS_FILTERS,
} from '../components/shopOrdersUtils';

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

  it('covers round-2 helpers', () => {
    expect(statusLabel('REFUNDED')).toBe('Erstattet');
    expect(STATUS_FILTERS.map((f) => f.value)).toContain('REFUNDED');
    expect(eventLabel('NOTE')).toBe('Notiz');
    expect(formatCents(1000, 'CHF').replace(/\s/g, ' ')).toMatch(/10,00 CHF/);
    expect(buildOrdersQuery({ from: '2026-03-01', to: '2026-03-31' })).toBe('?from=2026-03-01&to=2026-03-31&page=1');
    expect(buildExportUrl({})).toBe('/api/shop/orders/export');
    expect(buildExportUrl({ status: 'PAID', detail: 'items' })).toBe('/api/shop/orders/export?status=PAID&detail=items');
    expect(rightsFor('ADMIN')).toEqual({ edit: true, refund: true });
    expect(rightsFor('MODERATOR')).toEqual({ edit: true, refund: false });
    expect(rightsFor('EDITOR')).toEqual({ edit: false, refund: false });
    expect(parseEuroToCents('12,5')).toBe(1250);
    expect(parseEuroToCents('12.50')).toBe(1250);
    expect(parseEuroToCents('1,234')).toBeNull();
    expect(parseEuroToCents('')).toBeNull();
    expect(centsToInput(4475)).toBe('44,75');
    const o = { status: 'PAID', totalCents: 5475, refundedCents: 1000 };
    expect(maxRefundCents(o)).toBe(4475);
    expect(canRefundOrder(o, { refund: true })).toBe(true);
    expect(canRefundOrder(o, { refund: false })).toBe(false);
    expect(canRefundOrder({ ...o, status: 'REFUNDED' }, { refund: true })).toBe(false);
    expect(canRefundOrder({ ...o, refundedCents: 5475 }, { refund: true })).toBe(false);
    expect(canCancelOrder({ status: 'PENDING' }, { edit: true })).toBe(true);
    expect(canCancelOrder({ status: 'PAID' }, { edit: true })).toBe(false);
    expect(hasInvoice({ status: 'REFUNDED' })).toBe(true);
    expect(hasInvoice({ status: 'PENDING' })).toBe(false);
    expect(trackingBody({ carrier: ' DHL ', trackingNumber: '', trackingUrl: '' })).toEqual({ carrier: 'DHL' });
    expect(trackingBody({ carrier: '' }, true)).toEqual({ carrier: '', trackingNumber: '', trackingUrl: '' });
    expect(validateRefundAmount('44,75', o)).toEqual({ cents: 4475 });
    expect(validateRefundAmount('44,76', o).error).toMatch(/höchstens/);
    expect(validateRefundAmount('0', o).error).toBeTruthy();
    expect(sortEvents([{ id: 1, createdAt: '2026-01-01' }, { id: 2, createdAt: '2026-02-01' }]).map((e) => e.id)).toEqual([2, 1]);
  });
});
