import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { extractTypedVariables, extractRepeaterBlocks, extractEditorSections, guessInputType } from '../lib/templateParser';

// Farbe + Label pro Datentyp (Farben in styles/page-editor.css: .tpm-t-<type>)
const TYPE_LABELS = {
  text: 'Text',
  textarea: 'Richtext',
  image: 'Bild',
  url: 'Link / Datei',
  number: 'Zahl',
  date: 'Datum',
  color: 'Farbe',
  select: 'Auswahl',
  array: 'Liste',
  checkbox: 'Checkbox',
  folder: 'Ordner',
  gallery: 'Galerie',
};

const resolveType = (name, explicit) => {
  if (/headinglevel/i.test(name)) return 'select';
  if (/heading$/i.test(name)) return 'text';
  const t = explicit || guessInputType(name);
  return TYPE_LABELS[t] ? t : 'text';
};

// Schematische Darstellung eines einzelnen Feldes je Datentyp
function FieldShape({ type }) {
  switch (type) {
    case 'textarea': return <div className="tpm-shape"><i className="tpm-line" /><i className="tpm-line" /><i className="tpm-line tpm-line-short" /></div>;
    case 'image': return <div className="tpm-shape tpm-shape-image"><span>▲</span></div>;
    case 'color': return <div className="tpm-shape tpm-shape-row"><i className="tpm-swatch" /><i className="tpm-line tpm-line-short" /></div>;
    case 'select': return <div className="tpm-shape tpm-shape-select"><i className="tpm-line tpm-line-short" /><span>▾</span></div>;
    case 'array': return <div className="tpm-shape"><i className="tpm-line tpm-line-short" /><i className="tpm-line tpm-line-short" /></div>;
    case 'folder': return <div className="tpm-shape tpm-shape-image"><span>▤</span></div>;
    case 'gallery': return <div className="tpm-shape tpm-shape-image"><span>▦</span></div>;
    default: return <div className="tpm-shape"><i className="tpm-line" /></div>;
  }
}

function Field({ name, type }) {
  return (
    <div className={`tpm-field tpm-t-${type}`} title={`${name} (${TYPE_LABELS[type]})`}>
      <span className="tpm-field-name">{name}</span>
      <FieldShape type={type} />
    </div>
  );
}

const MAX_ITEMS = 8;

function TemplateSchema({ code }) {
  const { fields, repeaters, sections } = useMemo(() => {
    try {
      return {
        fields: (extractTypedVariables(code) || []).map(({ varName, explicitType }) => ({ name: varName, type: resolveType(varName, explicitType) })),
        repeaters: extractRepeaterBlocks(code) || [],
        sections: extractEditorSections(code) || [],
      };
    } catch (e) {
      return { fields: [], repeaters: [], sections: [] };
    }
  }, [code]);

  if (!fields.length && !repeaters.length && !sections.length) {
    return <div className="tpm-empty">Keine Eingabefelder</div>;
  }
  const shown = fields.slice(0, MAX_ITEMS);
  return (
    <div className="tpm-schema">
      {shown.map(f => <Field key={f.name} name={f.name} type={f.type} />)}
      {fields.length > MAX_ITEMS && <div className="tpm-more">+{fields.length - MAX_ITEMS} weitere Felder</div>}
      {repeaters.map(r => (
        <div key={r.sectionName} className="tpm-repeater">
          <div className="tpm-repeater-head">↻ {r.sectionName} <small>(wiederholbar)</small></div>
          {[0, 1].map(i => (
            <div key={i} className="tpm-repeater-row">
              {r.subFields.slice(0, 4).map(sf => <Field key={sf.name} name={sf.name} type={resolveType(sf.name, sf.type)} />)}
            </div>
          ))}
        </div>
      ))}
      {sections.map(s => <Field key={`${s.prefix}-${s.sectionName}`} name={s.sectionName} type={TYPE_LABELS[s.provider.editorType] ? s.provider.editorType : 'text'} />)}
    </div>
  );
}

export default function TemplatePickerModal({ open, templateNames, templateCodes, channelOptions = [], navigationOptions = [], current = '', dark = false, onSelect, onClose }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const q = query.trim().toLowerCase();
  const match = (label) => !q || String(label).toLowerCase().includes(q);
  const names = templateNames.filter(match);
  const channels = channelOptions.filter(o => match(o.label));
  const navs = navigationOptions.filter(o => match(o.label));

  return createPortal(
    <div className={`tpm-overlay${dark ? ' tpm-dark' : ''}`} onClick={onClose}>
      <div className="tpm-modal" role="dialog" aria-label="Template auswählen" onClick={e => e.stopPropagation()}>
        <div className="tpm-head">
          <h3>Template auswählen</h3>
          <input autoFocus type="search" className="input-field-small" placeholder="Suchen…" value={query} onChange={e => setQuery(e.target.value)} />
          <button type="button" className="tpm-close" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div className="tpm-legend">
          {Object.entries(TYPE_LABELS).map(([t, label]) => (
            <span key={t} className={`tpm-legend-item tpm-t-${t}`}><i />{label}</span>
          ))}
        </div>
        <div className="tpm-body">
          {!q && (
            <button type="button" className={`tpm-card tpm-card-none${!current ? ' is-current' : ''}`} onClick={() => onSelect('')}>
              <strong>Kein Template</strong>
              <div className="tpm-schema"><div className="tpm-field tpm-t-html"><span className="tpm-field-name">HTML</span><div className="tpm-shape"><i className="tpm-line" /><i className="tpm-line tpm-line-short" /></div></div><div className="tpm-empty">Freies HTML-Feld</div></div>
            </button>
          )}
          {names.map(name => (
            <button key={name} type="button" className={`tpm-card${current === name ? ' is-current' : ''}`} onClick={() => onSelect(name)}>
              <strong>{name}</strong>
              {templateCodes[name] == null ? <div className="tpm-empty">Lädt…</div> : <TemplateSchema code={templateCodes[name]} />}
            </button>
          ))}
          {[...channels, ...navs].map(opt => (
            <button key={opt.value} type="button" className={`tpm-card${current === opt.value ? ' is-current' : ''}`} onClick={() => onSelect(opt.value)}>
              <strong>{opt.label}</strong>
              <div className="tpm-empty">Inhalt wird automatisch eingebunden</div>
            </button>
          ))}
          {!names.length && !channels.length && !navs.length && <div className="tpm-empty">Nichts gefunden.</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
