// Reine Hilfsfunktionen für das Shop-Produktformular (Euro/Prozent <-> Cent/bp, Payload nach Vertrag).
// Bewusst ohne Abhängigkeit zu lib/shop/*; das Backend validiert zusätzlich.

export const SKU_RE = /^[A-Za-z0-9._-]{1,40}$/;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const IMAGE_RE = /^\/uploads\/[A-Za-z0-9._/-]{1,200}$/;

// '24,90' | '24.9' | '24' -> Cent; '' -> null; ungültig -> NaN
export function parseEuroToCents(input) {
  const s = String(input ?? '').trim();
  if (s === '') return null;
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return NaN;
  return parseInt(m[1], 10) * 100 + parseInt((m[2] || '').padEnd(2, '0') || '0', 10);
}

export function centsToEuro(cents) {
  if (cents == null) return '';
  const c = Math.abs(cents);
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`;
}

// '7' | '7,5' -> Hundertstel-Prozent (700 / 750); '' -> null; ungültig -> NaN
export function parsePercentToBp(input) {
  const s = String(input ?? '').trim().replace(/\s*%$/, '');
  if (s === '') return null;
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return NaN;
  return parseInt(m[1], 10) * 100 + parseInt((m[2] || '').padEnd(2, '0') || '0', 10);
}

export function bpToPercent(bp) {
  if (bp == null) return '';
  return bp % 100 === 0 ? String(bp / 100) : String(bp / 100).replace('.', ',');
}

function parseIntOrNull(input) {
  const s = String(input ?? '').trim();
  if (s === '') return null;
  return /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
}

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

export function emptyFormat() {
  return { key: nextKey(), id: undefined, sku: '', label: '', price: '', tax: '', weight: '', stock: '', digital: false, tiers: [], bundle: [] };
}

export const emptyTier = () => ({ key: nextKey(), minQty: '', price: '' });
export const emptyBundleItem = () => ({ key: nextKey(), sku: '', qty: '1' });

export const TRANSLATION_FIELDS = [['title', 'Titel', 150], ['subtitle', 'Untertitel', 120], ['shortText', 'Kurztext', 300], ['description', 'Beschreibung', 10000]];
const emptyEn = () => ({ title: '', subtitle: '', shortText: '', description: '' });

export function emptyForm() {
  return {
    id: undefined, updatedAt: undefined, slug: '', title: '', category: '', subtitle: '', shortText: '', description: '',
    images: [], active: true, sortOrder: 0, formats: [emptyFormat()], related: [], en: emptyEn(),
  };
}

export function productToForm(p) {
  return {
    id: p.id, updatedAt: p.updatedAt, slug: p.slug || '', title: p.title || '', category: p.category || '',
    subtitle: p.subtitle || '', shortText: p.shortText || '', description: p.description || '',
    images: [...(p.images || [])], active: !!p.active, sortOrder: p.sortOrder ?? 0,
    formats: (p.formats || []).map((f) => ({
      key: nextKey(), id: f.id, sku: f.sku || '', label: f.label || '', price: centsToEuro(f.priceCents),
      tax: bpToPercent(f.taxRateBp), weight: f.weightG == null ? '' : String(f.weightG),
      stock: f.stock == null ? '' : String(f.stock), digital: !!f.digital,
      tiers: (f.priceTiers || []).map((t) => ({ key: nextKey(), minQty: String(t.minQty), price: centsToEuro(t.priceCents) })),
      bundle: (f.bundleItems || []).map((b) => ({ key: nextKey(), sku: b.sku || '', qty: String(b.qty) })),
    })),
    related: [...(p.related || [])],
    en: { ...emptyEn(), ...Object.fromEntries(Object.entries(p.translations?.en || {}).map(([k, v]) => [k, v || ''])) },
  };
}

// Liefert { payload, errors }. Bei errors.length > 0 wird nichts gesendet.
export function formToPayload(form) {
  const errors = [];
  const title = form.title.trim();
  if (!title) errors.push('Titel ist erforderlich.');
  else if (title.length > 150) errors.push('Titel darf höchstens 150 Zeichen lang sein.');
  const slug = form.slug.trim();
  if (slug && (slug.length > 80 || !SLUG_RE.test(slug))) errors.push('Slug darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten (max. 80).');
  [['Kategorie', form.category, 80], ['Untertitel', form.subtitle, 120], ['Kurztext', form.shortText, 300], ['Beschreibung', form.description, 10000]]
    .forEach(([n, v, max]) => { if (v.length > max) errors.push(`${n} darf höchstens ${max} Zeichen lang sein.`); });
  if (form.images.length > 10) errors.push('Höchstens 10 Bilder.');
  if (form.images.some((u) => !IMAGE_RE.test(u) || u.includes('..'))) errors.push('Bilder müssen /uploads/…-Pfade sein.');

  const seen = new Set();
  const formats = form.formats.map((f, i) => {
    const n = `Format ${i + 1}`;
    const sku = f.sku.trim();
    const label = f.label.trim();
    if (!SKU_RE.test(sku)) errors.push(`${n}: SKU ungültig (erlaubt: Buchstaben, Ziffern, . _ -, max. 40).`);
    else if (seen.has(sku)) errors.push(`${n}: SKU „${sku}“ kommt doppelt vor.`);
    seen.add(sku);
    if (!label) errors.push(`${n}: Bezeichnung ist erforderlich.`);
    else if (label.length > 60) errors.push(`${n}: Bezeichnung darf höchstens 60 Zeichen lang sein.`);
    const priceCents = parseEuroToCents(f.price);
    if (Number.isNaN(priceCents) || (priceCents != null && priceCents > 999999)) errors.push(`${n}: Preis ungültig (z. B. 24,90; max. 9999,99).`);
    const taxRateBp = parsePercentToBp(f.tax);
    if (Number.isNaN(taxRateBp) || (taxRateBp != null && taxRateBp > 10000)) errors.push(`${n}: MwSt ungültig (0–100 %).`);
    const weightG = f.digital ? null : parseIntOrNull(f.weight);
    if (Number.isNaN(weightG) || (weightG != null && weightG > 1000000)) errors.push(`${n}: Gewicht ungültig (ganze Gramm).`);
    const stock = parseIntOrNull(f.stock);
    if (Number.isNaN(stock) || (stock != null && stock > 1000000)) errors.push(`${n}: Bestand ungültig (ganze Zahl oder leer = unbegrenzt).`);
    const bundleItems = [];
    const bseen = new Set();
    (f.bundle || []).forEach((b, j) => {
      const m = `${n}, Bestandteil ${j + 1}`;
      const bsku = b.sku.trim();
      const qty = parseIntOrNull(b.qty);
      if (!SKU_RE.test(bsku)) errors.push(`${m}: SKU wählen.`);
      else if (bsku === sku) errors.push(`${m}: Ein Bündel darf sich nicht selbst enthalten.`);
      else if (bseen.has(bsku)) errors.push(`${m}: SKU „${bsku}“ kommt mehrfach vor.`);
      bseen.add(bsku);
      if (qty == null || Number.isNaN(qty) || qty < 1 || qty > 99) errors.push(`${m}: Menge muss eine ganze Zahl von 1 bis 99 sein.`);
      bundleItems.push({ sku: bsku, qty });
    });
    if (bundleItems.length > 10) errors.push(`${n}: Höchstens 10 Bündel-Bestandteile.`);
    const isBundle = bundleItems.length > 0;
    if (isBundle && !(priceCents > 0 && taxRateBp != null)) errors.push(`${n}: Ein Bündel braucht Preis und MwSt.`);

    const priceTiers = [];
    let lastQty = 1;
    (f.tiers || []).forEach((t, j) => {
      const m = `${n}, Staffel ${j + 1}`;
      const minQty = parseIntOrNull(t.minQty);
      const price = parseEuroToCents(t.price);
      if (minQty == null || Number.isNaN(minQty) || minQty < 2 || minQty > 99) errors.push(`${m}: Ab-Menge muss eine ganze Zahl von 2 bis 99 sein.`);
      else if (minQty <= lastQty) errors.push(`${m}: Ab-Mengen müssen eindeutig und aufsteigend sein.`);
      else lastQty = minQty;
      if (price == null || Number.isNaN(price) || price <= 0) errors.push(`${m}: Preis ungültig (größer 0, z. B. 19,90).`);
      else if (priceCents == null || Number.isNaN(priceCents)) errors.push(`${m}: Staffelpreise brauchen einen Basispreis.`);
      else if (price >= priceCents) errors.push(`${m}: Staffelpreis muss kleiner als der Basispreis sein.`);
      priceTiers.push({ minQty, priceCents: price });
    });
    if (priceTiers.length > 5) errors.push(`${n}: Höchstens 5 Staffelpreise.`);

    const out = { sku, label, priceCents, taxRateBp, weightG: isBundle ? null : weightG, stock: isBundle ? null : stock, digital: isBundle ? false : !!f.digital, priceTiers, bundleItems, sortOrder: i };
    return f.id !== undefined ? { id: f.id, ...out } : out;
  });
  if (formats.length === 0) errors.push('Mindestens ein Format ist erforderlich.');

  if (form.related.length > 6) errors.push('Höchstens 6 Empfehlungen.');
  const en = {};
  TRANSLATION_FIELDS.forEach(([k, label, max]) => {
    const v = (form.en?.[k] || '').trim();
    if (v.length > max) errors.push(`Übersetzung EN: ${label} darf höchstens ${max} Zeichen lang sein.`);
    if (v) en[k] = v;
  });

  const payload = {
    slug, title, category: form.category.trim(), subtitle: form.subtitle.trim(), shortText: form.shortText.trim(),
    description: form.description, images: form.images, active: !!form.active, sortOrder: form.sortOrder ?? 0, formats,
    related: form.related, translations: Object.keys(en).length ? { en } : {},
  };
  if (form.id !== undefined) { payload.id = form.id; payload.updatedAt = form.updatedAt; }
  return { payload, errors };
}
