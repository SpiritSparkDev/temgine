import React, { useState, useEffect } from 'react';
import { formatDateTime } from './shopOrdersUtils';
import { RETURN_FILTERS, returnLabel, allowedTransitions, buildReturnsQuery, confirmText } from './shopReturnsUtils';

function ReturnDetail({ id, onBack, showToast, onOpenOrder }) {
  const [item, setItem] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shop/returns/${encodeURIComponent(id)}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) { setItem(d.return); setNote(d.return.adminNote || ''); } else showToast(d.error || 'Anfrage konnte nicht geladen werden', 'error');
      } catch {
        if (!cancelled) showToast('Anfrage konnte nicht geladen werden', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [id, showToast]);

  const save = async (body, okText) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/shop/returns/${encodeURIComponent(id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Speichern fehlgeschlagen');
      setItem(d.return);
      setNote(d.return.adminNote || '');
      showToast(okText);
    } catch (e) {
      showToast(e.message || 'Speichern fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  };

  const change = (to) => {
    if (!window.confirm(confirmText(item.status, to))) return;
    save({ status: to }, `Status: ${returnLabel(to)}`);
  };

  if (!item) return <div><button className="btn" onClick={onBack}>Zurück zur Liste</button><p>Lade …</p></div>;
  const next = allowedTransitions(item.status);
  const ref = item.order?.reference;
  const orderLink = onOpenOrder && ref ? <button className="btn" onClick={() => onOpenOrder(ref)}>{ref}</button> : ref;

  return (
    <div>
      <button className="btn" onClick={onBack}>Zurück zur Liste</button>
      <h3>Rückgabe zu Bestellung {orderLink}</h3>
      <dl>
        <dt>E-Mail</dt><dd>{item.email}</dd>
        <dt>Eingegangen</dt><dd>{formatDateTime(item.createdAt)}</dd>
        <dt>Status</dt><dd>{returnLabel(item.status)}</dd>
        <dt>Grund</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{item.reason}</dd>
      </dl>
      <h4>Positionen{item.wholeOrder ? ' (ganze Bestellung)' : ''}</h4>
      <ul>
        {(item.items || []).map((i) => (
          <li key={i.sku}>{i.qty}× {i.title || i.sku}{i.label ? ` – ${i.label}` : ''} ({i.sku})</li>
        ))}
      </ul>

      <h4>Status ändern</h4>
      {next.length === 0 ? <p>Dieser Status ist abgeschlossen.</p> : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {next.map((to) => <button key={to} className="btn" disabled={busy} onClick={() => change(to)}>{returnLabel(to)}</button>)}
        </div>
      )}
      <p>Die Erstattung des Betrags erfolgt nicht hier, sondern im Bestelldetail der Bestellung {item.order?.reference} (Tab „Bestellungen“). Der Status „Erstattet“ hier dokumentiert sie nur.</p>

      <h4>Interne Notiz</h4>
      <label htmlFor="shop-return-note">Notiz (nur intern, höchstens 2000 Zeichen)</label>
      <div>
        <textarea id="shop-return-note" rows={4} maxLength={2000} style={{ width: '100%', maxWidth: 600 }} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={busy} onClick={() => save({ adminNote: note }, 'Notiz gespeichert')}>Notiz speichern</button>
    </div>
  );
}

/** Rückgabe-Anfragen: Liste mit Statusfilter und Paginierung, Klick öffnet die Details. */
export default function ShopReturnsView({ showToast, onOpenOrder }) {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (openId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shop/returns${buildReturnsQuery({ status, page })}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setData(d);
        else if (res.status === 403 || res.status === 401) setDenied(true);
        else showToast(d.error || 'Rückgaben konnten nicht geladen werden', 'error');
      } catch {
        if (!cancelled) showToast('Rückgaben konnten nicht geladen werden', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [status, page, openId, showToast]);

  if (denied) return <p role="alert">Für Rückgaben fehlt dir das Recht „Rückgaben bearbeiten“.</p>;
  if (openId) return <ReturnDetail id={openId} onBack={() => setOpenId(null)} showToast={showToast} onOpenOrder={onOpenOrder} />;

  const rows = data?.returns || [];
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {RETURN_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      {data && rows.length === 0 && <p>Keine Rückgabe-Anfragen gefunden.</p>}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}><th>Bestellnummer</th><th>Datum</th><th>Status</th><th>E-Mail</th><th>Grund</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><button className="btn" onClick={() => setOpenId(r.id)}>{r.reference || r.id}</button></td>
                  <td>{formatDateTime(r.createdAt)}</td>
                  <td>{returnLabel(r.status)}</td>
                  <td>{r.email}</td>
                  <td>{r.reasonExcerpt}</td>
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
