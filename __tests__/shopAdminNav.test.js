/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopAdminView from '../components/ShopAdminView';
import ShopReturnsView from '../components/ShopReturnsView';

const res = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body });
const order = { id: 'o1', reference: 'ORD-1', status: 'PAID', email: 'a@b.de', totalCents: 1000, createdAt: '2026-03-05T10:00:00Z' };
const ret = { id: 'r1', status: 'NEW', email: 'a@b.de', reason: 'x', createdAt: '2026-03-01T10:00:00Z', items: [], order: { reference: 'ORD-1' } };

const api = (u) => {
  if (u.startsWith('/api/auth/session')) return res({ user: { role: 'ADMIN' } });
  if (u.startsWith('/api/shop/returns/')) return res({ return: ret });
  if (u.startsWith('/api/shop/returns')) return res({ returns: [{ id: 'r1', reference: 'ORD-1', email: 'a@b.de', status: 'NEW', createdAt: ret.createdAt }], total: 1, page: 1, pages: 1 });
  if (u.startsWith('/api/shop/orders/o1')) return res({ order: { ...order, items: [], events: [], payments: [] } });
  if (u.startsWith('/api/shop/orders')) return res({ orders: [order], total: 1, page: 1, pages: 1 });
  return res({});
};

describe('ShopAdminView navigation', () => {
  it('jumps from a return to the order and opens its detail', async () => {
    global.fetch = jest.fn(api);
    render(<ShopAdminView showToast={() => {}} role="ADMIN" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Rückgaben' }));
    fireEvent.click(await screen.findByText('ORD-1'));
    fireEvent.click(await screen.findByRole('button', { name: 'ORD-1' }));
    await waitFor(() => expect(global.fetch.mock.calls.map(([u]) => u)).toContain('/api/shop/orders?q=ORD-1&page=1'));
    await screen.findByText('Bestellung ORD-1');
  });

  it('reads the role from the session when no prop is given', async () => {
    global.fetch = jest.fn(api);
    render(<ShopAdminView showToast={() => {}} />);
    await waitFor(() => expect(global.fetch.mock.calls.map(([u]) => u)).toContain('/api/auth/session'));
  });

  it('keeps the order number as plain text without onOpenOrder', async () => {
    global.fetch = jest.fn(api);
    render(<ShopReturnsView showToast={() => {}} />);
    fireEvent.click(await screen.findByText('ORD-1'));
    await screen.findByText(/Rückgabe zu Bestellung/);
    expect(screen.queryByRole('button', { name: 'ORD-1' })).toBeNull();
  });
});
