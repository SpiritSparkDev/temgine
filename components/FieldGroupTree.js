import React, { useId } from 'react';
import { ChevronUp, ChevronDown } from '../lib/muiIcons';
import { flattenFieldTree } from '../lib/templateStructure';

// Rendert den Feldbaum aus lib/templateStructure.js rekursiv (Spec: docs/specs/template-field-hierarchy.md).
// Felder/Repeater/Zeilen rendert der Aufrufer per Render-Props – hier steckt nur die Gruppen-Optik.
function Group({ node, depth, label, tkey, toggles, onToggle, showDev, renderField, renderRepeater }) {
  const id = useId();
  const collapsible = depth === 0;
  const open = !collapsible || (toggles[tkey] ?? true);
  const count = flattenFieldTree(node.children).length;
  const cls = `fg-group fg-depth-${Math.min(depth, 2)}${node.semantic ? ' fg-semantic' : ''}`;
  const tip = showDev ? `<${node.tag || 'gruppe'}>${node.className ? `.${String(node.className).split(/\s+/).join('.')}` : ''}` : undefined;
  return (
    <div className={cls} role="group" aria-labelledby={id} title={tip}>
      {collapsible ? (
        <button type="button" id={id} className="fg-head" aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); onToggle(tkey, !open); }}>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          <span className="fg-title">{label}</span>
          {showDev && node.tag && <code className="fg-tag">{node.tag}</code>}
          <span className="fg-count">{count}</span>
        </button>
      ) : (
        <div id={id} className="fg-head fg-head-static">
          <span className="fg-title">{label}</span>
          {showDev && node.tag && <code className="fg-tag">{node.tag}</code>}
        </div>
      )}
      {open && (
        <FieldGroupTree nodes={node.children} depth={depth + 1} tkeyPrefix={tkey} toggles={toggles} onToggle={onToggle}
          showDev={showDev} renderField={renderField} renderRepeater={renderRepeater} />
      )}
    </div>
  );
}

export default function FieldGroupTree({ nodes, depth = 0, tkeyPrefix = '', toggles, onToggle, showDev, renderField, renderRepeater }) {
  const items = [];
  let run = [];
  const flush = () => { if (run.length) { items.push(<div className="block-fields-grid fg-fields" key={`run-${items.length}`}>{run}</div>); run = []; } };
  let fallbackN = 0;
  nodes.forEach((n, i) => {
    if (n.kind === 'field') { run.push(renderField(n.name)); return; }
    flush();
    if (n.kind === 'row') {
      items.push(<div className="fg-row" key={`row-${i}`}>{n.fields.map(renderField)}</div>);
    } else if (n.kind === 'repeater') {
      items.push(<React.Fragment key={`rep-${n.name}`}>{renderRepeater(n.name)}</React.Fragment>);
    } else if (n.kind === 'group') {
      const label = n.labelSource === 'fallback' ? `${n.label} ${++fallbackN}` : n.label;
      items.push(
        <Group key={`g-${i}`} node={n} depth={depth} label={label} tkey={`${tkeyPrefix}|fg${i}`} toggles={toggles}
          onToggle={onToggle} showDev={showDev} renderField={renderField} renderRepeater={renderRepeater} />
      );
    }
  });
  flush();
  return <div className="fg-children">{items}</div>;
}
