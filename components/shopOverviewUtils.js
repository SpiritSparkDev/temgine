// Reine Hilfen für die Shop-Übersicht (Kennzahlen, Balkendiagramm).
import { formatMoney } from '../lib/shop/money';

export const STATUS_ORDER = ['PENDING', 'PAID', 'SHIPPED', 'REFUNDED', 'FAILED', 'CANCELLED'];
export const STATUS_NAMES = {
  PENDING: 'Offen', PAID: 'Bezahlt', SHIPPED: 'Versendet', REFUNDED: 'Erstattet', FAILED: 'Fehlgeschlagen', CANCELLED: 'Storniert',
};

/** Kacheln aus der Antwort von /api/shop/reports/overview */
export function buildTiles(o) {
  const cur = o?.currency || 'EUR';
  const m = (c) => formatMoney(c, cur, 'de');
  return [
    { key: 'last7', label: 'Umsatz 7 Tage', value: m(o?.revenue?.last7) },
    { key: 'last30', label: 'Umsatz 30 Tage', value: m(o?.revenue?.last30) },
    { key: 'total', label: 'Umsatz gesamt', value: m(o?.revenue?.total) },
    { key: 'open', label: 'Offene Bestellungen', value: String(o?.orders?.open || 0) },
    { key: 'avg', label: 'Ø Bestellwert', value: m(o?.averageOrderCents) },
    { key: 'refunded', label: 'Erstattet', value: m(o?.refundedCents) },
  ];
}

/** Bestellungen je Status in fester Reihenfolge (nur vorhandene Status, unbekannte hinten) */
export function statusRows(byStatus) {
  const src = byStatus || {};
  const keys = [...STATUS_ORDER.filter((k) => k in src), ...Object.keys(src).filter((k) => !STATUS_ORDER.includes(k))];
  return keys.map((k) => ({ status: k, label: STATUS_NAMES[k] || k, count: src[k] }));
}

/** Balken für das SVG: Höhe relativ zum Maximum (min. 1 px bei Umsatz > 0) */
export function barGeometry(perDay, { width = 600, height = 160, gap = 2 } = {}) {
  const days = perDay || [];
  const max = Math.max(0, ...days.map((d) => d.revenueCents || 0));
  const bw = days.length ? (width - gap * (days.length - 1)) / days.length : 0;
  return days.map((d, i) => {
    const v = d.revenueCents || 0;
    const h = max > 0 && v > 0 ? Math.max(1, Math.round((v / max) * height)) : 0;
    return { date: d.date, count: d.count, revenueCents: v, x: i * (bw + gap), y: height - h, width: bw, height: h };
  });
}

/** '2026-03-05' -> '05.03.' */
export function shortDate(key) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(key || '');
  return m ? `${m[2]}.${m[1]}.` : String(key || '');
}
