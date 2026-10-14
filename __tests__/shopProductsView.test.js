/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopAdminView from '../components/ShopAdminView';
import ShopProductsView from '../components/ShopProductsView';

const mk = (id, over = {}) => ({
  id, slug: `p${id}`, title: `Produkt ${id}`, category: 'Spiele', subtitle: '', shortText: '', description: '', images: [], active: true, sortOrder: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
  formats: [
    { id: id * 10, sku: `S${id}`, label: 'Hardcover', priceCents: 2490, taxRateBp: 700, weightG: 800, stock: 5, digital: false, sortOrder: 0 },
    { id: id * 10 + 1, sku: `D${id}`, label: 'PDF', priceCents: null, taxRateBp: null, weightG: null, stock: null, digital: true, sortOrder: 1 },
  ],
  ...over,
});
const res = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });

describe('ShopProductsView', () => {
  it('lists products with category, prices, stock and active state', async () => {
    global.fetch = jest.fn(() => res(200, { products: [mk(1), mk(2, { active: false })] }));
    render(<ShopProductsView showToast={() => {}} />);
    await waitFor(() => expect(screen.getByText('Produkt 1')).toBeTruthy());
    expect(screen.getAllByText('Spiele')).toHaveLength(2);
    expect(screen.getAllByText(/Hardcover: 24,90 €, PDF: –/)).toHaveLength(2);
    expect(screen.getAllByText(/Hardcover: 5, PDF: digital/)).toHaveLength(2);
    expect(screen.getByLabelText('Produkt 1 aktiv').checked).toBe(true);
    expect(screen.getByLabelText('Produkt 2 aktiv').checked).toBe(false);
  });

  it('toggles active via PUT with the full product', async () => {
    global.fetch = jest.fn((url, o) => (o?.method === 'PUT'
      ? res(200, { product: mk(1, { active: false }) })
      : res(200, { products: [mk(1)] })));
    render(<ShopProductsView showToast={() => {}} />);
    await waitFor(() => expect(screen.getByText('Produkt 1')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Produkt 1 aktiv'));
    await waitFor(() => expect(screen.getByLabelText('Produkt 1 aktiv').checked).toBe(false));
    const [url, o] = global.fetch.mock.calls.find(([, x]) => x?.method === 'PUT');
    expect(url).toBe('/api/shop/products/1');
    const body = JSON.parse(o.body);
    expect(body).toMatchObject({ id: 1, active: false, updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(body.formats).toHaveLength(2);
  });

  it('toasts on conflict while toggling', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((url, o) => (o?.method === 'PUT' ? res(409, { code: 'CONFLICT' }) : res(200, { products: [mk(1)] })));
    render(<ShopProductsView showToast={toast} />);
    await waitFor(() => expect(screen.getByText('Produkt 1')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Produkt 1 aktiv'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Inzwischen geändert, bitte neu laden', 'error'));
  });

  it('opens the editor for a new product', async () => {
    global.fetch = jest.fn(() => res(200, { products: [] }));
    render(<ShopProductsView showToast={() => {}} />);
    await waitFor(() => expect(screen.getByText('Noch keine Produkte.')).toBeTruthy());
    fireEvent.click(screen.getByText('Neues Produkt'));
    expect(screen.getByText('Speichern')).toBeTruthy();
  });
});

describe('ShopAdminView', () => {
  it('shows products and disabled placeholder tabs', async () => {
    global.fetch = jest.fn(() => res(200, { products: [] }));
    render(<ShopAdminView showToast={() => {}} />);
    expect(screen.getByText('Bestellungen (folgt)').closest('button').disabled).toBe(true);
    expect(screen.getByText('Versand & Steuer (folgt)').closest('button').disabled).toBe(true);
    await waitFor(() => expect(screen.getByText('Noch keine Produkte.')).toBeTruthy());
  });
});
