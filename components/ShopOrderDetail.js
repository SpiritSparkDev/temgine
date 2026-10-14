import React, { useState, useEffect, useCallback } from 'react';
import ConfirmDialog from './ConfirmDialog';
import {
  statusLabel, eventLabel, PAYMENT_LABELS, formatCents, formatDateTime, formatRate, rightsFor, centsToInput,
  maxRefundCents, canRefundOrder, canCancelOrder, hasInvoice, trackingBody, validateRefundAmount, sortEvents,
} from './shopOrdersUtils';

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

const rowStyle = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 };
const colStyle = { display: 'flex', flexDirection: 'column', gap: 2 };

/**
 * Detailansicht einer Bestellung mit Verlauf, Notizen, Sendung, Erstattung, Storno, Rechnung und Downloads.
 * Rechte: Prop `role` (ADMIN|MODERATOR|...); fehlt sie, wird sie aus /api/auth/session gelesen. Die API prüft immer selbst.
 */
export default function ShopOrderDetail({ id, onBack, showToast, role: roleProp }) {
  const [order, setOrder] = useState(null);
  const [role, setRole] = useState(roleProp);
  const [confirm, setConfirm] = useState(null); // 'ship' | 'cancel' | 'refund'
  const [busy, setBusy] = useState(false);
  const [mailError, setMailError] = useState(false);
  const [note, setNote] = useState('');
  const [track, setTrack] = useState({ carrier: '', trackingNumber: '', trackingUrl: '' });
  const [refund, setRefund] = useState({ amount: '', reason: '', restock: false, notifyCustomer: true });
  const [refundError, setRefundError] = useState('');

  const load = useCallback(async (isCancelled = () => false) => {
    try {
      const res = await fetch(`/api/shop/orders/${encodeURIComponent(id)}`);
      const d = await res.json().catch(() => ({}));
      if (isCancelled()) return;
      if (res.ok) {
        const o = d.order || d;
        setOrder(o);
        setTrack({ carrier: o.tracking?.carrier || '', trackingNumber: o.tracking?.number || '', trackingUrl: o.tracking?.url || '' });
        setRefund((r) => ({ ...r, amount: centsToInput(maxRefundCents(o)) }));
      } else showToast(d.error || 'Bestellung konnte nicht geladen werden', 'error');
    } catch {
      if (!isCancelled()) showToast('Bestellung konnte nicht geladen werden', 'error');
    }
  }, [id, showToast]);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    if (roleProp !== undefined) { setRole(roleProp); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        const d = await res.json().catch(() => ({}));
        if (!cancelled) setRole(d?.user?.role || null);
      } catch { if (!cancelled) setRole(null); }
    })();
    return () => { cancelled = true; };
  }, [roleProp]);

  // Führt einen API-Aufruf aus, meldet Fehler/Erfolg und lädt danach neu.
  const call = async (path, method, body, okMsg) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/shop/orders/${encodeURIComponent(id)}/${path}`, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = d.details?.errors?.[0] || d.error || 'Fehler beim Speichern';
        showToast(msg, 'error');
        setBusy(false);
        return { ok: false, error: msg };
      }
      if (okMsg) showToast(okMsg);
      await load();
      setBusy(false);
      return { ok: true, data: d };
    } catch {
      showToast('Fehler beim Speichern', 'error');
      setBusy(false);
      return { ok: false, error: 'Fehler beim Speichern' };
    }
  };

  const ship = async () => {
    setConfirm(null);
    const r = await call('ship', 'POST', trackingBody(track), 'Bestellung als versendet markiert');
    if (r.ok) setMailError(!!r.data.mailError);
  };
  const saveTracking = () => call('tracking', 'PUT', trackingBody(track, true), 'Sendungsdaten gespeichert');
  const addNote = async () => {
    const r = await call('notes', 'POST', { message: note.trim() }, 'Notiz hinzugefügt');
    if (r.ok) setNote('');
  };
  const cancel = async () => { setConfirm(null); await call('cancel', 'POST', null, 'Bestellung storniert'); };
  const doRefund = async () => {
    setConfirm(null);
    const v = validateRefundAmount(refund.amount, order);
    const r = await call('refund', 'POST', {
      amountCents: v.cents, reason: refund.reason.trim(), restock: refund.restock, notifyCustomer: refund.notifyCustomer,
    }, 'Erstattung ausgeführt');
    if (r.ok) setMailError(!!r.data.mailError); else setRefundError(r.error);
  };
  const startRefund = () => {
    const v = validateRefundAmount(refund.amount, order);
    if (v.error) { setRefundError(v.error); return; }
    setRefundError('');
    setConfirm('refund');
  };
  const downloads = async (action) => {
    const r = await call('downloads', 'POST', { action }, action === 'reset' ? 'Downloads zurückgesetzt' : 'Download-Links gesendet');
    if (r.ok && r.data.mailError) showToast('Die Mail konnte nicht gesendet werden', 'error');
  };

  const back = <button className="btn" onClick={onBack}>Zurück zur Liste</button>;
  if (!order) return <div>{back}<p>Lade …</p></div>;

  const rights = rightsFor(role);
  const cur = order.currency;
  const money = (c) => formatCents(c, cur);
  const tax = Object.entries(order.taxBreakdown || {});
  const events = sortEvents(order.events);
  const showTracking = rights.edit && ['PAID', 'SHIPPED'].includes(order.status);
  const showRefund = canRefundOrder(order, rights);
  const refunds = order.refunds || [];
  const dl = order.downloads || [];
  const returns = order.returns || [];

  const confirmMessage = {
    ship: `Bestellung ${order.reference} als versendet markieren? Der Kunde erhält eine Versandmail.`,
    cancel: `Offene Bestellung ${order.reference} stornieren?`,
    refund: `${validateRefundAmount(refund.amount, order).cents != null ? money(validateRefundAmount(refund.amount, order).cents) : ''} für Bestellung ${order.reference} erstatten? Die Rückzahlung beim Zahlungsanbieter kann nicht rückgängig gemacht werden.`,
  }[confirm];
  const confirmAction = { ship, cancel, refund: doRefund }[confirm];

  return (
    <div>
      {back}
      <h3>Bestellung {order.reference}</h3>
      <p>Status: <strong>{statusLabel(order.status)}</strong></p>
      {mailError && <p role="alert">Der Vorgang wurde ausgeführt, aber die Mail an den Kunden konnte nicht gesendet werden.</p>}
      <div style={rowStyle}>
        {rights.edit && order.status === 'PAID' && <button className="btn btn-primary" disabled={busy} onClick={() => setConfirm('ship')}>Als versendet markieren</button>}
        {canCancelOrder(order, rights) && <button className="btn" disabled={busy} onClick={() => setConfirm('cancel')}>Bestellung stornieren</button>}
        {hasInvoice(order) && <a className="btn" href={`/api/shop/orders/${encodeURIComponent(id)}/invoice`} target="_blank" rel="noopener noreferrer">Rechnung öffnen{order.invoice?.number ? ` (${order.invoice.number})` : ''}</a>}
      </div>
      {confirm && <ConfirmDialog message={confirmMessage} onConfirm={confirmAction} onCancel={() => setConfirm(null)} />}

      <h4>Positionen</h4>
      <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ textAlign: 'left' }}><th>Artikel</th><th>Menge</th><th>Einzelpreis</th><th>Summe</th></tr></thead>
        <tbody>
          {(order.items || []).map((it, i) => (
            <tr key={it.id || it.sku || i}>
              <td>{it.title} – {it.label} ({it.sku})</td>
              <td>{it.qty}</td>
              <td>{money(it.unitCents)}</td>
              <td>{money(it.lineCents ?? it.unitCents * it.qty - (it.discountCents || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div>Zwischensumme: {money(order.subtotalCents)}</div>
      {order.discountCents > 0 && (
        <div>Rabatt{order.coupon?.code ? ` (Gutschein ${order.coupon.code})` : ''}: −{money(order.discountCents)}</div>
      )}
      <div>Versand: {money(order.shippingCents)}{order.shippingTaxBp != null && order.shippingCents > 0 ? ` (enthält ${formatRate(order.shippingTaxBp)} MwSt.)` : ''}</div>
      <div><strong>Gesamt: {money(order.totalCents)}</strong></div>
      {order.refundedCents > 0 && <div>Erstattet: {money(order.refundedCents)}</div>}
      {tax.map(([bp, cents]) => <div key={bp}>enthaltene MwSt. {formatRate(Number(bp))}: {money(cents)}</div>)}

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <Address title="Rechnungsadresse" a={order.billing} />
        <Address title="Lieferadresse" a={order.shipping} />
        <div><h4>Kontakt</h4><div>{order.email}</div>{order.locale && <div>Sprache: {order.locale.toUpperCase()}</div>}</div>
      </div>

      <h4>Zahlungen</h4>
      {(order.payments || []).length === 0 && <p>Keine Zahlungen.</p>}
      <ul>
        {(order.payments || []).map((p, i) => (
          <li key={p.id || i}>{p.provider} – {PAYMENT_LABELS[p.status] || p.status} – {money(p.amountCents)}</li>
        ))}
      </ul>

      {showTracking && (
        <section aria-labelledby="od-tracking">
          <h4 id="od-tracking">Sendung</h4>
          <div style={rowStyle}>
            <div style={colStyle}><label htmlFor="od-carrier">Versanddienstleister</label><input id="od-carrier" maxLength={40} value={track.carrier} onChange={(e) => setTrack({ ...track, carrier: e.target.value })} /></div>
            <div style={colStyle}><label htmlFor="od-tnr">Sendungsnummer</label><input id="od-tnr" maxLength={60} value={track.trackingNumber} onChange={(e) => setTrack({ ...track, trackingNumber: e.target.value })} /></div>
            <div style={colStyle}><label htmlFor="od-turl">Tracking-Link (https://)</label><input id="od-turl" type="url" maxLength={300} value={track.trackingUrl} onChange={(e) => setTrack({ ...track, trackingUrl: e.target.value })} /></div>
            <button className="btn" disabled={busy} onClick={saveTracking}>Sendungsdaten speichern</button>
          </div>
          {order.status === 'PAID' && <p>Die Sendungsdaten werden beim Markieren als versendet mit übernommen.</p>}
        </section>
      )}
      {!showTracking && (order.tracking?.number || order.tracking?.carrier) && (
        <p>Sendung: {[order.tracking.carrier, order.tracking.number].filter(Boolean).join(' ')}</p>
      )}

      {showRefund && (
        <section aria-labelledby="od-refund">
          <h4 id="od-refund">Erstatten</h4>
          <p>Noch erstattbar: {money(maxRefundCents(order))}</p>
          <div style={rowStyle}>
            <div style={colStyle}><label htmlFor="od-ramount">Betrag ({cur || 'EUR'})</label><input id="od-ramount" inputMode="decimal" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} /></div>
            <div style={colStyle}><label htmlFor="od-rreason">Grund (max. 500 Zeichen)</label><input id="od-rreason" maxLength={500} value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} /></div>
          </div>
          <div><label><input type="checkbox" checked={refund.restock} onChange={(e) => setRefund({ ...refund, restock: e.target.checked })} /> Bestand zurückbuchen (nur bei vollständiger Erstattung)</label></div>
          <div><label><input type="checkbox" checked={refund.notifyCustomer} onChange={(e) => setRefund({ ...refund, notifyCustomer: e.target.checked })} /> Kunden per E-Mail benachrichtigen</label></div>
          {refundError && <p role="alert">{refundError}</p>}
          <button className="btn" disabled={busy} onClick={startRefund}>Erstatten …</button>
        </section>
      )}
      {refunds.length > 0 && (
        <>
          <h4>Erstattungen</h4>
          <ul>{refunds.map((r, i) => <li key={r.id || i}>{formatDateTime(r.createdAt)} – {money(r.amountCents)} – {r.status}{r.reason ? ` – ${r.reason}` : ''}</li>)}</ul>
        </>
      )}

      {dl.length > 0 && (
        <section aria-labelledby="od-dl">
          <h4 id="od-dl">Downloads</h4>
          <ul>
            {dl.map((d, i) => (
              <li key={i}>{d.filename || 'Datei'} – {d.downloads} von {d.maxDownloads} Abrufen{d.expiresAt ? `, läuft ab ${formatDateTime(d.expiresAt)}` : ''}</li>
            ))}
          </ul>
          {rights.edit && (
            <div style={rowStyle}>
              <button className="btn" disabled={busy} onClick={() => downloads('reset')}>Zurücksetzen</button>
              <button className="btn" disabled={busy} onClick={() => downloads('resend')}>Erneut senden</button>
            </div>
          )}
        </section>
      )}

      {returns.length > 0 && <p>Zu dieser Bestellung gibt es {returns.length === 1 ? '1 Rückgabe-Anfrage' : `${returns.length} Rückgabe-Anfragen`} (siehe Tab „Rückgaben“).</p>}

      <h4>Zeitstempel</h4>
      <div>Angelegt: {formatDateTime(order.createdAt)}</div>
      {order.paidAt && <div>Bezahlt: {formatDateTime(order.paidAt)}</div>}
      {order.shippedAt && <div>Versendet: {formatDateTime(order.shippedAt)}</div>}
      {order.cancelledAt && <div>Storniert: {formatDateTime(order.cancelledAt)}</div>}

      <section aria-labelledby="od-history">
        <h4 id="od-history">Verlauf</h4>
        {rights.edit && (
          <div style={rowStyle}>
            <div style={colStyle}><label htmlFor="od-note">Interne Notiz</label><textarea id="od-note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <button className="btn" disabled={busy || !note.trim()} onClick={addNote}>Notiz hinzufügen</button>
          </div>
        )}
        {events.length === 0 && <p>Noch keine Einträge.</p>}
        <ul>
          {events.map((e, i) => (
            <li key={e.id || i}><strong>{eventLabel(e.type)}</strong> · {formatDateTime(e.createdAt)} · {e.message}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
