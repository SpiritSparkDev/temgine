// Hilfsfunktionen für Block-Suche und Revisions-Diff (ohne Abhängigkeiten).

const stripTags = (s) => String(s).replace(/<[^>]*>/g, ' ');

// Alle Text-Werte eines Blocks (inkl. verschachtelter Blöcke) in Kleinschreibung.
export function blockSearchText(block) {
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'string') out.push(stripTags(v));
    else if (typeof v === 'number') out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object') Object.values(v).forEach(walk);
  };
  if (block) { out.push(block.template || '', block.type || ''); walk(block.props); walk(block.children); }
  return out.join(' ').toLowerCase();
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const label = (b) => (b && (b.template || b.type)) || '?';

// Feld-Diff zweier Block-Objekte: [{ key, old, new }]
export function diffFields(a, b) {
  const pa = (a && a.props) || {};
  const pb = (b && b.props) || {};
  const out = [];
  if (label(a) !== label(b)) out.push({ key: 'Template', old: label(a), new: label(b) });
  for (const key of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
    if (!same(pa[key], pb[key])) out.push({ key, old: pa[key], new: pb[key] });
  }
  if (!same(a && a.children, b && b.children)) out.push({ key: 'Unterblöcke', old: (a?.children || []).length, new: (b?.children || []).length });
  return out;
}

// Block-Diff: gleiche Blöcke werden über id (falls vorhanden), sonst über Position gepaart.
// Ergebnis: [{ status: 'added'|'removed'|'changed'|'same', index, label, fields }]
export function diffBlocks(oldBlocks, newBlocks) {
  const a = Array.isArray(oldBlocks) ? oldBlocks : [];
  const b = Array.isArray(newBlocks) ? newBlocks : [];
  const byId = new Map(a.filter((x) => x && x.id != null).map((x) => [x.id, x]));
  const usedOld = new Set();
  const rows = b.map((nb, i) => {
    const ob = nb && nb.id != null && byId.has(nb.id) ? byId.get(nb.id) : (nb && nb.id != null ? undefined : a[i]);
    if (!ob) return { status: 'added', index: i, label: label(nb), fields: [] };
    usedOld.add(ob);
    const fields = diffFields(ob, nb);
    return { status: fields.length || !same(ob, nb) ? 'changed' : 'same', index: i, label: label(nb), fields };
  });
  a.forEach((ob, i) => { if (!usedOld.has(ob)) rows.push({ status: 'removed', index: i, label: label(ob), fields: [] }); });
  return rows;
}
