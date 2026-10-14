import React, { useState, useEffect } from 'react';
import ShopOrderDetail from './ShopOrderDetail';
import { STATUS_FILTERS, statusLabel, formatCents, formatDateTime, buildOrdersQuery } from './shopOrdersUtils';

/** Bestellliste mit Statusfilter, Suche (Debounce) und Seitenwechsel; Klick öffnet die Detailansicht. */
export default function ShopOrdersView({ showToast }) {
  const [status, setStatus] = useState('');
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(input); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (openId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shop/orders${buildOrdersQuery({ status, q, page })}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setData(d); else showToast(d.error || 'Bestellungen konnten nicht geladen werden', 'error');
      } catch {
        if (!cancelled) showToast('Bestellungen konnten nicht geladen werden', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [status, q, page, openId, showToast]);

  if (openId) return <ShopOrderDetail id={openId} onBack={() => setOpenId(null)} showToast={showToast} />;

  const orders = data?.orders || [];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <input type="search" aria-label="Suche" placeholder="Bestellnummer oder E-Mail" value={input} onChange={(e) => setInput(e.target.value)} />
      </div>
      {data && orders.length === 0 && <p>Keine Bestellungen gefunden.</p>}
      {orders.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}><th>Bestellnummer</th><th>Datum</th><th>Status</th><th>E-Mail</th><th>Summe</th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><button className="btn" onClick={() => setOpenId(o.id)}>{o.reference}</button></td>
                <td>{formatDateTime(o.createdAt)}</td>
                <td>{statusLabel(o.status)}</td>
                <td>{o.email}</td>
                <td>{formatCents(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
