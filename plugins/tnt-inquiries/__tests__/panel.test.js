/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TntInquiriesPanel from '../TntInquiriesPanel';

const SECRET = 'SUPERSECRET-TOKEN-123';
const cfg = (o = {}) => ({
  baseUrl: 'https://tnt.example.com', tokenSet: true, tokenHint: 'ab12', ready: false,
  readyReasons: ['Datenschutz-Checkbox zuordnen'], alert: null,
  forms: [{ formId: 'f1', label: 'Kontakt', fields: [{ key: 'name', label: 'Name', type: 'text', suggested: 'customer.lastName' }, { key: 'dsgvo', label: 'Datenschutz', type: 'checkbox', suggested: null }], mapping: {}, privacyField: null }],
  targets: [{ path: 'customer.lastName', label: 'Nachname', group: 'Kunde' }],
  ...o,
});
const box = [
  { id: 1, formId: 'f1', status: 'failed', attempts: 8, nextAttemptAt: null, lastStatusCode: 500, createdAt: '2026-01-01T10:00:00Z', deliveredAt: null },
  { id: 2, formId: 'f1', status: 'delivered', attempts: 1, nextAttemptAt: null, lastStatusCode: 201, createdAt: '2026-01-01T10:00:00Z', deliveredAt: null },
];

function setup(c = cfg(), putResp) {
  global.fetch = jest.fn((url, opt) => {
    const json = (d) => Promise.resolve({ ok: true, json: async () => d });
    if (url.includes('/outbox')) return json(box);
    if (opt && opt.method === 'PUT') return json(putResp || c);
    return json(c);
  });
  render(<TntInquiriesPanel showToast={() => {}} />);
  return screen.findByText('Noch nicht bereit');
}

describe('TntInquiriesPanel', () => {
  it('zeigt bei ready=false "Noch nicht bereit" samt Gründen (Schalter liegt im Kern)', async () => {
    await setup();
    expect(screen.queryByRole('checkbox', { name: /Weiterleitung aktiv/ })).toBeNull();
    expect(screen.getByText('Noch nicht bereit')).toBeTruthy();
    expect(screen.getByText('Datenschutz-Checkbox zuordnen')).toBeTruthy();
  });

  it('Option „Mail erst nach TNT-Antwort“: Checkbox, Hinweis mit 5 s, wird mit gespeichert', async () => {
    await setup();
    expect(screen.getByText(/bis zu 5 Sekunden/)).toBeTruthy();
    expect(screen.getByText(/tnt_url/, { selector: 'code' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Mail erst nach TNT-Antwort senden/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(global.fetch.mock.calls.some(([, o]) => o && o.method === 'PUT')).toBe(true));
    const put = global.fetch.mock.calls.find(([, o]) => o && o.method === 'PUT')[1];
    expect(JSON.parse(put.body).mappings.f1.mailAfterDelivery).toBe(true);
  });

  it('lehnt http://-URL clientseitig ab (kein PUT)', async () => {
    await setup();
    fireEvent.change(screen.getByPlaceholderText('https://tnt.example.com'), { target: { value: 'http://x.de' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText(/muss mit https:\/\//)).toBeTruthy();
    expect(global.fetch.mock.calls.some(([, o]) => o && o.method === 'PUT')).toBe(false);
  });

  it('zeigt Token nie im Klartext, auch nicht nach PUT-Antwort', async () => {
    await setup(cfg(), cfg({ tokenHint: 'ab12' }));
    fireEvent.click(screen.getByRole('button', { name: 'Token ändern' }));
    const input = screen.getByLabelText('Neues Token');
    expect(input.type).toBe('password');
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(screen.queryByLabelText('Neues Token')).toBeNull());
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it('Retry-Button nur bei failed; Tabelle ohne Personendaten-Spalten', async () => {
    await setup();
    await screen.findByText('fehlgeschlagen');
    expect(screen.getAllByRole('button', { name: 'Erneut senden' })).toHaveLength(1);
    const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads.join('|')).not.toMatch(/Name|E-Mail|Telefon|Nachricht/);
  });

  it('zeigt Alert-Banner', async () => {
    await setup(cfg({ alert: { code: 401, since: null } }));
    expect(screen.getByRole('alert').textContent).toMatch(/Token oder HTTPS-Konfiguration prüfen/);
  });
});
