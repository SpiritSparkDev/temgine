import React, { useState, useEffect, useCallback } from 'react';
import { configToForm, formToPayload, emptyTier, emptyZone } from './shopShippingUtils';

/** Admin-Tab "Versand & Steuer": Länderliste, Versandzonen und Gewichtsstufen. */
export default function ShopShippingView({ showToast }) {
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [newCountry, setNewCountry] = useState({ code: '', name: '' });

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch('/api/shop/shipping');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Versandkonfiguration konnte nicht geladen werden');
      setForm(configToForm(d.shipping || d));
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loadError) return <div><p role="alert">{loadError}</p><button className="btn" onClick={load}>Erneut laden</button></div>;
  if (!form) return <p>Lade…</p>;

  const setZone = (i, patch) => setForm((f) => ({ ...f, zones: f.zones.map((z, k) => (k === i ? { ...z, ...patch } : z)) }));
  const setTier = (i, j, patch) => setZone(i, { tiers: form.zones[i].tiers.map((t, k) => (k === j ? { ...t, ...patch } : t)) });
  const taken = (code, i) => form.zones.some((z, k) => k !== i && z.countries.includes(code));

  const toggleCountry = (i, code) => {
    const cur = form.zones[i].countries;
    setZone(i, { countries: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] });
  };

  const addCountry = () => {
    const code = newCountry.code.trim().toUpperCase();
    if (form.countries.some((c) => c.code === code)) { setErrors([`Land „${code}“ existiert bereits.`]); return; }
    setForm((f) => ({ ...f, countries: [...f.countries, { code, name: newCountry.name }] }));
    setNewCountry({ code: '', name: '' });
    setErrors([]);
  };

  const removeCountry = (code) => setForm((f) => ({
    ...f,
    countries: f.countries.filter((c) => c.code !== code),
    zones: f.zones.map((z) => ({ ...z, countries: z.countries.filter((c) => c !== code) })),
  }));

  const save = async () => {
    const { payload, errors: errs } = formToPayload(form);
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      const res = await fetch('/api/shop/shipping', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setForm(configToForm(d.shipping || payload));
        showToast('Versandkonfiguration gespeichert');
      } else if (res.status === 422 && d.details?.errors) {
        setErrors(d.details.errors);
      } else {
        setErrors([d.error || 'Fehler beim Speichern']);
      }
    } catch (e) {
      setErrors([e.message]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h3>Versand &amp; Steuer</h3>
      <p>Preise sind Bruttopreise. Der MwSt.-Satz wird je Format im Produkt gepflegt.</p>
      <p>Zonen ohne Gewichtsstufen: Versand dorthin ist nicht möglich.</p>

      {errors.length > 0 && <ul role="alert" style={{ color: 'crimson' }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}

      <p>
        <label htmlFor="shipping-free">Versandkostenfrei ab Warenwert (€, leer = aus){' '}
          <input id="shipping-free" value={form.freeShipping} onChange={(e) => setForm((f) => ({ ...f, freeShipping: e.target.value }))} />
        </label>
        <br /><small>Vergleich mit der Zwischensumme nach Rabatt; gilt nur für Bestellungen mit physischen Artikeln.</small>
      </p>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>Länder</legend>
        {form.countries.map((c) => (
          <div key={c.code} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <strong style={{ width: 32 }}>{c.code}</strong>
            <input aria-label={`Name ${c.code}`} value={c.name}
              onChange={(e) => setForm((f) => ({ ...f, countries: f.countries.map((x) => (x.code === c.code ? { ...x, name: e.target.value } : x)) }))} />
            <button className="btn" aria-label={`Land ${c.code} entfernen`} onClick={() => removeCountry(c.code)}>Entfernen</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input aria-label="Ländercode" placeholder="Code (DE)" maxLength={2} style={{ width: 90 }} value={newCountry.code}
            onChange={(e) => setNewCountry({ ...newCountry, code: e.target.value })} />
          <input aria-label="Ländername" placeholder="Name" value={newCountry.name}
            onChange={(e) => setNewCountry({ ...newCountry, name: e.target.value })} />
          <button className="btn" onClick={addCountry}>Land hinzufügen</button>
        </div>
      </fieldset>

      {form.zones.map((z, i) => (
        <fieldset key={z.key} role="group" aria-label={`Zone ${i + 1}`} style={{ marginBottom: 16 }}>
          <legend>Zone {i + 1}</legend>
          <label>Zonenname <input aria-label={`Zonenname ${i + 1}`} value={z.name} onChange={(e) => setZone(i, { name: e.target.value })} /></label>
          <label style={{ marginLeft: 12 }}>MwSt. auf Versand (%, leer = keine Angabe) <input aria-label={`MwSt.-Satz Zone ${i + 1}`} style={{ width: 70 }} value={z.tax} onChange={(e) => setZone(i, { tax: e.target.value })} /></label>
          <div style={{ margin: '8px 0' }}>
            {form.countries.map((c) => (
              <label key={c.code} style={{ marginRight: 12, display: 'inline-block' }}>
                <input type="checkbox" aria-label={`Zone ${i + 1}: ${c.code}`} checked={z.countries.includes(c.code)}
                  disabled={taken(c.code, i)} onChange={() => toggleCountry(i, c.code)} /> {c.code}
              </label>
            ))}
          </div>
          <table>
            <thead><tr><th align="left">bis Gramm</th><th align="left">Preis (€ brutto)</th><th /></tr></thead>
            <tbody>
              {z.tiers.map((t, j) => (
                <tr key={t.key}>
                  <td><input aria-label={`Zone ${i + 1} Stufe ${j + 1} bis Gramm`} value={t.maxG} onChange={(e) => setTier(i, j, { maxG: e.target.value })} /></td>
                  <td><input aria-label={`Zone ${i + 1} Stufe ${j + 1} Preis`} value={t.price} onChange={(e) => setTier(i, j, { price: e.target.value })} /></td>
                  <td><button className="btn" aria-label={`Zone ${i + 1} Stufe ${j + 1} entfernen`}
                    onClick={() => setZone(i, { tiers: z.tiers.filter((_, k) => k !== j) })}>Entfernen</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn" onClick={() => setZone(i, { tiers: [...z.tiers, emptyTier()] })}>Stufe hinzufügen</button>{' '}
          <button className="btn" onClick={() => setForm((f) => ({ ...f, zones: f.zones.filter((_, k) => k !== i) }))}>Zone entfernen</button>
        </fieldset>
      ))}

      <button className="btn" onClick={() => setForm((f) => ({ ...f, zones: [...f.zones, emptyZone(f.zones.map((z) => z.id))] }))}>Zone hinzufügen</button>{' '}
      <button className="btn btn-primary" disabled={saving} onClick={save}>Speichern</button>
    </div>
  );
}
