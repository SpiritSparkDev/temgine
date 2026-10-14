// Reine Hilfen für die Rückgabe-Anfragen im Shop-Admin.

export const RETURN_LABELS = {
  NEW: 'Neu', APPROVED: 'Genehmigt', REJECTED: 'Abgelehnt', RECEIVED: 'Ware eingegangen', REFUNDED: 'Erstattet',
};

export const RETURN_FILTERS = [
  { value: '', label: 'Alle' },
  ...['NEW', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED'].map((value) => ({ value, label: RETURN_LABELS[value] })),
];

// Spiegel von TRANSITIONS in lib/shop/returns.js
export const RETURN_TRANSITIONS = {
  NEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['REFUNDED', 'REJECTED'],
  REFUNDED: [],
  REJECTED: [],
};

export const returnLabel = (s) => RETURN_LABELS[s] || s || '';
export const allowedTransitions = (s) => RETURN_TRANSITIONS[s] || [];

export function buildReturnsQuery({ status, page } = {}) {
  const p = new URLSearchParams();
  if (status) p.set('status', status);
  p.set('page', String(page || 1));
  return `?${p.toString()}`;
}

export function confirmText(from, to) {
  return `Status von „${returnLabel(from)}“ auf „${returnLabel(to)}“ ändern? Der Kunde wird per E-Mail informiert.`;
}
