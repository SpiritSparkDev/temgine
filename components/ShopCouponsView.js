import React, { useState, useEffect, useCallback } from 'react';
import {
  emptyCouponForm, couponToForm, formToPayload,
  couponValueText, couponMinOrderText, couponUsesText, couponValidityText,
} from './shopCouponUtils';

/**
 * Admin-Tab "Gutscheine": Liste, Anlegen/Bearbeiten, Aktiv-Umschalter (kein Löschen).
 * Die Rechteprüfung (SHOP_COUPONS_EDIT) erfolgt in der API; ohne Recht (403) erscheint deren Meldung statt der Liste.
 */
export default function ShopCouponsView({ showToast }) {
  const [coupons, setCoupons] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(null); // null = Liste, sonst Formularzustand
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch('/api/shop/coupons');
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Gutscheine konnten nicht geladen werden');
      setCoupons(d.coupons || []);
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loadError) return <div><p role="alert">{loadError}</p><button className="btn" onClick={load}>Erneut laden</button></div>;
  if (!coupons) return <p>Lade…</p>;

  const open = (c) => { setErrors([]); setForm(c ? couponToForm(c) : emptyCouponForm()); };
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const toggleActive = async (c) => {
    try {
      const res = await fetch(`/api/shop/coupons/${c.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !c.active }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.coupon) setCoupons((list) => list.map((x) => (x.id === c.id ? d.coupon : x)));
      else showToast(d.details?.errors?.join(' ') || d.error || 'Fehler beim Speichern', 'error');
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  const save = async () => {
    const { payload, errors: errs } = formToPayload(form);
    setErrors(errs);
    if (errs.length) return;
    const isNew = form.id === undefined;
    setSaving(true);
    try {
      const res = await fetch(isNew ? '/api/shop/coupons' : `/api/shop/coupons/${form.id}`, {
        method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.coupon) {
        showToast(isNew ? 'Gutschein angelegt' : 'Gutschein gespeichert');
        setForm(null);
        load();
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

  if (form) {
    const isNew = form.id === undefined;
    const pct = form.type === 'PERCENT';
    return (
      <div>
        <h3>{isNew ? 'Neuer Gutschein' : `Gutschein ${form.code}`}</h3>
        {errors.length > 0 && <ul role="alert" style={{ color: 'crimson' }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
          <label htmlFor="coupon-code">Code
            <input id="coupon-code" value={form.code} disabled={!isNew} maxLength={32} onChange={(e) => set({ code: e.target.value })} />
          </label>
          <label htmlFor="coupon-type">Art
            <select id="coupon-type" value={form.type} onChange={(e) => set({ type: e.target.value, value: '' })}>
              <option value="PERCENT">Prozent</option>
              <option value="FIXED">Festbetrag</option>
            </select>
          </label>
          <label htmlFor="coupon-value">{pct ? 'Rabatt (%)' : 'Rabatt (€)'}
            <input id="coupon-value" value={form.value} placeholder={pct ? '10' : '5,00'} onChange={(e) => set({ value: e.target.value })} />
          </label>
          <label htmlFor="coupon-min">Mindestbestellwert (€, leer = keiner)
            <input id="coupon-min" value={form.minOrder} onChange={(e) => set({ minOrder: e.target.value })} />
          </label>
          <label htmlFor="coupon-max">Maximale Einlösungen (leer = unbegrenzt)
            <input id="coupon-max" value={form.maxUses} onChange={(e) => set({ maxUses: e.target.value })} />
          </label>
          <label htmlFor="coupon-from">Gültig ab
            <input id="coupon-from" type="date" value={form.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
          </label>
          <label htmlFor="coupon-until">Gültig bis (einschließlich)
            <input id="coupon-until" type="date" value={form.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />
          </label>
          <label htmlFor="coupon-note">Notiz (intern)
            <input id="coupon-note" value={form.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} />
          </label>
          <label htmlFor="coupon-active">
            <input id="coupon-active" type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> Aktiv
          </label>
        </div>
        <p>
          <button className="btn btn-primary" disabled={saving} onClick={save}>Speichern</button>{' '}
          <button className="btn" onClick={() => setForm(null)}>Abbrechen</button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3>Gutscheine</h3>
        <button className="btn btn-primary" onClick={() => open(null)}>Neuer Gutschein</button>
      </div>
      {coupons.length === 0 ? <p>Noch keine Gutscheine.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th align="left">Code</th><th align="left">Rabatt</th><th align="left">Mindestbestellwert</th>
                <th align="left">Einlösungen</th><th align="left">Gültigkeit</th><th align="left">Aktiv</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td><button className="btn" onClick={() => open(c)}>{c.code}</button></td>
                  <td>{couponValueText(c)}</td>
                  <td>{couponMinOrderText(c)}</td>
                  <td>{couponUsesText(c)}</td>
                  <td>{couponValidityText(c)}</td>
                  <td><input type="checkbox" aria-label={`${c.code} aktiv`} checked={!!c.active} onChange={() => toggleActive(c)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
