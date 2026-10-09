/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopSettingsPanel from '../components/ShopSettingsPanel';

const status = (enabled) => ({
  enabled,
  providers: {
    sumup: { label: 'SumUp', enabled: true, configured: true },
    stripe: { label: 'Stripe', enabled: false, configured: true },
    paypal: { label: 'PayPal', enabled: false, configured: false },
  },
});

const ok = (body) => Promise.resolve({ ok: true, json: async () => body });

describe('ShopSettingsPanel', () => {
  it('shows the add-on switch and hides the providers while the add-on is off', async () => {
    global.fetch = jest.fn(() => ok(status(false)));
    render(<ShopSettingsPanel showToast={() => {}} />);
    await waitFor(() => expect(screen.getByRole('checkbox').disabled).toBe(false));
    expect(screen.getByRole('checkbox').checked).toBe(false);
    expect(screen.queryByText('SumUp')).toBeNull();
  });

  it('lists SumUp, Stripe and PayPal with their state when the add-on is on', async () => {
    global.fetch = jest.fn(() => ok(status(true)));
    render(<ShopSettingsPanel showToast={() => {}} />);
    await waitFor(() => expect(screen.getByText('SumUp')).toBeTruthy());
    expect(screen.getByText('aktiv')).toBeTruthy();
    expect(screen.getByText('bereit, nicht aktiviert')).toBeTruthy();
    expect(screen.getByText('nicht konfiguriert')).toBeTruthy();
  });

  it('switches the add-on on via PUT and shows the returned status', async () => {
    global.fetch = jest.fn((url, opts) => ok(opts?.method === 'PUT' ? status(true) : status(false)));
    render(<ShopSettingsPanel showToast={() => {}} />);
    await waitFor(() => expect(screen.getByRole('checkbox').disabled).toBe(false));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByText('Stripe')).toBeTruthy());
    const put = global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(put[0]).toBe('/api/shop/settings');
    expect(JSON.parse(put[1].body)).toEqual({ enabled: true });
  });

  it('shows the server error as a toast when saving fails', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((url, opts) => (opts?.method === 'PUT'
      ? Promise.resolve({ ok: false, json: async () => ({ error: 'Zugriff verweigert' }) })
      : ok(status(false))));
    render(<ShopSettingsPanel showToast={toast} />);
    await waitFor(() => expect(screen.getByRole('checkbox').disabled).toBe(false));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Zugriff verweigert', 'error'));
  });
});
