import React, { useState, useEffect } from 'react';
import { formatMoney } from '../lib/shop/money';
import { buildTiles, statusRows, barGeometry, shortDate } from './shopOverviewUtils';

const W = 600;
const H = 160;

/** Übersicht: Kennzahlen, Status, Umsatz je Tag (SVG), Top-Listen, Niedrigbestand. */
export default function ShopOverviewView({ showToast }) {
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/shop/reports/overview');
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setData(d);
        else if (res.status === 403 || res.status === 401) setDenied(true);
        else { setFailed(true); showToast(d.error || 'Übersicht konnte nicht geladen werden', 'error'); }
      } catch {
        if (!cancelled) { setFailed(true); showToast('Übersicht konnte nicht geladen werden', 'error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  if (denied) return <p role="alert">Für die Übersicht fehlt dir das Recht „Shop-Berichte ansehen“.</p>;
  if (failed) return <p role="alert">Die Übersicht konnte nicht geladen werden.</p>;
  if (!data) return <p>Lade Übersicht …</p>;

  const cur = data.currency || 'EUR';
  const money = (c) => formatMoney(c, cur, 'de');
  const bars = barGeometry(data.perDay, { width: W, height: H });
  const total30 = (data.perDay || []).reduce((s, d) => s + (d.revenueCents || 0), 0);
  const statuses = statusRows(data.orders?.byStatus);
  const cell = { padding: '4px 8px', textAlign: 'left' };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {buildTiles(data).map((t) => (
          <div key={t.key} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12 }}>
            <div style={{ fontSize: 13 }}>{t.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{t.value}</div>
          </div>
        ))}
      </div>

      <h3>Bestellungen je Status</h3>
      {statuses.length === 0 ? <p>Noch keine Bestellungen.</p> : (
        <ul>{statuses.map((s) => <li key={s.status}>{s.label}: {s.count}</li>)}</ul>
      )}

      <h3>Umsatz je Tag (letzte 30 Tage)</h3>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-labelledby="shop-ov-title" style={{ width: '100%', maxWidth: 700, height: 'auto' }}>
        <title id="shop-ov-title">{`Umsatz je Tag der letzten 30 Tage, insgesamt ${money(total30)}`}</title>
        {bars.map((b) => (
          <rect key={b.date} x={b.x} y={b.y} width={b.width} height={b.height} fill="currentColor" opacity="0.7">
            <title>{`${shortDate(b.date)}: ${money(b.revenueCents)} (${b.count} Bestellungen)`}</title>
          </rect>
        ))}
        <line x1="0" y1={H} x2={W} y2={H} stroke="currentColor" />
        {bars.length > 0 && <text x="0" y={H + 14} fontSize="11" fill="currentColor">{shortDate(bars[0].date)}</text>}
        {bars.length > 0 && <text x={W} y={H + 14} fontSize="11" textAnchor="end" fill="currentColor">{shortDate(bars[bars.length - 1].date)}</text>}
      </svg>
      <details>
        <summary>Als Tabelle anzeigen</summary>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <caption style={{ textAlign: 'left' }}>Umsatz und Bestellungen je Tag</caption>
            <thead><tr><th scope="col" style={cell}>Datum</th><th scope="col" style={cell}>Bestellungen</th><th scope="col" style={cell}>Umsatz</th></tr></thead>
            <tbody>
              {(data.perDay || []).map((d) => (
                <tr key={d.date}><td style={cell}>{shortDate(d.date)}</td><td style={cell}>{d.count}</td><td style={cell}>{money(d.revenueCents)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <h3>Top-Produkte (30 Tage)</h3>
      {(data.topProducts || []).length === 0 ? <p>Keine Verkäufe im Zeitraum.</p> : (
        <ol>{data.topProducts.map((p) => <li key={p.title}>{p.title}: {p.units} Stück</li>)}</ol>
      )}

      <h3>Top-Gutscheine (30 Tage)</h3>
      {(data.topCoupons || []).length === 0 ? <p>Keine Gutscheine eingelöst.</p> : (
        <ol>{data.topCoupons.map((c) => <li key={c.code}>{c.code}: {c.uses}× eingelöst, Rabatt {money(c.discountCents)}</li>)}</ol>
      )}

      <h3>Niedriger Bestand</h3>
      {(data.lowStock || []).length === 0 ? (
        <p>Keine Formate unter der Schwelle. Ist keine Schwelle gesetzt, wird nichts gemeldet: Einstellung unter Zahlungen/Einstellungen („Niedrigbestand-Schwelle“).</p>
      ) : (
        <ul>{data.lowStock.map((f) => <li key={f.sku}>{f.title} – {f.label} ({f.sku}): {f.stock} Stück</li>)}</ul>
      )}
    </div>
  );
}
