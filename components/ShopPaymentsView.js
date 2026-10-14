import React, { useState, useEffect, useCallback } from 'react';
import { providersToForm, providerPayload, statusLabel, webhookUrl } from './shopPaymentsUtils';

const post = (url, method, body) => fetch(url, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

/** Admin-Tab "Zahlungsarten": je Anbieter Schalter, Zugangsdaten, Verbindungstest. */
export default function ShopPaymentsView({ showToast }) {
  const [providers, setProviders] = useState(null);
  const [form, setForm] = useState({});
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState('');

  const apply = (d) => { setProviders(d.providers); setForm(providersToForm(d.providers)); };

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch('/api/shop/payments');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Zahlungsarten konnten nicht geladen werden');
      apply(d);
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loadError) return <div><p role="alert">{loadError}</p><button className="btn" onClick={load}>Erneut laden</button></div>;
  if (!providers) return <p>Lade…</p>;

  const patch = (id, p) => setForm((f) => ({ ...f, [id]: { ...f[id], ...p } }));
  const setValue = (id, key, v) => setForm((f) => ({ ...f, [id]: { ...f[id], values: { ...f[id].values, [key]: v } } }));
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const save = async (id) => {
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: [] }));
    try {
      const res = await post('/api/shop/payments', 'PUT', { providers: { [id]: providerPayload(form[id]) } });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { apply(d); showToast(`${providers[id].label} gespeichert`); }
      else setErrors((e) => ({ ...e, [id]: d.details?.errors || [d.error || 'Fehler beim Speichern'] }));
    } catch (e) {
      setErrors((x) => ({ ...x, [id]: [e.message] }));
    } finally {
      setBusy('');
    }
  };

  const test = async (id) => {
    setBusy(id);
    try {
      const res = await post('/api/shop/payments/test-connection', 'POST', { provider: id, values: form[id].values });
      const d = await res.json().catch(() => ({}));
      setResults((r) => ({ ...r, [id]: d.ok ? { ok: true, text: d.info || 'Verbindung erfolgreich' } : { ok: false, text: d.error || 'Verbindung fehlgeschlagen' } }));
    } catch (e) {
      setResults((r) => ({ ...r, [id]: { ok: false, text: e.message } }));
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <h3>Zahlungsarten</h3>
      {Object.entries(providers).map(([id, p]) => (
        <section key={id} aria-label={p.label} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12, marginBottom: 16 }}>
          <h4>{p.label} <small>({statusLabel(p)})</small></h4>
          <label>
            <input type="checkbox" checked={form[id].enabled} onChange={(e) => patch(id, { enabled: e.target.checked })} /> Aktiv
          </label>
          {p.fields.map((f) => {
            const common = { id: `${id}-${f.key}`, value: form[id].values[f.key], onChange: (e) => setValue(id, f.key, e.target.value) };
            return (
              <div key={f.key} style={{ margin: '8px 0' }}>
                <label htmlFor={common.id} style={{ display: 'block' }}>{f.label}</label>
                {f.options ? (
                  <select {...common}>
                    <option value="">–</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    {...common}
                    type={f.secret ? 'password' : 'text'}
                    autoComplete="off"
                    maxLength={500}
                    placeholder={f.secret && f.set ? 'gespeichert – leer lassen zum Behalten' : ''}
                  />
                )}
              </div>
            );
          })}
          <p>Webhook-URL (beim Anbieter eintragen): <code>{webhookUrl(origin, id)}</code></p>
          {(errors[id] || []).length > 0 && <ul role="alert">{errors[id].map((m) => <li key={m}>{m}</li>)}</ul>}
          {results[id] && <p role="status">{results[id].ok ? 'OK: ' : 'Fehler: '}{results[id].text}</p>}
          <button className="btn" disabled={busy === id} onClick={() => test(id)}>Verbindung testen</button>{' '}
          <button className="btn btn-primary" disabled={busy === id} onClick={() => save(id)}>Speichern</button>
        </section>
      ))}
    </div>
  );
}
