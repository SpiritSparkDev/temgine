/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ShopPaymentsView from '../components/ShopPaymentsView';

const data = {
  providers: {
    sumup: {
      label: 'SumUp', enabled: false, configured: true,
      fields: [
        { key: 'shop_sumup_api_key', label: 'API-Key', secret: true, set: true },
        { key: 'shop_sumup_merchant_code', label: 'Merchant-Code', secret: false, set: true, value: 'MC1' },
      ],
    },
    paypal: {
      label: 'PayPal', enabled: false, configured: false,
      fields: [{ key: 'shop_paypal_mode', label: 'Modus', secret: false, set: false, value: '', options: ['sandbox', 'live'] }],
    },
  },
};
const res = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const call = (m) => global.fetch.mock.calls.find(([, o]) => o?.method === m);

describe('ShopPaymentsView', () => {
  it('renders cards, status, placeholder and webhook url without prefilled secrets', async () => {
    global.fetch = jest.fn(() => res(200, data));
    render(<ShopPaymentsView showToast={() => {}} />);
    await screen.findByLabelText('API-Key');
    expect(screen.getByText('(konfiguriert)')).toBeTruthy();
    expect(screen.getByText('(Zugangsdaten fehlen)')).toBeTruthy();
    const key = screen.getByLabelText('API-Key');
    expect(key.type).toBe('password');
    expect(key.value).toBe('');
    expect(key.placeholder).toBe('gespeichert – leer lassen zum Behalten');
    expect(screen.getByLabelText('Merchant-Code').value).toBe('MC1');
    expect(screen.getByText(`${window.location.origin}/api/shop/webhooks/sumup`)).toBeTruthy();
  });

  it('saves a provider with enabled flag and values', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((u, o) => res(200, data));
    render(<ShopPaymentsView showToast={toast} />);
    await screen.findByLabelText('API-Key');
    const card = within(screen.getByLabelText('SumUp'));
    fireEvent.click(card.getByLabelText('Aktiv'));
    fireEvent.change(card.getByLabelText('Merchant-Code'), { target: { value: 'MC2' } });
    fireEvent.click(card.getByText('Speichern'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('SumUp gespeichert'));
    expect(JSON.parse(call('PUT')[1].body)).toEqual({
      providers: { sumup: { enabled: true, values: { shop_sumup_api_key: '', shop_sumup_merchant_code: 'MC2' } } },
    });
  });

  it('shows the test result and 422 errors', async () => {
    global.fetch = jest.fn((u, o) => {
      if (u.endsWith('/test-connection')) return res(200, { ok: false, error: 'Zugangsdaten abgelehnt' });
      if (o?.method === 'PUT') return res(422, { error: 'x', details: { errors: ['Fehler A'] } });
      return res(200, data);
    });
    render(<ShopPaymentsView showToast={() => {}} />);
    await screen.findByLabelText('API-Key');
    const card = within(screen.getByLabelText('SumUp'));
    fireEvent.click(card.getByText('Verbindung testen'));
    await screen.findByText('Fehler: Zugangsdaten abgelehnt');
    expect(JSON.parse(call('POST')[1].body).provider).toBe('sumup');
    fireEvent.click(card.getByText('Speichern'));
    await screen.findByText('Fehler A');
  });

  it('shows an error state when loading fails', async () => {
    global.fetch = jest.fn(() => res(403, { error: 'Nein' }));
    render(<ShopPaymentsView showToast={() => {}} />);
    await screen.findByText('Nein');
  });
});

describe('ShopPaymentsView error list', () => {
  it('renders duplicate error messages without key collisions', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn((url, o) => (o?.method === 'PUT'
      ? res(422, { details: { errors: ['Fehler', 'Fehler'] } })
      : res(200, data)));
    render(<ShopPaymentsView showToast={() => {}} />);
    await screen.findByLabelText('API-Key');
    fireEvent.click(screen.getAllByText('Speichern')[0]);
    await waitFor(() => expect(screen.getAllByText('Fehler')).toHaveLength(2));
    expect(spy.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false);
    spy.mockRestore();
  });
});
