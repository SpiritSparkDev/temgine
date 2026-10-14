/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopOrdersView from '../components/ShopOrdersView';

const list = (page = 1, pages = 2) => ({
  orders: [{ id: 'o1', reference: 'ORD-2026-000001', status: 'PAID', email: 'a@b.de', totalCents: 2490, createdAt: '2026-03-05T10:20:00Z', paidAt: null }],
  total: 30, page, pages,
});
const res = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const urls = () => global.fetch.mock.calls.map(([u]) => u);

describe('ShopOrdersView', () => {
  it('renders the table with labels and escaped text', async () => {
    global.fetch = jest.fn(() => res(200, { ...list(), orders: [{ ...list().orders[0], email: '<b>x</b>@b.de' }] }));
    render(<ShopOrdersView showToast={() => {}} />);
    await screen.findByText('ORD-2026-000001');
    expect(screen.getByText('<b>x</b>@b.de')).toBeTruthy();
    expect(screen.getAllByText('Bezahlt').length).toBeGreaterThan(0);
    expect(urls()[0]).toBe('/api/shop/orders?page=1');
  });

  it('filters by status and pages', async () => {
    global.fetch = jest.fn(() => res(200, list()));
    render(<ShopOrdersView showToast={() => {}} />);
    await screen.findByText('ORD-2026-000001');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'SHIPPED' } });
    await waitFor(() => expect(urls()).toContain('/api/shop/orders?status=SHIPPED&page=1'));
    fireEvent.click(screen.getByText('Weiter'));
    await waitFor(() => expect(urls()).toContain('/api/shop/orders?status=SHIPPED&page=2'));
  });

  it('debounces the search', async () => {
    global.fetch = jest.fn(() => res(200, list()));
    render(<ShopOrdersView showToast={() => {}} />);
    await screen.findByText('ORD-2026-000001');
    const input = screen.getByLabelText('Suche');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ab' } });
    await waitFor(() => expect(urls()).toContain('/api/shop/orders?q=ab&page=1'));
    expect(urls().some((u) => u.includes('q=a&'))).toBe(false);
  });

  it('opens the detail and returns', async () => {
    global.fetch = jest.fn((u) => (u === '/api/shop/orders/o1'
      ? res(200, { order: { id: 'o1', reference: 'ORD-2026-000001', status: 'PAID', items: [], payments: [] } })
      : res(200, list())));
    render(<ShopOrdersView showToast={() => {}} />);
    fireEvent.click(await screen.findByText('ORD-2026-000001'));
    await screen.findByText('Bestellung ORD-2026-000001');
    fireEvent.click(screen.getByText('Zurück zur Liste'));
    await screen.findByLabelText('Suche');
  });

  it('shows an error toast when loading fails', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn(() => res(500, { error: 'Kaputt' }));
    render(<ShopOrdersView showToast={toast} />);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Kaputt', 'error'));
  });
});
