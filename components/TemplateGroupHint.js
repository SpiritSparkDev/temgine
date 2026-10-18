import React, { useEffect, useMemo, useState } from 'react';
import { buildFieldTree, countGroups } from '../lib/templateStructure';
import { extractTypedVariables, guessInputType } from '../lib/templateParser';

const SOURCE_LABEL = {
  'data-label': 'data-label',
  'aria-label': 'aria-label',
  heading: 'Überschrift',
  class: 'Klasse',
  id: 'id',
  fallback: 'ohne Titel',
  explicit: '|Gruppe'
};

function analyze(code) {
  try {
    const typed = new Map((extractTypedVariables(code) || []).map((v) => [v.varName, v.explicitType]));
    const typeOf = (name) => typed.get(name) || guessInputType(name);
    const tree = buildFieldTree(code, { typeOf });
    const nodes = Array.isArray(tree?.nodes) ? tree.nodes : [];
    return { nodes, hasStructure: Boolean(tree?.hasStructure), count: countGroups(nodes), typeOf, error: false };
  } catch (e) {
    return { nodes: [], hasStructure: false, count: 0, typeOf: () => 'text', error: true };
  }
}

// Der Baum enthält keine Quell-Offsets: Sprungziel ist die erste passende Textstelle im Code.
function jumpNeedle(node) {
  if (node.kind === 'field') return `{{${node.name}`;
  if (node.kind === 'repeater') return `{{#each:${node.name}`;
  if (node.kind === 'group') {
    if (node.labelSource === 'data-label' && node.label) return `data-label="${node.label}`;
    if (node.id) return `id="${node.id}"`;
    if (node.className) return node.className.split(/\s+/)[0];
    if (node.tag) return `<${node.tag}`;
  }
  return null;
}

function collectWarnings(nodes, hasStructure) {
  const out = [];
  if (!hasStructure) return out;
  const loose = nodes.filter((n) => n.kind === 'field').map((n) => n.name);
  if (loose.length) out.push(`Felder ${loose.join(', ')} stehen in keiner Gruppe.`);
  let untitled = 0;
  const walk = (list) => list.forEach((n) => {
    if (n.kind !== 'group') return;
    if (n.labelSource === 'fallback') untitled += 1;
    walk(n.children);
  });
  walk(nodes);
  if (untitled) out.push(`${untitled} Gruppe(n) ohne Titel – Tipp: data-label="…" am Element ergänzen.`);
  return out;
}

function Node({ node, typeOf, onJump, counter }) {
  const jump = onJump ? () => onJump(jumpNeedle(node)) : undefined;
  if (node.kind === 'group') {
    const fallback = node.labelSource === 'fallback';
    const title = fallback ? `Gruppe ${++counter.n}` : node.label;
    return (
      <div className={`th-group${node.semantic ? ' th-semantic' : ''}`}>
        <button type="button" className="th-head" onClick={jump} title="Im Code anzeigen">
          <span className="th-title">{title}</span>
          {node.tag && <span className="th-badge th-tag">{node.tag}</span>}
          <span className={`th-badge th-src${fallback ? ' th-warn' : ''}`}>{SOURCE_LABEL[node.labelSource] || node.labelSource}</span>
        </button>
        <div className="th-children">
          {node.children.map((c, i) => <Node key={i} node={c} typeOf={typeOf} onJump={onJump} counter={counter} />)}
        </div>
      </div>
    );
  }
  if (node.kind === 'row') {
    return (
      <div className="th-row">
        {node.fields.map((f) => (
          <button type="button" key={f} className="th-field" onClick={onJump ? () => onJump(`{{${f}`) : undefined}>
            <code>{f}</code><span className="th-badge">{typeOf(f)}</span>
          </button>
        ))}
      </div>
    );
  }
  const isRep = node.kind === 'repeater';
  return (
    <button type="button" className={`th-field${isRep ? ' th-repeater' : ''}`} onClick={jump}>
      <code>{node.name}</code>
      <span className="th-badge">{isRep ? 'Repeater' : typeOf(node.name)}</span>
    </button>
  );
}

export default function TemplateGroupHint({ code, onJump = null }) {
  const [debounced, setDebounced] = useState(code || '');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(code || ''), 300);
    return () => clearTimeout(t);
  }, [code]);

  const info = useMemo(() => analyze(debounced), [debounced]);
  const warnings = useMemo(() => collectWarnings(info.nodes, info.hasStructure), [info]);
  const jump = onJump ? (s) => { if (s) onJump(s); } : null;
  const counter = { n: 0 };

  return (
    <div className="th-panel">
      <button type="button" className="th-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Erkannte Eingabe-Gruppen ({info.count})
      </button>
      {open && (
        <div className="th-body">
          {info.error ? (
            <p className="th-note">Struktur konnte nicht gelesen werden (unvollständiges HTML?).</p>
          ) : !info.hasStructure ? (
            <p className="th-note">Keine Gruppen erkannt – die Maske zeigt die Felder wie bisher.</p>
          ) : (
            <div className="th-tree">
              {info.nodes.map((n, i) => <Node key={i} node={n} typeOf={info.typeOf} onJump={jump} counter={counter} />)}
            </div>
          )}
          {warnings.map((w) => <p key={w} className="th-note th-warn-note">{w}</p>)}
          <p className="th-note">
            Tipps: Eine Gruppe braucht mindestens zwei Felder – ein Wrapper mit nur einem Feld wird nicht angezeigt.
            Titel per <code>data-label="…"</code> oder explizit mit <code>{'{{feld:typ|Gruppe}}'}</code>.
          </p>
        </div>
      )}
    </div>
  );
}
