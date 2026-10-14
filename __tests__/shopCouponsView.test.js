/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopCouponsView from '../components/ShopCouponsView';

const c1 = {
  id: 'c1', code: 'SOMMER10', type: 'PERCENT', value: 1000, minOrderCents: 2000, maxUses: 50, usedCount: 3,
  validFrom: null, validUntil: '2026-08-31T23:59:59.999Z', active: true, note: null,
};
const res = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const call = (method) => global.fetch.mock.calls.find(([, o]) => o?.method === method);

describe('ShopCouponsView', () => {
  it('lists coupons readably', async () => {
    global.fetch = jest.fn(() => res(200, { coupons: [c1] }));
    render(<ShopCouponsView showToast={() => {}} />);
    await screen.findByText('SOMMER10');
    expect(screen.getByText('10 %')).toBeTruthy();
    expect(screen.getByText('20,00 €')).toBeTruthy();
    expect(screen.getByText('3/50')).toBeTruthy();
    expect(screen.getByText('bis 31.08.2026')).toBeTruthy();
  });

  it('creates a coupon with converted values', async () => {
    const toast = jest.fn();
    global.fetch = jest.fn((url, o) => (o?.method === 'POST' ? res(201, { coupon: c1 }) : res(200, { coupons: [] })));
    render(<ShopCouponsView showToast={toast} />);
    fireEvent.click(await screen.findByText('Neuer Gutschein'));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'neu5' } });
    fireEvent.change(screen.getByLabelText('Art'), { target: { value: 'FIXED' } });
    fireEvent.change(screen.getByLabelText('Rabatt (€)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Gültig ab/), { target: { value: '2026-06-01' } });
    fireEvent.click(screen.getByText('Speichern'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Gutschein angelegt'));
    const [url, o] = call('POST');
    expect(url).toBe('/api/shop/coupons');
    expect(JSON.parse(o.body)).toMatchObject({ code: 'NEU5', type: 'FIXED', value: 500, validFrom: '2026-06-01T00:00:00.000Z', active: true });
  });

  it('edits without changing the code and shows API errors', async () => {
    global.fetch = jest.fn((url, o) => (o?.method === 'PUT' ? res(422, { details: { errors: ['Serverfehler A'] } }) : res(200, { coupons: [c1] })));
    render(<ShopCouponsView showToast={() => {}} />);
    fireEvent.click(await screen.findByText('SOMMER10'));
    expect(screen.getByLabelText('Code').disabled).toBe(true);
    fireEvent.click(screen.getByText('Speichern'));
    await screen.findByText('Serverfehler A');
    const [url, o] = call('PUT');
    expect(url).toBe('/api/shop/coupons/c1');
    expect(JSON.parse(o.body).code).toBeUndefined();
  });

  it('toggles active instead of deleting', async () => {
    global.fetch = jest.fn((url, o) => (o?.method === 'PUT' ? res(200, { coupon: { ...c1, active: false } }) : res(200, { coupons: [c1] })));
    render(<ShopCouponsView showToast={() => {}} />);
    const box = await screen.findByLabelText('SOMMER10 aktiv');
    fireEvent.click(box);
    await waitFor(() => expect(screen.getByLabelText('SOMMER10 aktiv').checked).toBe(false));
    expect(JSON.parse(call('PUT')[1].body)).toEqual({ active: false });
  });

  it('shows the API message without permission', async () => {
    global.fetch = jest.fn(() => res(403, { error: 'Keine Berechtigung' }));
    render(<ShopCouponsView showToast={() => {}} />);
    await screen.findByText('Keine Berechtigung');
  });
});
