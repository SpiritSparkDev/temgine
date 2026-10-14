import { buildTiles, statusRows, barGeometry, shortDate } from '../components/shopOverviewUtils';
import { allowedTransitions, buildReturnsQuery, returnLabel } from '../components/shopReturnsUtils';
import { TRANSITIONS } from '../lib/shop/returns';

jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('../lib/shop/events', () => ({ logOrderEvent: jest.fn() }));
jest.mock('../lib/shop/settingsStore', () => ({ getSetting: jest.fn() }));
jest.mock('../lib/shop/orderMails', () => ({ sendReturnMail: jest.fn() }));

describe('shopOverviewUtils', () => {
  it('builds tiles with currency', () => {
    const t = buildTiles({ currency: 'CHF', revenue: { last7: 100, last30: 200, total: 300 }, orders: { open: 2 }, averageOrderCents: 150, refundedCents: 0 });
    expect(t).toHaveLength(6);
    expect(t[0].value).toMatch(/1,00/);
    expect(t[0].value).toMatch(/CHF/);
    expect(t[3].value).toBe('2');
  });
  it('orders status rows', () => {
    expect(statusRows({ PAID: 3, PENDING: 1 }).map((r) => r.status)).toEqual(['PENDING', 'PAID']);
  });
  it('scales bars', () => {
    const b = barGeometry([{ date: '2026-03-01', count: 1, revenueCents: 500 }, { date: '2026-03-02', count: 0, revenueCents: 0 }], { width: 100, height: 50, gap: 0 });
    expect(b[0].height).toBe(50);
    expect(b[1].height).toBe(0);
    expect(barGeometry([], {})).toEqual([]);
  });
  it('shortens dates', () => expect(shortDate('2026-03-05')).toBe('05.03.'));
});

describe('shopReturnsUtils', () => {
  it('mirrors the server transitions', () => {
    for (const s of Object.keys(TRANSITIONS)) expect(allowedTransitions(s)).toEqual(TRANSITIONS[s]);
  });
  it('builds query and labels', () => {
    expect(buildReturnsQuery({ status: 'NEW', page: 2 })).toBe('?status=NEW&page=2');
    expect(buildReturnsQuery()).toBe('?page=1');
    expect(returnLabel('RECEIVED')).toBe('Ware eingegangen');
  });
});
