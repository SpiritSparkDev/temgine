/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopSettingsPanel from '../components/ShopSettingsPanel';

const status = (enabled) => ({
  enabled, notifyEmail: 'shop@x.de', orderPrefix: 'PF',
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

  it('shows notify email and prefix and saves them via PUT', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((url, opts) => ok(status(true)));
    render(<ShopSettingsPanel showToast={toast} />);
    const email = await screen.findByLabelText(/Benachrichtigungs-E-Mail/);
    expect(email.value).toBe('shop@x.de');
    fireEvent.change(email, { target: { value: 'neu@x.de' } });
    fireEvent.change(screen.getByLabelText('Präfix der Bestellnummer'), { target: { value: 'ab1' } });
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Shop-Einstellungen gespeichert'));
    const put = global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(JSON.parse(put[1].body)).toEqual({ notifyEmail: 'neu@x.de', orderPrefix: 'AB1' });
  });

  it('toasts a 4xx error of the order settings', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((url, opts) => (opts?.method === 'PUT'
      ? Promise.resolve({ ok: false, status: 422, json: async () => ({ error: 'Ungültige E-Mail' }) })
      : ok(status(true))));
    render(<ShopSettingsPanel showToast={toast} />);
    await screen.findByLabelText(/Benachrichtigungs-E-Mail/);
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Ungültige E-Mail', 'error'));
  });

  it('ensures the shop pages via PUT and toasts the created slugs', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((url, opts) => (opts?.method === 'PUT' ? ok({ ...status(true), created: ['kasse', 'bestellung'] }) : ok(status(true))));
    render(<ShopSettingsPanel showToast={toast} />);
    fireEvent.click(await screen.findByText('Shop-Seiten prüfen/anlegen'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Angelegt: kasse, bestellung'));
    const put = global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(JSON.parse(put[1].body)).toEqual({ ensurePages: true });
  });

  it('toasts that all pages exist when nothing was created', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((url, opts) => (opts?.method === 'PUT' ? ok({ ...status(true), created: [] }) : ok(status(true))));
    render(<ShopSettingsPanel showToast={toast} />);
    fireEvent.click(await screen.findByText('Shop-Seiten prüfen/anlegen'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Alle Seiten sind vorhanden'));
  });
});
