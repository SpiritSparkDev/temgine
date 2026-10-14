/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopProductEditor from '../components/ShopProductEditor';

const product = {
  id: 'p1', slug: 'buch', title: 'Buch', category: '', subtitle: '', shortText: '', description: '', images: [],
  active: true, sortOrder: 0, updatedAt: '2026-01-01T00:00:00.000Z', related: [], translations: {},
  formats: [{ id: 'f1', sku: 'B-HC', label: 'Hardcover', priceCents: 2490, taxRateBp: 700, weightG: 800, stock: null, digital: false, priceTiers: [], bundleItems: [], sortOrder: 0 }],
};
const other = { id: 'p2', slug: 'andere', title: 'Anderes', formats: [{ id: 'g1', sku: 'A-1', label: 'Std', bundleItems: [] }, { id: 'g2', sku: 'A-BUN', label: 'Set', bundleItems: [{ sku: 'A-1', qty: 1 }] }] };
const res = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const putCall = () => global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT');
const routed = () => jest.fn((url, o) => {
  if (o?.method === 'PUT') return res(200, { product });
  if (url === '/api/shop/products') return res(200, { products: [product, other] });
  return res(200, {});
});

describe('ShopProductEditor round 2', () => {
  it('edits price tiers and sends them in cents', async () => {
    global.fetch = routed();
    render(<ShopProductEditor product={product} showToast={() => {}} />);
    fireEvent.click(screen.getByText('Staffel hinzufügen'));
    const [qty, price] = screen.getByRole('group', { name: 'Staffel 1 von Format 1' }).querySelectorAll('input');
    fireEvent.change(qty, { target: { value: '5' } });
    fireEvent.change(price, { target: { value: '20' } });
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(putCall()).toBeTruthy());
    expect(JSON.parse(putCall()[1].body).formats[0].priceTiers).toEqual([{ minQty: 5, priceCents: 2000 }]);
  });

  it('shows tier validation errors and does not send', () => {
    global.fetch = routed();
    render(<ShopProductEditor product={product} showToast={() => {}} />);
    fireEvent.click(screen.getByText('Staffel hinzufügen'));
    const [qty, price] = screen.getByRole('group', { name: 'Staffel 1 von Format 1' }).querySelectorAll('input');
    fireEvent.change(qty, { target: { value: '3' } });
    fireEvent.change(price, { target: { value: '30' } });
    fireEvent.click(screen.getByText('Speichern'));
    expect(screen.getByText(/Staffelpreis muss kleiner als der Basispreis sein/)).toBeTruthy();
    expect(putCall()).toBeUndefined();
  });

  it('builds a bundle from the catalog, hides stock and weight, sends null for them', async () => {
    global.fetch = routed();
    render(<ShopProductEditor product={product} showToast={() => {}} />);
    fireEvent.click(screen.getByLabelText('Bündel'));
    expect(screen.queryByText(/Gewicht \(g\)/)).toBeNull();
    expect(screen.queryByText(/Bestand \(leer/)).toBeNull();
    await waitFor(() => expect(screen.getByRole('option', { name: /A-1 – Anderes/ })).toBeTruthy());
    expect(screen.queryByRole('option', { name: /A-BUN/ })).toBeNull();
    const g = screen.getByRole('group', { name: 'Bestandteil 1 von Format 1' });
    fireEvent.change(g.querySelector('select'), { target: { value: 'A-1' } });
    fireEvent.change(g.querySelector('input'), { target: { value: '3' } });
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(putCall()).toBeTruthy());
    expect(JSON.parse(putCall()[1].body).formats[0]).toMatchObject({ bundleItems: [{ sku: 'A-1', qty: 3 }], stock: null, weightG: null });
  });

  it('selects related products and sends their slugs; the product itself is not offered', async () => {
    global.fetch = routed();
    render(<ShopProductEditor product={product} showToast={() => {}} />);
    const box = await screen.findByLabelText('Anderes');
    expect(screen.queryByLabelText('Buch')).toBeNull();
    fireEvent.click(box);
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(putCall()).toBeTruthy());
    expect(JSON.parse(putCall()[1].body).related).toEqual(['andere']);
  });

  it('sends the English translation only when filled', async () => {
    global.fetch = routed();
    render(<ShopProductEditor product={product} showToast={() => {}} />);
    fireEvent.change(screen.getByLabelText('Titel (EN)'), { target: { value: 'Book' } });
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(putCall()).toBeTruthy());
    expect(JSON.parse(putCall()[1].body).translations).toEqual({ en: { title: 'Book' } });
  });

  it('asks to save first for digital formats without id', () => {
    global.fetch = routed();
    render(<ShopProductEditor product={null} showToast={() => {}} />);
    fireEvent.click(screen.getByLabelText('Digital'));
    expect(screen.getByText(/erst speichern, dann hochladen/)).toBeTruthy();
  });

  it('lists, uploads and deletes download files of a saved digital format', async () => {
    const digital = { ...product, formats: [{ ...product.formats[0], id: 'f9', digital: true, weightG: null }] };
    global.confirm = jest.fn(() => true);
    global.fetch = jest.fn((url, o) => {
      if (url === '/api/shop/formats/f9/files' && !o) return res(200, { files: [{ id: 'x1', filename: 'buch.pdf', sizeBytes: 2048 }] });
      if (url === '/api/shop/formats/f9/files' && o?.method === 'POST') return res(201, { file: { id: 'x2', filename: 'neu.pdf', sizeBytes: 1048576 } });
      if (url === '/api/shop/formats/f9/files/x1' && o?.method === 'DELETE') return res(200, { ok: true });
      return res(200, { products: [] });
    });
    render(<ShopProductEditor product={digital} showToast={() => {}} />);
    expect(await screen.findByText(/buch\.pdf \(2 KB\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Download-Datei hochladen/), { target: { files: [new File(['abc'], 'neu.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(/neu\.pdf \(1,0 MB\)/)).toBeTruthy();
    const post = global.fetch.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(post[1].body instanceof FormData).toBe(true);
    fireEvent.click(screen.getByLabelText('Datei buch.pdf löschen'));
    await waitFor(() => expect(screen.queryByText(/buch\.pdf/)).toBeNull());
    expect(global.fetch.mock.calls.some(([u, o]) => u === '/api/shop/formats/f9/files/x1' && o?.method === 'DELETE')).toBe(true);
  });
});
