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

  it('applies date filters and builds export links with the current filters', async () => {
    global.fetch = jest.fn(() => res(200, list()));
    render(<ShopOrdersView showToast={() => {}} />);
    await screen.findByText('ORD-2026-000001');
    expect(screen.getByText('CSV exportieren').getAttribute('href')).toBe('/api/shop/orders/export');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'REFUNDED' } });
    fireEvent.change(screen.getByLabelText('Von'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Bis'), { target: { value: '2026-03-31' } });
    await waitFor(() => expect(urls()).toContain('/api/shop/orders?status=REFUNDED&from=2026-03-01&to=2026-03-31&page=1'));
    expect(screen.getByText('CSV exportieren').getAttribute('href')).toBe('/api/shop/orders/export?status=REFUNDED&from=2026-03-01&to=2026-03-31');
    expect(screen.getByText('CSV mit Positionen').getAttribute('href')).toBe('/api/shop/orders/export?status=REFUNDED&from=2026-03-01&to=2026-03-31&detail=items');
  });

  it('shows refunded amounts and the REFUNDED label', async () => {
    global.fetch = jest.fn(() => res(200, { ...list(), orders: [{ ...list().orders[0], status: 'REFUNDED', refundedCents: 1000 }] }));
    render(<ShopOrdersView showToast={() => {}} />);
    await screen.findByText('ORD-2026-000001');
    expect(screen.getAllByText('Erstattet').length).toBeGreaterThan(1);
    expect(screen.getByText(/10,00/)).toBeTruthy();
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

describe('ShopOrdersView reconcile and layout', () => {
  it('wraps the table in a scroll container', async () => {
    global.fetch = jest.fn(() => res(200, list()));
    const { container } = render(<ShopOrdersView showToast={() => {}} />);
    await screen.findByText('ORD-2026-000001');
    expect(container.querySelector('table').parentElement.style.overflowX).toBe('auto');
  });

  it('reconciles open payments: disabled while running, toast, list reloads', async () => {
    const toast = jest.fn();
    let finish;
    global.fetch = jest.fn((url) => (url === '/api/shop/orders/reconcile'
      ? new Promise((r) => { finish = r; })
      : res(200, list())));
    render(<ShopOrdersView showToast={toast} />);
    await screen.findByText('ORD-2026-000001');
    const btn = screen.getByText('Offene Zahlungen abgleichen');
    fireEvent.click(btn);
    await waitFor(() => expect(btn.disabled).toBe(true));
    expect(global.fetch.mock.calls.find(([u]) => u === '/api/shop/orders/reconcile')[1].method).toBe('POST');
    const before = urls().filter((u) => u.startsWith('/api/shop/orders?')).length;
    finish(await res(200, { checked: 3, paid: 2, failed: 1, pending: 0 }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Geprüft: 3, bezahlt: 2, fehlgeschlagen: 1'));
    await waitFor(() => expect(urls().filter((u) => u.startsWith('/api/shop/orders?')).length).toBe(before + 1));
    expect(btn.disabled).toBe(false);
  });

  it('shows an error toast when reconcile fails', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((url) => (url === '/api/shop/orders/reconcile' ? res(500, { error: 'Nope' }) : res(200, list())));
    render(<ShopOrdersView showToast={toast} />);
    await screen.findByText('ORD-2026-000001');
    fireEvent.click(screen.getByText('Offene Zahlungen abgleichen'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Nope', 'error'));
  });
});
