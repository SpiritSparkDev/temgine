// Leitet aus dem rohen Formular-HTML eines Kontaktformulars ab, welche Felder
// ein Besucher ausfüllt — es gibt keine strukturierte Feldliste (siehe
// lib/templateStore.js), Admins schreiben <input name="..."> etc. direkt ins
// Template. Diese Namen sind exakt die Keys, die /api/contact als Mustache-
// Kontext bekommt, also auch exakt die Platzhalter, die in einer
// E-Mail-Vorlage per {{name}} verwendet werden können.

const FIELD_TAG_RE = /<(input|textarea|select)\b([^>]*)>/gi;
const NAME_ATTR_RE = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const TYPE_ATTR_RE = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const PLACEHOLDER_ATTR_RE = /\bplaceholder\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

const SKIP_NAMES = new Set([
  'altcha', 'captcha', 'hcaptcha', 'g-recaptcha-response',
  'recaptcha', 'csrf', 'csrfToken', '_csrf', '_method', '_cftemplate',
]);
const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset']);

function toLabel(key) {
  const cleaned = String(key || '')
    .replace(/\[\]$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Feld';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function extractContactFormFields(html) {
  const code = String(html || '');
  const seen = new Map();
  let match;
  FIELD_TAG_RE.lastIndex = 0;
  while ((match = FIELD_TAG_RE.exec(code))) {
    const [, tag, attrs] = match;
    const nameMatch = NAME_ATTR_RE.exec(attrs);
    const name = (nameMatch ? (nameMatch[1] ?? nameMatch[2]) : '').trim().replace(/\[\]$/, '');
    if (!name || SKIP_NAMES.has(name.toLowerCase()) || seen.has(name)) continue;

    const typeMatch = TYPE_ATTR_RE.exec(attrs);
    const rawType = (typeMatch ? (typeMatch[1] ?? typeMatch[2]) : '').toLowerCase();
    if (SKIP_TYPES.has(rawType)) continue;

    const tagLower = tag.toLowerCase();
    const type = tagLower === 'textarea' ? 'textarea' : tagLower === 'select' ? 'select' : (rawType || 'text');

    const placeholderMatch = PLACEHOLDER_ATTR_RE.exec(attrs);
    const placeholder = placeholderMatch ? (placeholderMatch[1] ?? placeholderMatch[2]) : '';

    seen.set(name, { name, label: placeholder || toLabel(name), type });
  }
  return Array.from(seen.values());
}
