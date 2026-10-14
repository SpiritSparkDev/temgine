/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopSettingsPanel from '../components/ShopSettingsPanel';

const status = (extra = {}) => ({
  enabled: true, notifyEmail: '', orderPrefix: 'ORD', cronTokenSet: false,
  providers: { sumup: { label: 'SumUp', enabled: true, configured: true } },
  settings: {
    shop_seller_name: 'Verlag', shop_seller_address: '', shop_invoice_prefix: 'RE', shop_currency: 'EUR', shop_default_locale: 'de',
    shop_low_stock_threshold: '', shop_reservation_minutes: '30', shop_pending_cleanup_days: '3', shop_download_days: '30', shop_download_max: '5', shop_return_days: '',
  },
  ...extra,
});
const ok = (body) => Promise.resolve({ ok: true, status: 200, json: async () => body });
const putBody = () => JSON.parse(global.fetch.mock.calls.find(([, o]) => o?.method === 'PUT')[1].body);

describe('ShopSettingsPanel round 2', () => {
  it('shows effective values and saves all settings via PUT { settings }', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn(() => ok(status()));
    render(<ShopSettingsPanel showToast={toast} />);
    expect((await screen.findByLabelText('Name / Firma')).value).toBe('Verlag');
    expect(screen.getByLabelText(/^Reservierungsdauer/).value).toBe('30');
    fireEvent.change(screen.getByLabelText('Präfix der Rechnungsnummer'), { target: { value: 'inv' } });
    fireEvent.change(screen.getByLabelText('Währung'), { target: { value: 'CHF' } });
    fireEvent.change(screen.getByLabelText(/^Rückgabefrist/), { target: { value: '14' } });
    fireEvent.click(screen.getByText('Einstellungen speichern'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Einstellungen gespeichert'));
    expect(putBody().settings).toMatchObject({ shop_invoice_prefix: 'INV', shop_currency: 'CHF', shop_return_days: '14', shop_seller_name: 'Verlag' });
  });

  it('lists the server validation errors on 422', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((url, o) => (o?.method === 'PUT'
      ? Promise.resolve({ ok: false, status: 422, json: async () => ({ error: 'Einstellungen ungültig', details: { errors: ['Währung: erlaubt sind EUR'] } }) })
      : ok(status())));
    render(<ShopSettingsPanel showToast={toast} />);
    await screen.findByLabelText('Name / Firma');
    fireEvent.click(screen.getByText('Einstellungen speichern'));
    expect(await screen.findByText('Währung: erlaubt sind EUR')).toBeTruthy();
    expect(toast).toHaveBeenCalledWith('Einstellungen ungültig', 'error');
  });

  it('documents the built-in timer and the external cron call', async () => {
    global.fetch = jest.fn(() => ok(status()));
    render(<ShopSettingsPanel showToast={() => {}} />);
    expect(await screen.findByText(/eingebauten Timer/)).toBeTruthy();
    expect(screen.getByText('POST /api/shop/cron')).toBeTruthy();
    expect(screen.getByText(/nicht gesetzt/)).toBeTruthy();
  });

  it('generates a cron token, shows it once and does not keep it after reload', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((url, o) => ok(o?.method === 'PUT' ? status({ cronTokenSet: true, generatedCronToken: 'abc123tokenvalue' }) : status()));
    render(<ShopSettingsPanel showToast={toast} />);
    fireEvent.click(await screen.findByText('Token erzeugen'));
    expect((await screen.findByLabelText('Neues Zeitplan-Token')).value).toBe('abc123tokenvalue');
    expect(putBody()).toEqual({ cronToken: { action: 'generate' } });
    expect(screen.getByText('gesetzt')).toBeTruthy();
    expect(screen.getByText('Token neu erzeugen')).toBeTruthy();
  });

  it('sets an own token and clears it', async () => {
    global.fetch = jest.fn((url, o) => ok(o?.method === 'PUT' ? status({ cronTokenSet: true }) : status()));
    render(<ShopSettingsPanel showToast={() => {}} />);
    const btn = await screen.findByText('Token setzen');
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Eigenes Token setzen/), { target: { value: 'abcdefghij_klmnop-1234' } });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText('Token entfernen')).toBeTruthy());
    expect(putBody()).toEqual({ cronToken: { action: 'set', value: 'abcdefghij_klmnop-1234' } });
    expect(screen.queryByLabelText('Neues Zeitplan-Token')).toBeNull();
  });
});
