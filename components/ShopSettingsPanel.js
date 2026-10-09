import React, { useState, useEffect } from 'react';

const PROVIDER_STATE = (p) => (p.enabled ? (p.configured ? 'aktiv' : 'aktiv, Zugangsdaten fehlen') : (p.configured ? 'bereit, nicht aktiviert' : 'nicht konfiguriert'));

/**
 * Add-on "Online-Shop": Schalter und Überblick über die Zahlungsanbieter (SumUp, Stripe, PayPal).
 * Die Konfiguration der Anbieter folgt mit den jeweiligen Zahlungsarten. Zugangsdaten sind write-only.
 */
export default function ShopSettingsPanel({ showToast }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch('/api/shop/settings').then((r) => r.json()).then((d) => { if (!d.error) setStatus(d); }).catch(() => {});
  }, []);

  const toggle = async (on) => {
    const res = await fetch('/api/shop/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: on }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setStatus(d); else showToast(d.error || 'Fehler beim Speichern', 'error');
  };

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
      </div>
    </section>
  );
}
