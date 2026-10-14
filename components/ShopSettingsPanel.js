import React, { useState, useEffect } from 'react';

const PROVIDER_STATE = (p) => (p.enabled ? (p.configured ? 'aktiv' : 'aktiv, Zugangsdaten fehlen') : (p.configured ? 'bereit, nicht aktiviert' : 'nicht konfiguriert'));

/**
 * Add-on "Online-Shop": Schalter, Überblick über die Zahlungsanbieter (SumUp, Stripe, PayPal)
 * sowie Benachrichtigungs-E-Mail und Präfix der Bestellnummer. Zugangsdaten sind write-only.
 */
export default function ShopSettingsPanel({ showToast }) {
  const [status, setStatus] = useState(null);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [orderPrefix, setOrderPrefix] = useState('');

  const apply = (d) => {
    setStatus(d);
    setNotifyEmail(d.notifyEmail || '');
    setOrderPrefix(d.orderPrefix || '');
  };

  useEffect(() => {
    fetch('/api/shop/settings').then((r) => r.json()).then((d) => { if (!d.error) apply(d); }).catch(() => {});
  }, []);

  const put = async (body, okMsg) => {
    const res = await fetch('/api/shop/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { apply(d); if (okMsg) showToast(okMsg); } else showToast(d.error || 'Fehler beim Speichern', 'error');
  };

  const toggle = (on) => put({ enabled: on });
  const ensurePages = async () => {
    const res = await fetch('/api/shop/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ensurePages: true }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(d.error || 'Fehler beim Anlegen der Seiten', 'error');
    showToast(d.created && d.created.length ? `Angelegt: ${d.created.join(', ')}` : 'Alle Seiten sind vorhanden');
  };
  const saveOrderSettings = () => put({ notifyEmail: notifyEmail.trim(), orderPrefix: orderPrefix.trim() }, 'Shop-Einstellungen gespeichert');

  return (
    <section className="st-card">
      <header className="st-card-head">
        <h3>Online-Shop (Add-on)</h3>
        <p>Produkte, Warenkorb, Kasse und Bestellungen mit Zahlung über SumUp, Stripe oder PayPal. Die Zahlungsanbieter sind getrennt zuschaltbar.</p>
      </header>
      <div className="st-card-body">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <input type="checkbox" checked={!!status?.enabled} disabled={!status} onChange={(e) => toggle(e.target.checked)} />
          <strong>Add-on aktivieren</strong>
        </label>

        {status?.enabled && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6, maxWidth: 560 }}>
            {Object.entries(status.providers).map(([id, p]) => (
              <li key={id} style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 12px' }}>
                <strong>{p.label}</strong>
                <span>{PROVIDER_STATE(p)}</span>
              </li>
            ))}
          </ul>
        )}

        {status?.enabled && (
          <div style={{ display: 'grid', gap: 10, maxWidth: 560, marginTop: 16 }}>
            <label style={{ display: 'grid', gap: 4 }}>
              Benachrichtigungs-E-Mail (neue bezahlte Bestellungen)
              <input type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              Präfix der Bestellnummer
              <input type="text" maxLength={8} value={orderPrefix} onChange={(e) => setOrderPrefix(e.target.value.toUpperCase())} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={saveOrderSettings}>Speichern</button>
              <button className="btn" onClick={ensurePages}>Shop-Seiten prüfen/anlegen</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
