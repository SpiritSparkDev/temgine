/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopOverviewView from '../components/ShopOverviewView';
import ShopReturnsView from '../components/ShopReturnsView';

const res = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });

const overview = {
  currency: 'EUR',
  revenue: { last7: 1000, last30: 2000, total: 3000 },
  orders: { byStatus: { PAID: 2, PENDING: 1 }, open: 1 },
  perDay: [{ date: '2026-03-01', count: 1, revenueCents: 1000 }],
  topProducts: [{ title: '<b>Buch</b>', units: 3 }],
  averageOrderCents: 1500,
  refundedCents: 0,
  lowStock: [],
  topCoupons: [{ code: 'HI', uses: 1, discountCents: 100 }],
};

describe('ShopOverviewView', () => {
  it('renders tiles, chart and lists', async () => {
    global.fetch = jest.fn(() => res(200, overview));
    render(<ShopOverviewView showToast={() => {}} />);
    await screen.findByText('Umsatz 7 Tage');
    expect(screen.getByRole('img')).toBeTruthy();
    expect(screen.getByText(/<b>Buch<\/b>/)).toBeTruthy();
    expect(screen.getByText(/Niedrigbestand-Schwelle/)).toBeTruthy();
  });
  it('shows a hint when permission is missing', async () => {
    global.fetch = jest.fn(() => res(403, { error: 'x' }));
    render(<ShopOverviewView showToast={() => {}} />);
    await screen.findByText(/fehlt dir das Recht/);
  });
});

describe('ShopReturnsView', () => {
  const list = { returns: [{ id: 'r1', reference: 'ORD-1', email: 'a@b.de', status: 'NEW', createdAt: '2026-03-01T10:00:00Z', reasonExcerpt: 'kaputt' }], total: 1, page: 1, pages: 1 };
  const detail = { return: { id: 'r1', status: 'NEW', email: 'a@b.de', reason: 'kaputt', adminNote: null, createdAt: '2026-03-01T10:00:00Z', wholeOrder: false, items: [{ sku: 'A', qty: 1, title: 'Buch', label: 'HC' }], order: { reference: 'ORD-1' } } };

  it('filters the list', async () => {
    global.fetch = jest.fn(() => res(200, list));
    render(<ShopReturnsView showToast={() => {}} />);
    await screen.findByText('ORD-1');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'NEW' } });
    await waitFor(() => expect(global.fetch.mock.calls.map(([u]) => u)).toContain('/api/shop/returns?status=NEW&page=1'));
  });

  it('offers only allowed transitions and confirms', async () => {
    global.fetch = jest.fn((u, o) => {
      if (o && o.method === 'PUT') return res(200, { return: { ...detail.return, status: 'APPROVED' } });
      return res(200, u.startsWith('/api/shop/returns/') ? detail : list);
    });
    window.confirm = jest.fn(() => true);
    render(<ShopReturnsView showToast={() => {}} />);
    fireEvent.click(await screen.findByText('ORD-1'));
    await screen.findByText('Genehmigt');
    expect(screen.queryByText('Ware eingegangen')).toBeNull();
    fireEvent.click(screen.getByText('Genehmigt'));
    await waitFor(() => {
      const put = global.fetch.mock.calls.find(([, o]) => o && o.method === 'PUT');
      expect(JSON.parse(put[1].body)).toEqual({ status: 'APPROVED' });
    });
    expect(window.confirm).toHaveBeenCalled();
  });
});
