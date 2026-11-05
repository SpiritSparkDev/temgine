import React, { useState, useEffect } from 'react';
import ShopOrderDetail from './ShopOrderDetail';
import { STATUS_FILTERS, statusLabel, formatCents, formatDateTime, buildOrdersQuery, buildExportUrl } from './shopOrdersUtils';

/** Bestellliste mit Status-/Datumsfilter, Suche (Debounce), CSV-Export und Seitenwechsel; Klick öffnet die Detailansicht. */
export default function ShopOrdersView({ showToast, role, initialReference }) {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Bestellung per Nummer öffnen (Sprung aus anderen Tabs); ohne exakten Treffer landet die Nummer in der Suche.
  useEffect(() => {
    if (!initialReference) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shop/orders${buildOrdersQuery({ q: initialReference, page: 1 })}`);
        const d = await res.json().catch(() => ({}));
        const hit = (d.orders || []).find((o) => o.reference === initialReference);
        if (cancelled) return;
        if (hit) setOpenId(hit.id); else { setInput(initialReference); showToast('Bestellung nicht gefunden', 'error'); }
      } catch {
        if (!cancelled) showToast('Bestellung konnte nicht geladen werden', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [initialReference, showToast]);

  useEffect(() => {
    const t = setTimeout(() => { setQ(input); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (openId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shop/orders${buildOrdersQuery({ status, q, page, from, to })}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setData(d); else showToast(d.error || 'Bestellungen konnten nicht geladen werden', 'error');
      } catch {
        if (!cancelled) showToast('Bestellungen konnten nicht geladen werden', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [status, q, page, from, to, openId, showToast, reloadKey]);

  const reconcile = async () => {
    setReconciling(true);
    try {
      const res = await fetch('/api/shop/orders/reconcile', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Abgleich fehlgeschlagen');
      showToast(`Geprüft: ${d.checked}, bezahlt: ${d.paid}, fehlgeschlagen: ${d.failed}`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      showToast(e.message || 'Abgleich fehlgeschlagen', 'error');
    } finally {
      setReconciling(false);
    }
  };

  if (openId) return <ShopOrderDetail id={openId} role={role} onBack={() => setOpenId(null)} showToast={showToast} />;

  const orders = data?.orders || [];
  const reset = (setter) => (e) => { setter(e.target.value); setPage(1); };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <select aria-label="Status" value={status} onChange={reset(setStatus)}>
          {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <label>Von <input type="date" value={from} max={to || undefined} onChange={reset(setFrom)} /></label>
        <label>Bis <input type="date" value={to} min={from || undefined} onChange={reset(setTo)} /></label>
        <input type="search" aria-label="Suche" placeholder="Bestellnummer oder E-Mail" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn" disabled={reconciling} onClick={reconcile}>Offene Zahlungen abgleichen</button>
        <a className="btn" href={buildExportUrl({ status, from, to })}>CSV exportieren</a>
        <a className="btn" href={buildExportUrl({ status, from, to, detail: 'items' })}>CSV mit Positionen</a>
      </div>
      {data && orders.length === 0 && <p>Keine Bestellungen gefunden.</p>}
      {orders.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}><th>Bestellnummer</th><th>Datum</th><th>Status</th><th>E-Mail</th><th>Summe</th><th>Erstattet</th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><button className="btn" onClick={() => setOpenId(o.id)}>{o.reference}</button></td>
                <td>{formatDateTime(o.createdAt)}</td>
                <td>{statusLabel(o.status)}</td>
                <td>{o.email}</td>
                <td>{formatCents(o.totalCents, o.currency)}</td>
                <td>{o.refundedCents > 0 ? formatCents(o.refundedCents, o.currency) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {data && data.pages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</button>
          <span>Seite {data.page} von {data.pages}</span>
          <button className="btn" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Weiter</button>
        </div>
      )}
    </div>
  );
}
