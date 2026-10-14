/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopOrderDetail from '../components/ShopOrderDetail';

const order = (status) => ({
  id: 'o1', reference: 'ORD-2026-000001', status, email: 'kunde@x.de',
  subtotalCents: 4980, shippingCents: 495, totalCents: 5475, taxBreakdown: { 700: 326 },
  billing: { name: 'Max <i>Muster</i>', street: 'Weg 1', zip: '12345', city: 'Stadt', country: 'DE' },
  shipping: { name: 'Erika Muster', street: 'Pfad 2', zip: '54321', city: 'Ort', country: 'AT' },
  items: [{ id: 'i1', sku: 'DS-HC', title: 'Dark Space', label: 'Hardcover', qty: 2, unitCents: 2490, taxRateBp: 700 }],
  payments: [{ id: 'p1', provider: 'sumup', status: 'PAID', amountCents: 5475 }],
  createdAt: '2026-03-05T10:20:00Z', paidAt: '2026-03-05T10:25:00Z', shippedAt: null,
});
const res = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });

describe('ShopOrderDetail', () => {
  it('shows items, totals, tax, addresses, contact and payments', async () => {
    global.fetch = jest.fn(() => res(200, { order: order('PAID') }));
    render(<ShopOrderDetail id="o1" onBack={() => {}} showToast={() => {}} />);
    await screen.findByText('Bestellung ORD-2026-000001');
    expect(screen.getByText('Dark Space – Hardcover (DS-HC)')).toBeTruthy();
    expect(screen.getByText(/enthaltene MwSt\. 7 %/)).toBeTruthy();
    expect(screen.getByText('Max <i>Muster</i>')).toBeTruthy();
    expect(screen.getByText('Erika Muster')).toBeTruthy();
    expect(screen.getByText('kunde@x.de')).toBeTruthy();
    expect(screen.getByText(/sumup – Bezahlt/)).toBeTruthy();
  });

  it('offers shipping only for PAID', async () => {
    global.fetch = jest.fn(() => res(200, { order: order('SHIPPED') }));
    render(<ShopOrderDetail id="o1" onBack={() => {}} showToast={() => {}} />);
    await screen.findByText('Bestellung ORD-2026-000001');
    expect(screen.queryByText('Als versendet markieren')).toBeNull();
  });

  it('confirms, ships and updates the status', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((u, o) => (o?.method === 'POST' ? res(200, { ok: true }) : res(200, { order: order('PAID') })));
    render(<ShopOrderDetail id="o1" onBack={() => {}} showToast={toast} />);
    fireEvent.click(await screen.findByText('Als versendet markieren'));
    expect(global.fetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
    fireEvent.click(screen.getByText('Bestätigen'));
    await screen.findByText('Versendet');
    expect(global.fetch.mock.calls.find(([, o]) => o?.method === 'POST')[0]).toBe('/api/shop/orders/o1/ship');
    expect(screen.queryByText('Als versendet markieren')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns on mailError and toasts on failure', async () => {
    global.fetch = jest.fn((u, o) => (o?.method === 'POST' ? res(200, { mailError: true }) : res(200, { order: order('PAID') })));
    const { unmount } = render(<ShopOrderDetail id="o1" onBack={() => {}} showToast={() => {}} />);
    fireEvent.click(await screen.findByText('Als versendet markieren'));
    fireEvent.click(screen.getByText('Bestätigen'));
    await screen.findByRole('alert');
    unmount();

    const toast = jest.fn();
    global.fetch = jest.fn((u, o) => (o?.method === 'POST' ? res(409, { error: 'Nicht bezahlt' }) : res(200, { order: order('PAID') })));
    render(<ShopOrderDetail id="o1" onBack={() => {}} showToast={toast} />);
    fireEvent.click(await screen.findByText('Als versendet markieren'));
    fireEvent.click(screen.getByText('Bestätigen'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Nicht bezahlt', 'error'));
  });

  it('calls onBack', async () => {
    const back = jest.fn();
    global.fetch = jest.fn(() => res(200, { order: order('PAID') }));
    render(<ShopOrderDetail id="o1" onBack={back} showToast={() => {}} />);
    fireEvent.click(await screen.findByText('Zurück zur Liste'));
    expect(back).toHaveBeenCalled();
  });
});
