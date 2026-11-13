// Geteilte Blöcke: Blöcke mit derselben `id` (auf einer oder mehreren Seiten) sind derselbe Block –
// gleicher Inhalt, gleiches Template, gleiche Unterblöcke. Jede Seite trägt den vollständigen Block;
// diese Helfer halten die Stellen gleich. Sie ändern nur den INHALT bestehender Stellen, nie deren
// Anzahl oder Position (Löschen/Einfügen bleibt Sache der einzelnen Stelle). `hidden` gilt je Stelle.

const clone = (v) => JSON.parse(JSON.stringify(v));
const sig = (b) => { const { hidden, ...rest } = b; return JSON.stringify(rest); };

// Alle Stellen je ID: Map id -> [block, ...]
export function placementsById(blocks, map = new Map()) {
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b || typeof b !== 'object') continue;
    if (b.id) map.set(b.id, [...(map.get(b.id) || []), b]);
    placementsById(b.children, map);
  }
  return map;
}

// Welche Blöcke in `after` wurden gegenüber `before` (selbe Seite, vorheriger Stand) inhaltlich geändert?
// -> Map id -> geänderter Block. Neue IDs (nicht in before) zählen nicht.
export function findSharedChanges(before, after) {
  const prev = placementsById(before);
  const changes = new Map();
  for (const [id, list] of placementsById(after)) {
    const old = prev.get(id);
    if (!old) continue;
    const olds = new Set(old.map(sig));
    const changed = list.find((b) => !olds.has(sig(b)));
    if (changed) changes.set(id, changed);
  }
  return changes;
}

// Schreibt die Änderungen in alle Stellen mit derselben ID. -> { blocks, changed } (blocks ist eine Kopie)
export function applyShared(blocks, changes) {
  let changed = false;
  const walk = (list) => (Array.isArray(list) ? list : []).map((b) => {
    if (!b || typeof b !== 'object') return b;
    const src = b.id && changes.get(b.id);
    if (src) {
      if (sig(src) === sig(b)) return b;
      changed = true;
      const next = clone(src);
      if (b.hidden === undefined) delete next.hidden; else next.hidden = b.hidden;
      return next;
    }
    return Array.isArray(b.children) ? { ...b, children: walk(b.children) } : b;
  });
  const out = walk(blocks);
  return { blocks: changed ? out : blocks, changed };
}

// Wie oft kommt jede ID im Seitenbaum vor? (`pages` = Baum inkl. children, optional `extraBlocks` = ungespeicherter Stand)
export function countPlacements(pages, extraBlocks = null, skipPageId = null) {
  const counts = new Map();
  const add = (blocks) => { for (const [id, l] of placementsById(blocks)) counts.set(id, (counts.get(id) || 0) + l.length); };
  const walk = (list) => (Array.isArray(list) ? list : []).forEach((p) => { if (p && String(p.id) !== String(skipPageId)) add(p.blocks); walk(p && p.children); });
  walk(pages);
  if (extraBlocks) add(extraBlocks);
  return counts;
}

// Sucht einen Block per ID: zuerst in `blocks` (aktuelle Seite), dann im Seitenbaum. -> Block oder null
export function findBlockById(id, blocks, pages) {
  const own = placementsById(blocks).get(id);
  if (own) return own[0];
  const hit = (list) => {
    for (const p of Array.isArray(list) ? list : []) {
      const l = placementsById(p && p.blocks).get(id);
      if (l) return l[0];
      const deeper = hit(p && p.children);
      if (deeper) return deeper;
    }
    return null;
  };
  return hit(pages);
}

// Alle Blöcke (mit Seitentitel) als Auswahlliste für den Picker.
export function listBlocks(pages, blocks, pageTitle, skipPageId = null) {
  const out = [];
  const add = (list, title) => (Array.isArray(list) ? list : []).forEach((b) => {
    if (b && b.id) out.push({ id: b.id, label: `${title}: ${b.template || b.type || 'Block'}` });
    add(b && b.children, title);
  });
  const walk = (list) => (Array.isArray(list) ? list : []).forEach((p) => { if (p && String(p.id) !== String(skipPageId)) add(p.blocks, p.title || p.slug || ''); walk(p && p.children); });
  add(blocks, pageTitle || 'Diese Seite');
  walk(pages);
  return out;
}
