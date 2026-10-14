// Reine Hilfen für die Bestellungen im Shop-Admin (Anzeige und Query-Aufbau).

export const STATUS_LABELS = {
  PENDING: 'Offen', PAID: 'Bezahlt', SHIPPED: 'Versendet', FAILED: 'Fehlgeschlagen', CANCELLED: 'Storniert', REFUNDED: 'Erstattet',
};

export const STATUS_FILTERS = [
  { value: '', label: 'Alle' },
  { value: 'PENDING', label: 'Offen' },
  { value: 'PAID', label: 'Bezahlt' },
  { value: 'SHIPPED', label: 'Versendet' },
  { value: 'REFUNDED', label: 'Erstattet' },
  { value: 'CANCELLED', label: 'Storniert' },
  { value: 'FAILED', label: 'Fehlgeschlagen' },
];

export const PAYMENT_LABELS = { PENDING: 'Offen', PAID: 'Bezahlt', FAILED: 'Fehlgeschlagen', CANCELLED: 'Abgebrochen' };

export const EVENT_LABELS = {
  CREATED: 'Angelegt', PAID: 'Bezahlt', FAILED: 'Fehlgeschlagen', CANCELLED: 'Storniert', SHIPPED: 'Versendet',
  TRACKING: 'Sendung', NOTE: 'Notiz', REFUND: 'Erstattung', RETURN: 'Rückgabe', DOWNLOAD: 'Download', INVOICE: 'Rechnung',
  MAIL: 'E-Mail', MAIL_ERROR: 'E-Mail-Fehler', RESERVATION: 'Reservierung', STOCK: 'Bestand', COUPON: 'Gutschein',
};

export const statusLabel = (s) => STATUS_LABELS[s] || s || '';
export const eventLabel = (t) => EVENT_LABELS[t] || t || '';

const fmtCache = {};
export function formatCents(cents, currency = 'EUR') {
  if (cents == null) return '';
  const cur = currency || 'EUR';
  if (!fmtCache[cur]) {
    try { fmtCache[cur] = new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur }); } catch { fmtCache[cur] = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }); }
  }
  return fmtCache[cur].format(cents / 100);
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export function buildOrdersQuery({ status, q, page, from, to } = {}) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (q && q.trim()) p.set('q', q.trim());
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  p.set('page', String(page || 1));
  return `?${p.toString()}`;
}

/** Link auf den CSV-Export mit den aktuellen Filtern (ohne Seite/Suche); detail = 'items' liefert Positionen. */
export function buildExportUrl({ status, from, to, detail } = {}) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  if (detail) p.set('detail', detail);
  const s = p.toString();
  return `/api/shop/orders/export${s ? `?${s}` : ''}`;
}

// 700 -> '7 %', 1950 -> '19,5 %'
export const formatRate = (bp) => `${String(bp / 100).replace('.', ',')} %`;

/** Rechte im Browser, gespiegelt aus PERMISSIONS (lib/auth.js ist serverseitig). Die API prüft immer selbst. */
export function rightsFor(role) {
  return { edit: role === 'ADMIN' || role === 'MODERATOR', refund: role === 'ADMIN' };
}

/** '12,50' | '12.5' | '12' -> Cent; ungültig -> null. */
export function parseEuroToCents(input) {
  const s = String(input ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [e, c = ''] = s.split('.');
  return Number(e) * 100 + Number(c.padEnd(2, '0'));
}

export const centsToInput = (cents) => (cents == null ? '' : (cents / 100).toFixed(2).replace('.', ','));

export const maxRefundCents = (order) => Math.max(0, (order?.totalCents || 0) - (order?.refundedCents || 0));
export const canRefundOrder = (order, rights) => !!rights?.refund && ['PAID', 'SHIPPED'].includes(order?.status) && maxRefundCents(order) > 0;
export const canCancelOrder = (order, rights) => !!rights?.edit && order?.status === 'PENDING';
export const hasInvoice = (order) => ['PAID', 'SHIPPED', 'REFUNDED'].includes(order?.status);

/** Formularwerte -> Request-Body der Sendungsdaten; leere Felder entfallen (bei ship), mit all=true bleiben sie (PUT löscht). */
export function trackingBody({ carrier, trackingNumber, trackingUrl } = {}, all = false) {
  const b = { carrier: (carrier || '').trim(), trackingNumber: (trackingNumber || '').trim(), trackingUrl: (trackingUrl || '').trim() };
  if (all) return b;
  return Object.fromEntries(Object.entries(b).filter(([, v]) => v));
}

/** Prüft den Erstattungsbetrag; liefert { cents } oder { error }. */
export function validateRefundAmount(input, order) {
  const cents = parseEuroToCents(input);
  const max = maxRefundCents(order);
  if (cents == null || cents <= 0) return { error: 'Bitte einen gültigen Betrag eingeben' };
  if (cents > max) return { error: `Der Betrag darf höchstens ${formatCents(max, order?.currency)} betragen` };
  return { cents };
}

export const sortEvents = (events) => [...(events || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
