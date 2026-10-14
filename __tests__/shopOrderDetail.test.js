/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ShopOrderDetail from '../components/ShopOrderDetail';

const order = (status, extra = {}) => ({
  id: 'o1', reference: 'ORD-2026-000001', status, email: 'kunde@x.de', currency: 'EUR',
  subtotalCents: 4980, discountCents: 0, shippingCents: 495, shippingTaxBp: null, totalCents: 5475, refundedCents: 0, taxBreakdown: { 700: 326 },
  billing: { name: 'Max <i>Muster</i>', street: 'Weg 1', zip: '12345', city: 'Stadt', country: 'DE' },
  shipping: { name: 'Erika Muster', street: 'Pfad 2', zip: '54321', city: 'Ort', country: 'AT' },
  items: [{ sku: 'DS-HC', title: 'Dark Space', label: 'Hardcover', qty: 2, unitCents: 2490, taxRateBp: 700 }],
  payments: [{ provider: 'sumup', status: 'PAID', amountCents: 5475 }],
  events: [], tracking: { carrier: null, number: null, url: null }, refunds: [], invoice: null, downloads: [], coupon: null, returns: [],
  createdAt: '2026-03-05T10:20:00Z', paidAt: '2026-03-05T10:25:00Z', shippedAt: null,
  ...extra,
});
const res = (status, body) => Promise.resolve({ ok: status < 400, status, json: async () => body });
const SESSION = (role) => ({ user: { role } });
// Router: Session -> Rolle, GET Bestellung -> order(), sonst handler(url, opts)
const mock = (getOrder, { role = 'ADMIN', other = () => res(200, { ok: true }) } = {}) => {
  global.fetch = jest.fn((u, o) => {
    if (u === '/api/auth/session') return res(200, SESSION(role));
    if (u === '/api/shop/orders/o1' && !o) return res(200, { order: getOrder() });
    return other(u, o);
  });
};
const calls = (method) => global.fetch.mock.calls.filter(([, o]) => o?.method === method);
const mount = (props = {}) => render(<ShopOrderDetail id="o1" onBack={() => {}} showToast={() => {}} {...props} />);

describe('ShopOrderDetail', () => {
  it('shows items, totals, tax, addresses, contact and payments', async () => {
    mock(() => order('PAID'));
    mount();
    await screen.findByText('Bestellung ORD-2026-000001');
    expect(screen.getByText('Dark Space – Hardcover (DS-HC)')).toBeTruthy();
    expect(screen.getByText(/enthaltene MwSt\. 7 %/)).toBeTruthy();
    expect(screen.getByText('Max <i>Muster</i>')).toBeTruthy();
    expect(screen.getByText('Erika Muster')).toBeTruthy();
    expect(screen.getByText('kunde@x.de')).toBeTruthy();
    expect(screen.getByText(/sumup – Bezahlt/)).toBeTruthy();
  });

  it('offers shipping only for PAID', async () => {
    mock(() => order('SHIPPED'));
    mount();
    await screen.findByText('Bestellung ORD-2026-000001');
    expect(screen.queryByText('Als versendet markieren')).toBeNull();
  });

  it('confirms, ships with tracking fields and reloads', async () => {
    let status = 'PAID';
    mock(() => order(status), { other: (u, o) => { status = 'SHIPPED'; return res(200, { ok: true }); } });
    mount();
    fireEvent.change(await screen.findByLabelText('Sendungsnummer'), { target: { value: ' 123 456 ' } });
    fireEvent.click(screen.getByText('Als versendet markieren'));
    expect(calls('POST')).toHaveLength(0);
    fireEvent.click(screen.getByText('Bestätigen'));
    await screen.findByText('Versendet');
    const [url, opts] = calls('POST')[0];
    expect(url).toBe('/api/shop/orders/o1/ship');
    expect(JSON.parse(opts.body)).toEqual({ trackingNumber: '123 456' });
    expect(screen.queryByText('Als versendet markieren')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns on mailError and toasts on failure', async () => {
    mock(() => order('PAID'), { other: () => res(200, { mailError: true }) });
    const { unmount } = mount();
    fireEvent.click(await screen.findByText('Als versendet markieren'));
    fireEvent.click(screen.getByText('Bestätigen'));
    await screen.findByRole('alert');
    unmount();

    const toast = jest.fn();
    mock(() => order('PAID'), { other: () => res(409, { error: 'Nicht bezahlt' }) });
    mount({ showToast: toast });
    fireEvent.click(await screen.findByText('Als versendet markieren'));
    fireEvent.click(screen.getByText('Bestätigen'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Nicht bezahlt', 'error'));
  });

  it('calls onBack', async () => {
    const back = jest.fn();
    mock(() => order('PAID'));
    mount({ onBack: back });
    fireEvent.click(await screen.findByText('Zurück zur Liste'));
    expect(back).toHaveBeenCalled();
  });
});

describe('ShopOrderDetail round 2', () => {
  it('shows coupon discount, shipping tax, refunded amount and events newest first', async () => {
    mock(() => order('REFUNDED', {
      discountCents: 500, coupon: { code: 'SOMMER', discountCents: 500 }, shippingTaxBp: 1900, refundedCents: 1000,
      events: [
        { id: 'e1', type: 'CREATED', message: 'Angelegt', createdAt: '2026-03-05T10:00:00Z' },
        { id: 'e2', type: 'NOTE', message: 'Anruf <b>Kunde</b>', createdAt: '2026-03-06T10:00:00Z' },
      ],
    }));
    mount();
    await screen.findByText(/Rabatt \(Gutschein SOMMER\)/);
    expect(screen.getByText(/enthält 19 % MwSt\./)).toBeTruthy();
    expect(screen.getByText(/Erstattet: /)).toBeTruthy();
    const items = screen.getAllByRole('listitem').filter((li) => /Notiz|Angelegt/.test(li.textContent) && li.querySelector('strong'));
    expect(items[0].textContent).toMatch(/Notiz/);
    expect(items[1].textContent).toMatch(/Angelegt/);
    expect(screen.getByText(/Anruf <b>Kunde<\/b>/)).toBeTruthy();
  });

  it('adds an internal note', async () => {
    mock(() => order('PAID'));
    mount();
    const btn = await screen.findByText('Notiz hinzufügen');
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Interne Notiz'), { target: { value: ' Hallo ' } });
    fireEvent.click(btn);
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    const [url, opts] = calls('POST')[0];
    expect(url).toBe('/api/shop/orders/o1/notes');
    expect(JSON.parse(opts.body)).toEqual({ message: 'Hallo' });
  });

  it('saves tracking data with PUT', async () => {
    mock(() => order('SHIPPED', { tracking: { carrier: 'DHL', number: 'A1', url: 'https://t.de/A1' } }));
    mount();
    await screen.findByDisplayValue('DHL');
    fireEvent.change(screen.getByLabelText('Sendungsnummer'), { target: { value: 'B2' } });
    fireEvent.click(screen.getByText('Sendungsdaten speichern'));
    await waitFor(() => expect(calls('PUT')).toHaveLength(1));
    expect(JSON.parse(calls('PUT')[0][1].body)).toEqual({ carrier: 'DHL', trackingNumber: 'B2', trackingUrl: 'https://t.de/A1' });
  });

  it('refunds partially after confirmation; limit and errors are shown', async () => {
    mock(() => order('PAID', { refundedCents: 1000 }), { other: () => res(200, { ok: true }) });
    mount();
    const amount = await screen.findByLabelText(/Betrag/);
    expect(amount.value).toBe('44,75');
    expect(screen.getByText(/Noch erstattbar: /)).toBeTruthy();
    fireEvent.change(amount, { target: { value: '99' } });
    fireEvent.click(screen.getByText('Erstatten …'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/höchstens/);
    expect(calls('POST')).toHaveLength(0);

    fireEvent.change(amount, { target: { value: '10,50' } });
    fireEvent.change(screen.getByLabelText(/Grund/), { target: { value: 'Defekt' } });
    fireEvent.click(screen.getByLabelText(/Bestand zurückbuchen/));
    fireEvent.click(screen.getByText('Erstatten …'));
    expect(calls('POST')).toHaveLength(0);
    fireEvent.click(screen.getByText('Bestätigen'));
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    const [url, opts] = calls('POST')[0];
    expect(url).toBe('/api/shop/orders/o1/refund');
    expect(JSON.parse(opts.body)).toEqual({ amountCents: 1050, reason: 'Defekt', restock: true, notifyCustomer: true });
  });

  it('shows the API error when the refund fails', async () => {
    const toast = jest.fn();
    mock(() => order('PAID'), { other: () => res(502, { error: 'Anbieter nicht erreichbar' }) });
    mount({ showToast: toast });
    fireEvent.click(await screen.findByText('Erstatten …'));
    fireEvent.click(screen.getByText('Bestätigen'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Anbieter nicht erreichbar', 'error'));
    expect((await screen.findByRole('alert')).textContent).toBe('Anbieter nicht erreichbar');
  });

  it('hides refund for MODERATOR and for wrong status; hides editing for other roles', async () => {
    mock(() => order('PAID'), { role: 'MODERATOR' });
    const a = mount();
    await screen.findByText('Als versendet markieren');
    expect(screen.queryByText('Erstatten …')).toBeNull();
    a.unmount();

    mock(() => order('PENDING'), { role: 'ADMIN' });
    const b = mount();
    await screen.findByText('Bestellung stornieren');
    expect(screen.queryByText('Erstatten …')).toBeNull();
    b.unmount();

    mock(() => order('PAID'), { role: 'EDITOR' });
    mount();
    await screen.findByText('Bestellung ORD-2026-000001');
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/auth/session'));
    expect(screen.queryByText('Notiz hinzufügen')).toBeNull();
  });

  it('cancels only PENDING orders after confirmation', async () => {
    mock(() => order('PENDING'));
    mount();
    fireEvent.click(await screen.findByText('Bestellung stornieren'));
    expect(calls('POST')).toHaveLength(0);
    fireEvent.click(screen.getByText('Bestätigen'));
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    expect(calls('POST')[0][0]).toBe('/api/shop/orders/o1/cancel');
  });

  it('links the invoice in a new tab for paid orders only', async () => {
    mock(() => order('PAID', { invoice: { number: 'RE-2026-000001' } }));
    const a = mount();
    const link = await screen.findByText(/Rechnung öffnen/);
    expect(link.getAttribute('href')).toBe('/api/shop/orders/o1/invoice');
    expect(link.getAttribute('target')).toBe('_blank');
    a.unmount();
    mock(() => order('PENDING'));
    mount();
    await screen.findByText('Bestellung stornieren');
    expect(screen.queryByText(/Rechnung öffnen/)).toBeNull();
  });

  it('lists downloads and resets / resends them', async () => {
    mock(() => order('PAID', { downloads: [{ filename: 'regeln.pdf', downloads: 2, maxDownloads: 5, expiresAt: '2026-04-05T10:00:00Z' }], returns: [{ id: 'r1' }, { id: 'r2' }] }));
    mount();
    await screen.findByText(/regeln\.pdf – 2 von 5 Abrufen/);
    expect(screen.getByText(/2 Rückgabe-Anfragen/)).toBeTruthy();
    fireEvent.click(screen.getByText('Zurücksetzen'));
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    expect(JSON.parse(calls('POST')[0][1].body)).toEqual({ action: 'reset' });
    fireEvent.click(screen.getByText('Erneut senden'));
    await waitFor(() => expect(calls('POST')).toHaveLength(2));
    expect(calls('POST')[1][0]).toBe('/api/shop/orders/o1/downloads');
    expect(JSON.parse(calls('POST')[1][1].body)).toEqual({ action: 'resend' });
  });
});

describe('ShopOrderDetail layout', () => {
  it('wraps the items table in a scroll container', async () => {
    mock(() => order('PAID'));
    const { container } = mount();
    await screen.findByText('Bestellung ORD-2026-000001');
    expect(container.querySelector('table').parentElement.style.overflowX).toBe('auto');
  });
});
