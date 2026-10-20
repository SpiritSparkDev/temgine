import React, { useState } from 'react';
import { CMD_META, DEFAULT_BAR } from '../lib/wysiwygCommands';

/**
 * „Anpassen“-Dialog der WYSIWYG-Werkzeugleiste: Befehle ein-/ausblenden und
 * umsortieren. ponytail: ▲▼ statt Drag & Drop wie in SparkDown.
 */
export default function WysiwygToolbarDialog({ bar, onSave, onClose }) {
  const [list, setList] = useState(bar);
  const rest = Object.keys(CMD_META).filter((id) => !list.includes(id));
  const move = (i, d) => setList((l) => {
    const j = i + d;
    if (j < 0 || j >= l.length) return l;
    const n = [...l];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const row = (id, i) => (
    <div key={id} style={rowStyle}>
      <label style={{ flex: 1, display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input type="checkbox" checked={i != null} onChange={() => setList((l) => (i != null ? l.filter((x) => x !== id) : [...l, id]))} />
        <span style={labelStyle}>{CMD_META[id].l}</span>{CMD_META[id].n}
      </label>
      {i != null && (
        <>
          <button type="button" style={arrowStyle} title="Nach vorn" onClick={() => move(i, -1)}>▲</button>
          <button type="button" style={arrowStyle} title="Nach hinten" onClick={() => move(i, 1)}>▼</button>
        </>
      )}
    </div>
  );

  return (
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={dialogStyle} role="dialog" aria-label="Werkzeugleiste anpassen">
        <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Werkzeugleiste anpassen</h3>
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {list.map((id, i) => row(id, i))}
          {rest.map((id) => row(id, null))}
        </div>
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
          <button type="button" style={btn} onClick={() => setList(DEFAULT_BAR)}>Zurücksetzen</button>
          <span style={{ flex: 1 }} />
          <button type="button" style={btn} onClick={onClose}>Abbrechen</button>
          <button type="button" style={{ ...btn, background: 'var(--accent-primary)', color: '#fff' }} onClick={() => onSave(list)}>Speichern</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = { position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const dialogStyle = { background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px', width: 'min(380px, 92vw)' };
const rowStyle = { display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0', fontSize: '0.85rem' };
const labelStyle = { display: 'inline-block', minWidth: '2.2em', textAlign: 'center', fontWeight: 600 };
const arrowStyle = { padding: '0 6px', fontSize: '0.7rem', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' };
const btn = { padding: '4px 10px', fontSize: '0.8rem', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', cursor: 'pointer' };
