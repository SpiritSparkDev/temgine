import React, { useState, useEffect } from 'react';

const PROVIDER_STATE = (p) => (p.enabled ? (p.configured ? 'aktiv' : 'aktiv, Zugangsdaten fehlen') : (p.configured ? 'bereit, nicht aktiviert' : 'nicht konfiguriert'));

const FIELD_STYLE = { display: 'grid', gap: 4 };
const GRID = { display: 'grid', gap: 10, maxWidth: 560, marginBottom: 16 };
const SET = { border: 0, padding: 0, margin: 0 };
const CURRENCIES = ['EUR', 'CHF', 'GBP', 'USD', 'SEK', 'DKK', 'PLN', 'CZK'];

/**
 * Add-on "Online-Shop": Schalter, Überblick über die Zahlungsanbieter (SumUp, Stripe, PayPal),
 * Benachrichtigungs-E-Mail, Präfix der Bestellnummer sowie Verkäuferdaten, Währung/Sprache, Bestand,
 * Digital, Rückgabe und Zeitplan-Token. Zugangsdaten und das Token sind write-only.
 */
export default function ShopSettingsPanel({ showToast }) {
  const [status, setStatus] = useState(null);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [orderPrefix, setOrderPrefix] = useState('');
  const [vals, setVals] = useState({});
  const [errors, setErrors] = useState([]);
  const [newToken, setNewToken] = useState('');
  const [ownToken, setOwnToken] = useState('');

  const apply = (d) => {
    setStatus(d);
    setNotifyEmail(d.notifyEmail || '');
    setOrderPrefix(d.orderPrefix || '');
    setVals(d.settings || {});
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

  const val = (k) => vals[k] ?? '';
  const setVal = (k, v) => setVals((x) => ({ ...x, [k]: v }));
  const text = (label, k, extra = {}) => (
    <label style={FIELD_STYLE}>{label}
      <input type="text" value={val(k)} onChange={(e) => setVal(k, e.target.value)} {...extra} />
    </label>
  );
  const area = (label, k) => (
    <label style={FIELD_STYLE}>{label}
      <textarea rows={3} value={val(k)} onChange={(e) => setVal(k, e.target.value)} />
    </label>
  );
  const num = (label, k, hint) => (
    <label style={FIELD_STYLE}>{label}
      <input type="text" inputMode="numeric" value={val(k)} onChange={(e) => setVal(k, e.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );

  // Speichert alle Werte der Abschnitte; Validierungsfehler des Servers (422) erscheinen als Liste.
  const saveMore = async () => {
    setErrors([]);
    const res = await fetch('/api/shop/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: vals }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { apply(d); showToast('Einstellungen gespeichert'); return; }
    if (res.status === 422 && d.details?.errors?.length) setErrors(d.details.errors);
    showToast(d.error || 'Fehler beim Speichern', 'error');
  };

  const cronAction = async (cronToken, okMsg) => {
    const res = await fetch('/api/shop/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cronToken }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return showToast((d.details?.errors && d.details.errors[0]) || d.error || 'Fehler beim Speichern', 'error');
    setStatus((st) => ({ ...st, cronTokenSet: d.cronTokenSet }));
    setNewToken(d.generatedCronToken || '');
    setOwnToken('');
    showToast(okMsg);
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

        {status?.enabled && (
          <div style={{ marginTop: 24 }}>
            {errors.length > 0 && (
              <ul role="alert" style={{ border: '1px solid #c0392b', borderRadius: 6, padding: '10px 10px 10px 28px', marginBottom: 12, maxWidth: 560 }}>
                {errors.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            )}

            <fieldset style={SET}>
              <legend><h4>Verkäuferdaten (für Rechnung)</h4></legend>
              <p>Erscheinen auf der Rechnung. Nichts wird vorbelegt; fehlende Angaben stehen als Platzhalter auf der Rechnung.</p>
              <div style={GRID}>
                {text('Name / Firma', 'shop_seller_name', { maxLength: 100 })}
                {area('Anschrift', 'shop_seller_address')}
                {text('USt-IdNr.', 'shop_seller_vat_id', { maxLength: 30 })}
                {text('Steuernummer', 'shop_seller_tax_number', { maxLength: 30 })}
                {text('E-Mail des Verkäufers', 'shop_seller_email', { type: 'email', maxLength: 200 })}
                {text('Telefon', 'shop_seller_phone', { maxLength: 40 })}
                {area('Bankverbindung', 'shop_seller_bank')}
                {area('Fußzeile der Rechnung', 'shop_seller_footer')}
                {text('Präfix der Rechnungsnummer', 'shop_invoice_prefix', { maxLength: 10, onChange: (e) => setVal('shop_invoice_prefix', e.target.value.toUpperCase()) })}
              </div>
            </fieldset>

            <fieldset style={SET}>
              <legend><h4>Währung und Sprache</h4></legend>
              <div style={GRID}>
                <label style={FIELD_STYLE}>Währung
                  <select value={val('shop_currency')} onChange={(e) => setVal('shop_currency', e.target.value)}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label style={FIELD_STYLE}>Standardsprache
                  <select value={val('shop_default_locale')} onChange={(e) => setVal('shop_default_locale', e.target.value)}>
                    <option value="de">Deutsch</option>
                    <option value="en">Englisch</option>
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset style={SET}>
              <legend><h4>Bestand</h4></legend>
              <div style={GRID}>
                {num('Schwelle Niedrigbestand (Stück)', 'shop_low_stock_threshold', 'Mail an die Benachrichtigungs-Adresse, wenn der Bestand die Schwelle unterschreitet. Leer = aus.')}
                {num('Reservierungsdauer (Minuten)', 'shop_reservation_minutes', 'So lange wird Bestand für offene Bestellungen zurückgehalten (1–1440).')}
                {num('Unbezahlte Bestellungen stornieren nach (Tagen)', 'shop_pending_cleanup_days', 'Offene Bestellungen werden storniert, nie gelöscht (1–365).')}
              </div>
            </fieldset>

            <fieldset style={SET}>
              <legend><h4>Digitale Produkte</h4></legend>
              <div style={GRID}>
                {num('Gültigkeit der Download-Links (Tage)', 'shop_download_days', '1–3650')}
                {num('Maximale Downloads je Link', 'shop_download_max', '1–1000')}
              </div>
            </fieldset>

            <fieldset style={SET}>
              <legend><h4>Rückgabe</h4></legend>
              <div style={GRID}>
                {num('Rückgabefrist (Tage)', 'shop_return_days', 'Leer = unbegrenzt. Die Frist legst du nach deinen Rechtstexten fest.')}
              </div>
            </fieldset>

            <button className="btn btn-primary" onClick={saveMore}>Einstellungen speichern</button>

            <fieldset style={{ ...SET, marginTop: 24 }}>
              <legend><h4>Zeitplan</h4></legend>
              <p>Abgleich offener Zahlungen, Freigabe abgelaufener Reservierungen und Aufräumen laufen automatisch alle 5 Minuten über den eingebauten Timer des Servers. Nur wenn dieser abgeschaltet ist oder du einen externen Dienst nutzt, rufe <code>POST /api/shop/cron</code> mit dem Header <code>x-shop-cron: &lt;Token&gt;</code> auf.</p>
              <p>Zeitplan-Token: <strong>{status.cronTokenSet ? 'gesetzt' : 'nicht gesetzt'}</strong> (wird nie angezeigt)</p>
              {newToken && (
                <div role="status" style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: 10, marginBottom: 10, maxWidth: 560 }}>
                  <p>Neues Token – wird nur jetzt angezeigt, bitte kopieren:</p>
                  <input type="text" readOnly aria-label="Neues Zeitplan-Token" value={newToken} onFocus={(e) => e.target.select()} style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <button className="btn" onClick={() => cronAction({ action: 'generate' }, 'Token erzeugt')}>{status.cronTokenSet ? 'Token neu erzeugen' : 'Token erzeugen'}</button>
                {status.cronTokenSet && <button className="btn" onClick={() => cronAction({ action: 'clear' }, 'Token entfernt')}>Token entfernen</button>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', maxWidth: 560 }}>
                <label style={{ ...FIELD_STYLE, flex: 1 }}>Eigenes Token setzen (16–128 Zeichen: A–Z, a–z, 0–9, _ -)
                  <input type="password" autoComplete="new-password" value={ownToken} onChange={(e) => setOwnToken(e.target.value)} />
                </label>
                <button className="btn" disabled={!ownToken.trim()} onClick={() => cronAction({ action: 'set', value: ownToken }, 'Token gespeichert')}>Token setzen</button>
              </div>
            </fieldset>
          </div>
        )}
      </div>
    </section>
  );
}
