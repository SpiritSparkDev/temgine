// Reine Hilfen für die Gutschein-Verwaltung im Admin (Eingabe <-> Payload nach Vertrag, lesbare Anzeige).
import { parseEuroToCents, centsToEuro, parsePercentToBp, bpToPercent } from './shopFormUtils';

export const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

export function emptyCouponForm() {
  return { id: undefined, code: '', type: 'PERCENT', value: '', minOrder: '', maxUses: '', validFrom: '', validUntil: '', active: true, note: '' };
}

const day = (iso) => (iso ? String(iso).slice(0, 10) : '');

export function couponToForm(c) {
  return {
    id: c.id,
    code: c.code || '',
    type: c.type === 'FIXED' ? 'FIXED' : 'PERCENT',
    value: c.type === 'FIXED' ? centsToEuro(c.value) : bpToPercent(c.value),
    minOrder: centsToEuro(c.minOrderCents),
    maxUses: c.maxUses == null ? '' : String(c.maxUses),
    validFrom: day(c.validFrom),
    validUntil: day(c.validUntil),
    active: c.active !== false,
    note: c.note || '',
  };
}

// Liefert { payload, errors }. Bei errors.length > 0 wird nichts gesendet. Der Code wird nur beim Anlegen (id fehlt) gesendet.
export function formToPayload(form) {
  const errors = [];
  const isNew = form.id === undefined;
  const code = form.code.trim().toUpperCase();
  if (isNew && !CODE_RE.test(code)) errors.push('Code muss 3–32 Zeichen lang sein (A–Z, 0–9, _ und -).');

  let value;
  if (form.type === 'PERCENT') {
    value = parsePercentToBp(form.value);
    if (value == null || Number.isNaN(value) || value < 1 || value > 10000) errors.push('Prozentwert ungültig (z. B. 10 oder 7,5; mehr als 0 bis 100 %).');
  } else {
    value = parseEuroToCents(form.value);
    if (value == null || Number.isNaN(value) || value < 1 || value > 9999999) errors.push('Betrag ungültig (z. B. 5,00; mehr als 0 €).');
  }

  const minOrderCents = parseEuroToCents(form.minOrder);
  if (Number.isNaN(minOrderCents) || (minOrderCents != null && minOrderCents > 9999999)) errors.push('Mindestbestellwert ungültig (z. B. 20,00 oder leer).');

  const mu = String(form.maxUses ?? '').trim();
  let maxUses = null;
  if (mu !== '') {
    maxUses = /^\d+$/.test(mu) ? parseInt(mu, 10) : NaN;
    if (Number.isNaN(maxUses) || maxUses < 1 || maxUses > 1000000) errors.push('Maximale Einlösungen: ganze Zahl von 1 bis 1000000 oder leer.');
  }

  if (form.validFrom && form.validUntil && form.validUntil < form.validFrom) errors.push('„Gültig bis“ liegt vor „Gültig ab“.');
  const note = form.note.trim();
  if (note.length > 200) errors.push('Notiz darf höchstens 200 Zeichen lang sein.');

  const payload = {
    type: form.type, value, minOrderCents, maxUses,
    validFrom: form.validFrom ? `${form.validFrom}T00:00:00.000Z` : null,
    // Enddatum gilt inklusive: bis Tagesende (UTC).
    validUntil: form.validUntil ? `${form.validUntil}T23:59:59.999Z` : null,
    active: !!form.active, note: note || null,
  };
  if (isNew) payload.code = code;
  return { payload, errors };
}

export const couponValueText = (c) => (c.type === 'FIXED' ? `${centsToEuro(c.value)} €` : `${bpToPercent(c.value)} %`);
export const couponMinOrderText = (c) => (c.minOrderCents == null ? '–' : `${centsToEuro(c.minOrderCents)} €`);
export const couponUsesText = (c) => `${c.usedCount ?? 0}/${c.maxUses == null ? '∞' : c.maxUses}`;

const de = (iso) => { const [y, m, d] = day(iso).split('-'); return `${d}.${m}.${y}`; };
export function couponValidityText(c) {
  if (!c.validFrom && !c.validUntil) return 'unbegrenzt';
  if (c.validFrom && c.validUntil) return `${de(c.validFrom)} – ${de(c.validUntil)}`;
  return c.validFrom ? `ab ${de(c.validFrom)}` : `bis ${de(c.validUntil)}`;
}
