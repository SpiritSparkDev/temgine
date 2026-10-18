/**
 * lib/templateStructure.js — Feld-Hierarchie eines Block-Templates (reine Logik, kein UI).
 * Spezifikation: docs/specs/template-field-hierarchy.md
 *
 * Feldmenge/-namen kommen exakt aus lib/templateParser.js (extractTemplateVariables,
 * extractTypedVariables, extractRepeaterBlocks); hier wird nur ihre DOM-Position bestimmt.
 */
import {
  extractTemplateVariables, extractTypedVariables, extractRepeaterBlocks, parseVarToken,
} from './templateParser';
import { getSectionProviders } from './sections';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const SEMANTIC = new Set(['section', 'article', 'header', 'footer', 'aside', 'figure', 'fieldset', 'nav', 'main']);
const CONTAINERS = new Set([...SEMANTIC, 'div', 'ul', 'ol', 'li']);
const HEADING = /^h[1-6]$/;
const ROW_TYPES = new Set(['text', 'url']);
const MAX_ROW = 3;
const ARRAYS = new Set(['blocks', 'images', 'features', 'links', 'columns', 'navItems']);
const GENERIC_CLASS = /^(container(-fluid)?|wrapper|row|col(-.*|umn)?|inner(-wrapper)?|content(-wrapper)?|grid|flex|wrap|clearfix|[dpm][trblxy]?-\S+)$/i;
// Rang einer Titelquelle (höher = aussagekräftiger), für das Verschmelzen von Wrapper + Kind
const RANK = { explicit: 5, 'data-label': 5, 'aria-label': 5, heading: 4, class: 3, id: 2, fallback: 1 };

const TOKEN = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|\{\{\{([^{}]*)\}\}\}|\{\{([^{}]*)\}\}|([^<{]+|[<{])/gi;

const clean = (s) => String(s || '').replace(/\{\{\{?[^{}]*\}?\}\}/g, '').replace(/\s+/g, ' ').trim();
const cut = (s) => s.slice(0, 40).trim();
const pretty = (s) => { const t = s.replace(/[-_]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

function parseAttrs(str) {
  const out = {};
  const re = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(str)) !== null) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

function makeLabel(frame) {
  const a = frame.attrs;
  const dl = cut(clean(a['data-label']));
  if (dl) return { label: dl, labelSource: 'data-label' };
  const al = cut(clean(a['aria-label']));
  if (al) return { label: al, labelSource: 'aria-label' };
  if (frame.heading) return { label: cut(frame.heading), labelSource: 'heading' };
  const cls = clean(a.class).split(' ').find((c) => c && !GENERIC_CLASS.test(c));
  if (cls) return { label: cut(pretty(cls)), labelSource: 'class' };
  const id = clean(a.id);
  if (id) return { label: cut(pretty(id)), labelSource: 'id' };
  return { label: 'Gruppe', labelSource: 'fallback' };
}

const groupNode = (frame) => ({
  kind: 'group',
  tag: frame.tag,
  semantic: SEMANTIC.has(frame.tag),
  id: clean(frame.attrs.id) || null,
  className: clean(frame.attrs.class) || null,
  ...makeLabel(frame),
  children: frame.children,
});

/** Phase 1: Tokenizer + Stack → Rohbaum (Gruppen unnormalisiert). */
function parse(code, fieldSet, repeaterSet) {
  const root = { tag: null, attrs: {}, children: [], heading: null };
  const stack = [root];
  const sections = []; // offene Mustache-Sektionen { name, inverted }
  const seen = new Set();
  const providers = Object.keys(getSectionProviders());
  let suppressUntil = null; // Schlusstag einer Repeater-/Provider-Sektion
  let suppressDepth = 0;
  let headingBuf = null;
  const top = () => stack[stack.length - 1];

  const emit = (node, key) => {
    if (seen.has(key)) return;
    seen.add(key);
    top().children.push(node);
  };
  const emitField = (raw) => {
    raw = raw.trim().replace(/^&\s*/, '');
    if (!raw || /navigation:|template:/.test(raw) || raw.startsWith('nav:')) return;
    const { name } = parseVarToken(raw);
    const o = sections.find((x) => !x.inverted); // wie extractTemplateVariables: äußerste #-Sektion bestimmt das Präfix
    const prefixed = o && !o.name.startsWith('if:') && !ARRAYS.has(o.name) ? `${o.name}.${name}` : null;
    const final = prefixed && fieldSet.has(prefixed) ? prefixed : fieldSet.has(name) ? name : null;
    if (final) emit({ kind: 'field', name: final }, `f:${final}`);
  };

  const mustache = (body) => {
    const t = body.trim();
    if (!t || t[0] === '!' || t[0] === '>') return;
    const c = t[0];
    if (c === '#' || c === '^') {
      const name = t.slice(1).trim();
      if (c === '#') {
        const isEach = name === 'each' || name.startsWith('each:');
        const isProvider = providers.some((p) => name === p || name.startsWith(`${p}:`));
        if (isEach || isProvider) {
          if (isEach) {
            const rn = name === 'each' ? 'each' : name.slice(5).trim();
            if (repeaterSet.has(rn)) emit({ kind: 'repeater', name: rn }, `r:${rn}`);
          }
          suppressUntil = name.split('=')[0].trim();
          suppressDepth = 1;
          return;
        }
        if (name.startsWith('if:')) emitField(name.slice(3));
      }
      sections.push({ name, inverted: c === '^' });
      return;
    }
    if (c === '/') {
      const name = t.slice(1).trim();
      for (let i = sections.length - 1; i >= 0; i--) {
        if (sections[i].name === name) { sections.length = i; break; }
      }
      return;
    }
    emitField(t);
  };

  const closeFrame = () => {
    const f = stack.pop();
    top().children.push(groupNode(f));
  };

  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code)) !== null) {
    const [, , closing, tagRaw, attrStr, triple, dbl, text] = m;
    if (suppressUntil !== null) {
      const mu = triple ?? dbl;
      if (mu != null) {
        const t = mu.trim();
        if (t[0] === '#' && t.slice(1).split('=')[0].trim() === suppressUntil) suppressDepth++;
        else if (t[0] === '/' && t.slice(1).trim() === suppressUntil && --suppressDepth === 0) suppressUntil = null;
      }
      continue;
    }
    if (tagRaw) {
      const tag = tagRaw.toLowerCase();
      if (closing) {
        if (HEADING.test(tag)) {
          if (headingBuf !== null) {
            const h = clean(headingBuf);
            if (h && !top().heading) top().heading = h;
          }
          headingBuf = null;
        } else if (CONTAINERS.has(tag)) {
          for (let i = stack.length - 1; i > 0; i--) {
            if (stack[i].tag === tag) { while (stack.length > i) closeFrame(); break; }
          }
        }
        continue;
      }
      if (tag === 'li' && top().tag === 'li') closeFrame();
      const selfClosing = VOID.has(tag) || /\/\s*$/.test(attrStr);
      if (CONTAINERS.has(tag) && !selfClosing) stack.push({ tag, attrs: parseAttrs(attrStr), children: [], heading: null });
      else if (HEADING.test(tag) && !selfClosing) headingBuf = '';
      // Platzhalter in Attributen gehören zum Element (bzw. dessen Gruppe)
      for (const am of attrStr.matchAll(/\{\{\{?([^{}]*)\}?\}\}/g)) mustache(am[1]);
      continue;
    }
    if (triple != null) { mustache(triple); continue; }
    if (dbl != null) { mustache(dbl); continue; }
    if (text != null && headingBuf !== null) headingBuf += text;
  }
  while (stack.length > 1) closeFrame();
  return root.children;
}

/** Phase 2: explizite {{x:typ|Gruppe}}-Gruppen an Position des ersten Feldes bündeln. */
function applyExplicit(nodes, groupOf) {
  const made = new Map();
  const walk = (list) => {
    const out = [];
    for (const n of list) {
      if (n.kind === 'field') {
        const g = groupOf(n.name);
        if (!g) { out.push(n); continue; }
        if (!made.has(g)) {
          const gn = { kind: 'group', tag: null, semantic: false, id: null, className: null, label: g, labelSource: 'explicit', children: [] };
          made.set(g, gn);
          out.push(gn);
        }
        made.get(g).children.push(n);
      } else if (n.kind === 'group') {
        n.children = walk(n.children);
        out.push(n);
      } else out.push(n);
    }
    return out;
  };
  return walk(nodes);
}

/** Phase 3: leere Gruppen entfernen, Einzelkind-Wrapper auflösen / semantisch verschmelzen. */
function normalize(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.kind !== 'group' || n.labelSource === 'explicit') { out.push(n); continue; }
    n.children = normalize(n.children);
    if (n.children.length === 0) continue;
    if (n.children.length > 1) { out.push(n); continue; }
    const kid = n.children[0];
    if (kid.kind === 'group' && kid.labelSource !== 'explicit' && n.semantic && !kid.semantic) {
      kid.tag = n.tag;
      kid.semantic = true;
      kid.id = kid.id || n.id;
      kid.className = kid.className || n.className;
      if (RANK[n.labelSource] > RANK[kid.labelSource]) { kid.label = n.label; kid.labelSource = n.labelSource; }
    }
    out.push(kid);
  }
  return out;
}

/** Phase 4: direkt benachbarte Text-/URL-Felder gleichen Typs zu Zeilen (max 3) bündeln. */
function applyRows(nodes, typeOf) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length < 2) out.push(...run);
    else {
      const rows = Math.ceil(run.length / MAX_ROW);
      let i = 0;
      for (let r = 0; r < rows; r++) {
        const size = Math.ceil((run.length - i) / (rows - r));
        out.push({ kind: 'row', fields: run.slice(i, i + size).map((f) => f.name) });
        i += size;
      }
    }
    run = [];
  };
  const typeKey = (n) => { const t = typeOf(n.name); return ROW_TYPES.has(t) ? t : null; };
  for (const n of nodes) {
    if (n.kind === 'field' && typeKey(n)) {
      if (run.length && typeKey(run[0]) !== typeKey(n)) flush();
      run.push(n);
      continue;
    }
    flush();
    if (n.kind === 'group') n.children = applyRows(n.children, typeOf);
    out.push(n);
  }
  flush();
  return out;
}

export function countGroups(nodes) {
  return (nodes || []).reduce((c, n) => c + (n.kind === 'group' ? 1 + countGroups(n.children) : 0), 0);
}

/**
 * @param {string} code Template-HTML
 * @param {{ typeOf?: (name:string) => string }} [opts] typeOf liefert den Feldtyp (für Zeilenbildung)
 * @returns {{ nodes: object[], hasStructure: boolean }}
 */
export function buildFieldTree(code, { typeOf } = {}) {
  if (!code) return { nodes: [], hasStructure: false };
  const fields = extractTemplateVariables(code) || [];
  const fieldSet = new Set(fields);
  const repeaters = (extractRepeaterBlocks(code) || []).map((r) => r.sectionName);
  const repeaterSet = new Set(repeaters);
  const groups = {};
  for (const { varName, group } of extractTypedVariables(code) || []) if (group) groups[varName] = group;
  const groupOf = (name) => groups[name] || (name.includes('.') ? groups[name.split('.').pop()] : null) || null;

  let nodes = parse(String(code), fieldSet, repeaterSet);

  // Nichts verlieren: Felder/Repeater ohne DOM-Position (z. B. aus Partials) ans Ende
  const present = new Set();
  const collect = (list) => list.forEach((n) => {
    if (n.kind === 'field') present.add(`f:${n.name}`);
    else if (n.kind === 'repeater') present.add(`r:${n.name}`);
    else if (n.kind === 'group') collect(n.children);
  });
  collect(nodes);
  fields.forEach((f) => { if (!present.has(`f:${f}`)) nodes.push({ kind: 'field', name: f }); });
  repeaters.forEach((r) => { if (!present.has(`r:${r}`)) { present.add(`r:${r}`); nodes.push({ kind: 'repeater', name: r }); } });

  nodes = normalize(applyExplicit(nodes, groupOf));
  const hasStructure = countGroups(nodes) > 0;
  if (hasStructure && typeof typeOf === 'function') nodes = applyRows(nodes, typeOf);
  return { nodes, hasStructure };
}

/** Feldnamen in Baumreihenfolge (Zeilen aufgelöst, Repeater nicht enthalten). */
export function flattenFieldTree(nodes) {
  const out = [];
  for (const n of nodes || []) {
    if (n.kind === 'field') out.push(n.name);
    else if (n.kind === 'row') out.push(...n.fields);
    else if (n.kind === 'group') out.push(...flattenFieldTree(n.children));
  }
  return out;
}

/** Eingerückte Textliste, z. B. "section: Hero\n  title\n  row(button, link)". */
export function describeFieldTree(nodes, depth = 0) {
  const pad = '  '.repeat(depth);
  return (nodes || []).map((n) => {
    if (n.kind === 'field') return `${pad}${n.name}`;
    if (n.kind === 'repeater') return `${pad}repeater: ${n.name}`;
    if (n.kind === 'row') return `${pad}row(${n.fields.join(', ')})`;
    return `${pad}${n.tag || 'group'}: ${n.label}\n${describeFieldTree(n.children, depth + 1)}`;
  }).join('\n');
}
