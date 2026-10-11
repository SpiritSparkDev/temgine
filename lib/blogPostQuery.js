// Sortieren und Filtern von Kanal-Beiträgen — gemeinsam genutzt von der
// öffentlichen Kanal-API (Frontend), der Beitragsliste im Backend und den
// Kanal-Blöcken/-Platzhaltern in Templates.
//
// Sortierfelder: die festen Spalten (publishedAt, createdAt, updatedAt, title)
// oder ein beliebiges Template-Feld des Beitrags (templateData, z. B. „Beginn“).
// Werte im Format JJJJ-MM-TT… werden als Datum verglichen, Zahlen numerisch,
// alles andere alphabetisch (deutsch, Ziffern natürlich). Leere Werte stehen
// immer am Ende, unabhängig von der Richtung.

export const BUILTIN_SORT_FIELDS = [
  { value: 'publishedAt', label: 'Veröffentlichungsdatum' },
  { value: 'createdAt', label: 'Erstellungsdatum' },
  { value: 'updatedAt', label: 'Zuletzt bearbeitet' },
  { value: 'title', label: 'Titel' },
];

const BUILTIN = new Set(BUILTIN_SORT_FIELDS.map(f => f.value));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function postFieldValue(post, field) {
  if (!post || !field) return null;
  const raw = BUILTIN.has(field) ? post[field] : (post.templateData && post.templateData[field]) ?? post[field];
  if (raw === undefined || raw === null) return null;
  if (raw instanceof Date) return raw.toISOString();
  const s = String(raw).trim();
  return s === '' ? null : s;
}

function compareValues(a, b) {
  if (ISO_DATE.test(a) && ISO_DATE.test(b)) return a < b ? -1 : a > b ? 1 : 0;
  const na = Number(a); const nb = Number(b);
  if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, 'de', { numeric: true, sensitivity: 'base' });
}

// Heutiges Datum als JJJJ-MM-TT in deutscher Zeit (Termine „ab heute“).
export function todayIso(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now);
  } catch (e) {
    return now.toISOString().slice(0, 10);
  }
}

function parseFieldList(value) {
  if (Array.isArray(value)) return value.map(s => String(s).trim()).filter(Boolean);
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}

// Erster nicht-leere Wert aus einer Feldliste (z. B. „Ende,Beginn“: eintägige
// Termine ohne Ende zählen mit ihrem Beginn).
function firstValue(post, fields) {
  for (const f of fields) {
    const v = postFieldValue(post, f);
    if (v !== null) return v;
  }
  return null;
}

/**
 * @param {object[]} posts
 * @param {object} opts
 *   sort      Feldname (Standard publishedAt)
 *   dir       'asc' | 'desc' (Standard desc)
 *   upcoming  Feldliste — nur Beiträge, deren Datum ≥ heute ist
 *   past      Feldliste — nur Beiträge, deren Datum < heute ist
 *   archive   'exclude' (Standard) | 'only' | 'include'
 *   today     JJJJ-MM-TT (Tests)
 */
export function applyPostQuery(posts, opts = {}) {
  const sort = String(opts.sort || 'publishedAt').trim() || 'publishedAt';
  const dir = String(opts.dir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const archive = ['only', 'include'].includes(opts.archive) ? opts.archive : 'exclude';
  const today = opts.today || todayIso();
  const upcoming = parseFieldList(opts.upcoming);
  const past = parseFieldList(opts.past);

  let list = (posts || []).filter(Boolean);
  if (archive === 'exclude') list = list.filter(p => !p.archived);
  if (archive === 'only') list = list.filter(p => p.archived);
  if (upcoming.length) {
    list = list.filter(p => {
      const v = firstValue(p, upcoming);
      return v !== null && ISO_DATE.test(v) && v.slice(0, 10) >= today;
    });
  }
  if (past.length) {
    list = list.filter(p => {
      const v = firstValue(p, past);
      return v !== null && ISO_DATE.test(v) && v.slice(0, 10) < today;
    });
  }

  const sign = dir === 'asc' ? 1 : -1;
  return list
    .map((p, i) => ({ p, i, v: postFieldValue(p, sort) }))
    .sort((x, y) => {
      if (x.v === null && y.v === null) return x.i - y.i;
      if (x.v === null) return 1;
      if (y.v === null) return -1;
      return sign * compareValues(x.v, y.v) || x.i - y.i;
    })
    .map(x => x.p);
}

// Liest die Abfrage-Optionen aus Query-Parametern bzw. data-Attributen,
// mit den Standardwerten des Kanals als Rückfall.
export function postQueryFromParams(params = {}, channel = {}) {
  const pick = (k) => (params[k] !== undefined && params[k] !== null && String(params[k]).trim() !== '' ? String(params[k]).trim() : '');
  return {
    sort: pick('sort') || (channel && channel.sortField) || 'publishedAt',
    dir: pick('dir') || (channel && channel.sortDir) || 'desc',
    upcoming: pick('upcoming'),
    past: pick('past'),
    archive: pick('archive') || 'exclude',
  };
}

// Template-Feldnamen der Beiträge eines Kanals (für Sortier-Auswahllisten).
export function collectTemplateFieldNames(posts) {
  const names = new Set();
  for (const p of posts || []) {
    if (p && p.templateData && typeof p.templateData === 'object') {
      for (const k of Object.keys(p.templateData)) names.add(k);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'de'));
}

const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// Für jedes Datumsfeld (JJJJ-MM-TT…) eines Beitrags zusätzlich <Feld>_tag ("28"),
// <Feld>_monat ("Okt"), <Feld>_jahr ("2026") und <Feld>_datum ("28.10.2026") —
// Templates können Datumswerte sonst nicht formatieren.
export function withDateParts(post) {
  const out = { ...post };
  for (const [key, value] of Object.entries(post || {})) {
    if (typeof value !== 'string') continue;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!m) continue;
    out[`${key}_tag`] = String(parseInt(m[3], 10));
    out[`${key}_monat`] = MONTHS_DE[parseInt(m[2], 10) - 1] || '';
    out[`${key}_jahr`] = m[1];
    out[`${key}_datum`] = `${m[3]}.${m[2]}.${m[1]}`;
  }
  return out;
}
