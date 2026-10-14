/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopShippingView from '../components/ShopShippingView';

const cfg = {
  countries: { DE: 'Deutschland', AT: 'Österreich' },
  zones: [
    { id: 'DE', name: 'Deutschland', countries: ['DE'], taxRateBp: null, tiers: [{ maxG: 500, priceCents: 490 }] },
    { id: 'EU', name: 'EU', countries: [], taxRateBp: 1900, tiers: [] },
  ],
  freeShippingFromCents: null,
};
const res = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const putCall = () => global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT');

describe('ShopShippingView', () => {
  it('loads, edits a tier and sends the exact payload in cents', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((url, o) => (o?.method === 'PUT' ? res(200, { shipping: cfg }) : res(200, { shipping: cfg })));
    render(<ShopShippingView showToast={toast} />);
    await screen.findByDisplayValue('4,90');
    fireEvent.change(screen.getByLabelText('Zone 1 Stufe 1 Preis'), { target: { value: '5,5' } });
    fireEvent.change(screen.getByLabelText('MwSt.-Satz Zone 1'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/Versandkostenfrei ab/), { target: { value: '50' } });
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Versandkonfiguration gespeichert'));
    const [url, opts] = putCall();
    expect(url).toBe('/api/shop/shipping');
    expect(JSON.parse(opts.body)).toEqual({
      countries: cfg.countries,
      freeShippingFromCents: 5000,
      zones: [
        { id: 'DE', name: 'Deutschland', countries: ['DE'], taxRateBp: 700, tiers: [{ maxG: 500, priceCents: 550 }] },
        { id: 'EU', name: 'EU', countries: [], taxRateBp: 1900, tiers: [] },
      ],
    });
  });

  it('shows 422 errors as a list', async () => {
    global.fetch = jest.fn((url, o) => (o?.method === 'PUT'
      ? res(422, { code: 'VALIDATION_ERROR', error: 'x', details: { errors: ['Fehler A', 'Fehler B'] } })
      : res(200, { shipping: cfg })));
    render(<ShopShippingView showToast={() => {}} />);
    await screen.findByDisplayValue('4,90');
    fireEvent.click(screen.getByText('Speichern'));
    await screen.findByText('Fehler A');
    expect(screen.getByText('Fehler B')).toBeTruthy();
  });

  it('prevents a country from being assigned to two zones', async () => {
    global.fetch = jest.fn(() => res(200, { shipping: cfg }));
    render(<ShopShippingView showToast={() => {}} />);
    await screen.findByDisplayValue('4,90');
    expect(screen.getByLabelText('Zone 2: DE').disabled).toBe(true);
    expect(screen.getByLabelText('Zone 2: AT').disabled).toBe(false);
  });

  it('adds and removes countries, zones and tiers', async () => {
    global.fetch = jest.fn(() => res(200, { shipping: cfg }));
    render(<ShopShippingView showToast={() => {}} />);
    await screen.findByDisplayValue('4,90');
    fireEvent.change(screen.getByLabelText('Ländercode'), { target: { value: 'ch' } });
    fireEvent.change(screen.getByLabelText('Ländername'), { target: { value: 'Schweiz' } });
    fireEvent.click(screen.getByText('Land hinzufügen'));
    fireEvent.click(screen.getByLabelText('Zone 2: CH'));
    fireEvent.click(screen.getByLabelText('Land AT entfernen'));
    fireEvent.click(screen.getAllByText('Stufe hinzufügen')[1]);
    fireEvent.change(screen.getByLabelText('Zone 2 Stufe 1 bis Gramm'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Zone 2 Stufe 1 Preis'), { target: { value: '12' } });
    fireEvent.click(screen.getAllByText('Zone entfernen')[0]);
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(putCall()).toBeTruthy());
    expect(JSON.parse(putCall()[1].body)).toEqual({
      countries: { DE: 'Deutschland', CH: 'Schweiz' },
      freeShippingFromCents: null,
      zones: [{ id: 'EU', name: 'EU', countries: ['CH'], taxRateBp: 1900, tiers: [{ maxG: 1000, priceCents: 1200 }] }],
    });
  });

  it('shows an error state when loading fails', async () => {
    global.fetch = jest.fn(() => res(500, { error: 'Kaputt' }));
    render(<ShopShippingView showToast={() => {}} />);
    await screen.findByText('Kaputt');
  });
});
