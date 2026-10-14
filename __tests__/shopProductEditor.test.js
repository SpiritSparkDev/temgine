/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopProductEditor from '../components/ShopProductEditor';

const product = {
  id: 7, slug: 'buch', title: 'Buch', category: 'Spiele', subtitle: '', shortText: '', description: '', images: ['/uploads/shop/a.jpg', '/uploads/shop/b.jpg'],
  active: true, sortOrder: 0, updatedAt: '2026-01-01T00:00:00.000Z',
  formats: [{ id: 3, sku: 'B-HC', label: 'Hardcover', priceCents: 2490, taxRateBp: 700, weightG: 800, stock: null, digital: false, sortOrder: 0 }],
};
const res = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const putCall = () => global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT');

describe('ShopProductEditor', () => {
  it('prefills euro/percent values and keeps the slug read-only for existing products', () => {
    global.fetch = jest.fn();
    render(<ShopProductEditor product={product} showToast={() => {}} />);
    expect(screen.getByDisplayValue('24,90')).toBeTruthy();
    expect(screen.getByDisplayValue('7')).toBeTruthy();
    expect(screen.getByDisplayValue('buch').readOnly).toBe(true);
  });

  it('sends the contract payload via PUT and toasts on success', async () => {
    const toast = jest.fn();
    const onSaved = jest.fn();
    global.fetch = jest.fn(() => res(200, { product: { ...product, title: 'Neu' } }));
    render(<ShopProductEditor product={product} showToast={toast} onSaved={onSaved} />);
    fireEvent.change(screen.getByDisplayValue('Buch'), { target: { value: 'Neu' } });
    fireEvent.change(screen.getByDisplayValue('24,90'), { target: { value: '19,5' } });
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Produkt gespeichert'));
    const [url, opts] = putCall();
    expect(url).toBe('/api/shop/products/7');
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({ id: 7, updatedAt: product.updatedAt, title: 'Neu', images: product.images });
    expect(body.formats[0]).toEqual({ id: 3, sku: 'B-HC', label: 'Hardcover', priceCents: 1950, taxRateBp: 700, weightG: 800, stock: null, digital: false, sortOrder: 0 });
    expect(onSaved).toHaveBeenCalled();
  });

  it('POSTs new products', async () => {
    global.fetch = jest.fn(() => res(201, { product }));
    render(<ShopProductEditor product={null} showToast={() => {}} />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Neu' } });
    const g = screen.getByRole('group', { name: 'Format 1' });
    const [sku, label] = g.querySelectorAll('input');
    fireEvent.change(sku, { target: { value: 'N-1' } });
    fireEvent.change(label, { target: { value: 'Std' } });
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/shop/products');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.id).toBeUndefined();
    expect(body.formats[0]).toMatchObject({ sku: 'N-1', priceCents: null, taxRateBp: null });
  });

  it('does not send invalid input and lists the errors', () => {
    global.fetch = jest.fn();
    render(<ShopProductEditor product={null} showToast={() => {}} />);
    fireEvent.click(screen.getByText('Speichern'));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText('Titel ist erforderlich.')).toBeTruthy();
  });

  it('shows server validation errors from 422', async () => {
    global.fetch = jest.fn(() => res(422, { code: 'VALIDATION_ERROR', error: 'x', details: { errors: ['SKU B-HC existiert bereits.', 'Zweiter Fehler'] } }));
    render(<ShopProductEditor product={product} showToast={() => {}} />);
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(screen.getByText('SKU B-HC existiert bereits.')).toBeTruthy());
    expect(screen.getByText('Zweiter Fehler')).toBeTruthy();
  });

  it('shows the conflict hint on 409 CONFLICT and reloads on demand', async () => {
    global.fetch = jest.fn((url, o) => (o?.method === 'PUT' ? res(409, { code: 'CONFLICT', error: 'c' }) : res(200, { product: { ...product, title: 'Fremd' } })));
    render(<ShopProductEditor product={product} showToast={() => {}} />);
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(screen.getByText(/Inzwischen geändert, bitte neu laden/)).toBeTruthy());
    fireEvent.click(screen.getByText('Neu laden'));
    await waitFor(() => expect(screen.getByDisplayValue('Fremd')).toBeTruthy());
  });

  it('hides weight for digital formats and sends null', async () => {
    global.fetch = jest.fn(() => res(200, { product }));
    render(<ShopProductEditor product={product} showToast={() => {}} />);
    expect(screen.getByDisplayValue('800')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Digital'));
    expect(screen.queryByDisplayValue('800')).toBeNull();
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(putCall()).toBeTruthy());
    const body = JSON.parse(putCall()[1].body);
    expect(body.formats[0]).toMatchObject({ digital: true, weightG: null });
  });

  it('reorders and removes images, adds and removes formats', async () => {
    global.fetch = jest.fn(() => res(200, { product }));
    render(<ShopProductEditor product={product} showToast={() => {}} />);
    fireEvent.click(screen.getByLabelText('Bild 2 nach oben'));
    fireEvent.change(screen.getByLabelText('Bildpfad'), { target: { value: '/uploads/shop/c.jpg' } });
    fireEvent.click(screen.getByText('Hinzufügen'));
    fireEvent.click(screen.getByLabelText('Bild 3 entfernen'));
    fireEvent.click(screen.getByText('Format hinzufügen'));
    expect(screen.getAllByText('Format entfernen')).toHaveLength(2);
    fireEvent.click(screen.getAllByText('Format entfernen')[1]);
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(putCall()).toBeTruthy());
    const body = JSON.parse(putCall()[1].body);
    expect(body.images).toEqual(['/uploads/shop/b.jpg', '/uploads/shop/a.jpg']);
    expect(body.formats).toHaveLength(1);
  });
});
