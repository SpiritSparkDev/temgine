// Reine Hilfen für die Bestellungen im Shop-Admin (Anzeige und Query-Aufbau).

export const STATUS_LABELS = {
  PENDING: 'Offen', PAID: 'Bezahlt', SHIPPED: 'Versendet', FAILED: 'Fehlgeschlagen', CANCELLED: 'Storniert',
};

export const STATUS_FILTERS = [
  { value: '', label: 'Alle' },
  { value: 'PENDING', label: 'Offen' },
  { value: 'PAID', label: 'Bezahlt' },
  { value: 'SHIPPED', label: 'Versendet' },
  { value: 'FAILED', label: 'Fehlgeschlagen' },
];

export const PAYMENT_LABELS = { PENDING: 'Offen', PAID: 'Bezahlt', FAILED: 'Fehlgeschlagen', CANCELLED: 'Abgebrochen' };

export const statusLabel = (s) => STATUS_LABELS[s] || s || '';

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export function formatCents(cents) {
  return cents == null ? '' : eur.format(cents / 100);
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export function buildOrdersQuery({ status, q, page } = {}) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (q && q.trim()) p.set('q', q.trim());
  p.set('page', String(page || 1));
  return `?${p.toString()}`;
}

// 700 -> '7 %', 1950 -> '19,5 %'
export const formatRate = (bp) => `${String(bp / 100).replace('.', ',')} %`;
