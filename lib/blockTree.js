// Reine Hilfslogik für die Block-Gliederung des Fokus-Editors (kein React, keine Abhängigkeiten).
// Pfade sind Strings wie "2" oder "2.1" (Index-Kette über block.children), siehe PageEditor.js.

const stripTags = (s) => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export const parsePath = (p) => String(p).split('.').map((n) => parseInt(n, 10));

export function getBlockAt(blocks, path) {
  if (path === '' || path == null) return null;
  let cur = blocks;
  const parts = parsePath(path);
  for (let i = 0; i < parts.length; i++) {
    if (!Array.isArray(cur) || !(parts[i] >= 0) || parts[i] >= cur.length) return null;
    if (i === parts.length - 1) return cur[parts[i]];
    cur = cur[parts[i]].children;
  }
  return null;
}

// "2.1.0" -> ["2", "2.1"] (ohne den Pfad selbst)
export function ancestorPaths(path) {
  const parts = String(path).split('.');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('.'));
}

export const isSelfOrDescendant = (ancestor, path) =>
  path === ancestor || String(path).startsWith(`${ancestor}.`);

// Gibt das Geschwister-Array (in der Kopie) und den Index für einen Pfad zurück.
function locate(root, parts) {
  let arr = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const node = arr[parts[i]];
    if (!node) return null;
    arr = node.children = node.children || [];
  }
  return { arr, idx: parts[parts.length - 1] };
}

// position: 'before' | 'after' | 'inside' (inside = als letztes Kind von `to`)
export function canMove(blocks, from, to, position) {
  if (!['before', 'after', 'inside'].includes(position)) return false;
  if (!getBlockAt(blocks, from) || !getBlockAt(blocks, to)) return false;
  return !isSelfOrDescendant(String(from), String(to)); // keine Zyklen: nicht in sich selbst/Nachkommen
}

// Verschiebt einen Block; liefert { blocks, path } (neuer Pfad des Blocks) oder null
// bei ungültigem Zug bzw. wenn sich nichts ändern würde. Arbeitet auf einer Kopie.
export function moveBlock(blocks, from, to, position) {
  from = String(from); to = String(to);
  if (!canMove(blocks, from, to, position)) return null;
  const copy = JSON.parse(JSON.stringify(blocks));
  const fp = parsePath(from);
  const tp = parsePath(to);
  const src = locate(copy, fp);
  const [node] = src.arr.splice(src.idx, 1);
  // Entfernen verschiebt spätere Geschwister auf Ebene des Quell-Index nach oben
  const k = fp.length - 1;
  if (tp.length > k && tp[k] > fp[k] && tp.slice(0, k).join('.') === fp.slice(0, k).join('.')) tp[k] -= 1;
  let newPath;
  if (position === 'inside') {
    const target = locate(copy, tp);
    const children = target.arr[target.idx].children = target.arr[target.idx].children || [];
    children.push(node);
    newPath = [...tp, children.length - 1];
  } else {
    const target = locate(copy, tp);
    const at = position === 'before' ? target.idx : target.idx + 1;
    target.arr.splice(at, 0, node);
    newPath = [...tp.slice(0, -1), at];
  }
  const path = newPath.join('.');
  if (path === from) return null;
  return { blocks: copy, path };
}

// Kopiert einen Block (samt Kindern) direkt hinter das Original.
export function duplicateBlock(blocks, path) {
  if (!getBlockAt(blocks, path)) return null;
  const copy = JSON.parse(JSON.stringify(blocks));
  const parts = parsePath(path);
  const loc = locate(copy, parts);
  loc.arr.splice(loc.idx + 1, 0, JSON.parse(JSON.stringify(loc.arr[loc.idx])));
  return { blocks: copy, path: [...parts.slice(0, -1), loc.idx + 1].join('.') };
}

export function blockLabel(block) {
  if (!block) return '?';
  const p = block.props || {};
  if (block.type === 'blog-channel') return `Kanal: ${p.channelSlug || '–'}`;
  if (block.type === 'navigation') return `Nav: ${p.navigationId || '–'}`;
  if (block.type === 'global-page') return 'Widget';
  return block.template || block.type || 'Block';
}

// Kurzvorschau: erster nicht-leerer Text-Wert (ohne URLs/Bilder), max. `max` Zeichen.
export function blockSummary(block, max = 80) {
  const props = (block && block.props) || {};
  for (const v of Object.values(props)) {
    if (typeof v !== 'string') continue;
    const t = stripTags(v);
    if (t && !/^(https?:)?\/|^data:/.test(t)) return t.length > max ? `${t.slice(0, max)}…` : t;
  }
  return '';
}

// Flache Zeilenliste für die Baumdarstellung. `collapsed`: Set von Pfaden, deren Kinder verborgen sind.
// `visible`: optionales Set erlaubter Pfade (Suchfilter). guides[i] = true -> senkrechte Linie auf Ebene i.
export function flattenTree(blocks, collapsed = new Set(), visible = null) {
  const rows = [];
  const walk = (items, prefix, guides) => {
    const shown = items.map((b, i) => ({ b, i, path: prefix ? `${prefix}.${i}` : String(i) }))
      .filter(({ path }) => !visible || visible.has(path));
    shown.forEach(({ b, path }, n) => {
      const kids = Array.isArray(b.children) ? b.children : [];
      const isLast = n === shown.length - 1;
      const hasChildren = kids.some((_, ci) => !visible || visible.has(`${path}.${ci}`));
      const expanded = hasChildren && (!!visible || !collapsed.has(path));
      rows.push({ path, block: b, depth: guides.length, guides, isLast, hasChildren, expanded });
      if (expanded) walk(kids, path, [...guides, !isLast]);
    });
  };
  walk(Array.isArray(blocks) ? blocks : [], '', []);
  return rows;
}

// Suchfilter: Pfade, deren eigener Text passt, plus alle Vorfahren. null = kein Filter.
// textFn(block) liefert den durchsuchbaren Text (z. B. blockSearchText).
export function filterPaths(blocks, query, textFn) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;
  const out = new Set();
  const walk = (items, prefix) => {
    items.forEach((b, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      if (textFn({ ...b, children: undefined }).includes(q)) {
        out.add(path);
        ancestorPaths(path).forEach((a) => out.add(a));
      }
      if (Array.isArray(b.children)) walk(b.children, path);
    });
  };
  walk(Array.isArray(blocks) ? blocks : [], '');
  return out;
}
