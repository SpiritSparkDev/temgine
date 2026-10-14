import React, { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { statusLabel, PAYMENT_LABELS, formatCents, formatDateTime, formatRate } from './shopOrdersUtils';

function Address({ title, a }) {
  const x = a || {};
  return (
    <div>
      <h4>{title}</h4>
      <div>{x.name}</div>
      <div>{x.street}</div>
      <div>{[x.zip, x.city].filter(Boolean).join(' ')}</div>
      <div>{x.country}</div>
    </div>
  );
}

/** Detailansicht einer Bestellung; "Als versendet markieren" nur bei PAID. */
export default function ShopOrderDetail({ id, onBack, showToast }) {
  const [order, setOrder] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mailError, setMailError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shop/orders/${encodeURIComponent(id)}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setOrder(d.order || d); else showToast(d.error || 'Bestellung konnte nicht geladen werden', 'error');
      } catch {
        if (!cancelled) showToast('Bestellung konnte nicht geladen werden', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [id, showToast]);

  const ship = async () => {
    setConfirm(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/shop/orders/${encodeURIComponent(id)}/ship`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrder((o) => ({ ...o, ...(d.order || {}), status: 'SHIPPED' }));
        setMailError(!!d.mailError);
        showToast('Bestellung als versendet markiert');
      } else showToast(d.error || 'Fehler beim Speichern', 'error');
    } catch {
      showToast('Fehler beim Speichern', 'error');
    }
    setBusy(false);
  };

  const back = <button className="btn" onClick={onBack}>Zurück zur Liste</button>;
  if (!order) return <div>{back}<p>Lade …</p></div>;

  const tax = Object.entries(order.taxBreakdown || {});
  return (
    <div>
      {back}
      <h3>Bestellung {order.reference}</h3>
      <p>Status: <strong>{statusLabel(order.status)}</strong></p>
      {mailError && <p role="alert">Der Status wurde geändert, aber die Versandmail konnte nicht gesendet werden.</p>}
      {order.status === 'PAID' && <button className="btn btn-primary" disabled={busy} onClick={() => setConfirm(true)}>Als versendet markieren</button>}
      {confirm && <ConfirmDialog message={`Bestellung ${order.reference} als versendet markieren? Der Kunde erhält eine Versandmail.`} onConfirm={ship} onCancel={() => setConfirm(false)} />}

      <h4>Positionen</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ textAlign: 'left' }}><th>Artikel</th><th>Menge</th><th>Einzelpreis</th><th>Summe</th></tr></thead>
        <tbody>
          {(order.items || []).map((it, i) => (
            <tr key={it.id || i}>
              <td>{it.title} – {it.label} ({it.sku})</td>
              <td>{it.qty}</td>
              <td>{formatCents(it.unitCents)}</td>
              <td>{formatCents(it.lineCents ?? it.unitCents * it.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>Zwischensumme: {formatCents(order.subtotalCents)}</div>
      <div>Versand: {formatCents(order.shippingCents)}</div>
      <div><strong>Gesamt: {formatCents(order.totalCents)}</strong></div>
      {tax.map(([bp, cents]) => <div key={bp}>enthaltene MwSt. {formatRate(Number(bp))}: {formatCents(cents)}</div>)}

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <Address title="Rechnungsadresse" a={order.billing} />
        <Address title="Lieferadresse" a={order.shipping} />
        <div><h4>Kontakt</h4><div>{order.email}</div></div>
      </div>

      <h4>Zahlungen</h4>
      {(order.payments || []).length === 0 && <p>Keine Zahlungen.</p>}
      <ul>
        {(order.payments || []).map((p, i) => (
          <li key={p.id || i}>{p.provider} – {PAYMENT_LABELS[p.status] || p.status} – {formatCents(p.amountCents)}</li>
        ))}
      </ul>

      <h4>Zeitstempel</h4>
      <div>Angelegt: {formatDateTime(order.createdAt)}</div>
      {order.paidAt && <div>Bezahlt: {formatDateTime(order.paidAt)}</div>}
      {order.shippedAt && <div>Versendet: {formatDateTime(order.shippedAt)}</div>}
    </div>
  );
}
