import React from 'react';
import { ChevronUp, ChevronDown, Plus } from '../lib/muiIcons';
import SmartRichTextEditor from './SmartRichTextEditor';

// Menschlich lesbares Label aus einem Template-Variablennamen ({{varName}}) —
// egal ob camelCase ("linkText"), snake/kebab-case ("link_text") oder schon
// mit Leerzeichen geschrieben ("Link Text"). Von PageEditor.js (Block-Props,
// Seiten-Datenfelder) UND BlogPostEditor.js (Beitrags-Template-Felder)
// gemeinsam genutzt, damit beide Eingabemasken dieselben Labels erzeugen.
export function formatFieldLabel(name) {
  if (!name) return '';
  return String(name)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isCheckedValue(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

export function SelectOptions({ options, value }) {
  const known = options.some((o) => o.value === value);
  return (
    <>
      <option value="">-- Bitte wählen --</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      {value && !known && <option value={value}>{value}</option>}
    </>
  );
}

// Ein einzelnes Eingabefeld für einen flachen (nicht verschachtelten) Wert —
// für Seiten-Datenfelder, Top-Level-Felder eines Blog-Beitrags-Templates und
// (als Baustein von RepeaterSectionEditor) Repeater-Unterfelder. Kennt nur
// value/onChange, keine Block-Pfade, damit es überall gleich funktioniert.
// openFileModal ist optional — ohne sie fällt "image"/"url" auf ein reines
// Textfeld zurück statt den Datei-Picker-Button zu zeigen.
export function SimpleFieldInput({ varName, inputType, options, label, value, onChange, openFileModal, devTitle = () => undefined, richTextEditorMode }) {
  if (inputType === 'select' && options) {
    return (
      <div className="field-item">
        <label className="field-label-xs">{label}</label>
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className="input-field-small field-input-full">
          <SelectOptions options={options} value={value} />
        </select>
      </div>
    );
  }
  if (inputType === 'textarea') {
    return (
      <div className="field-item field-item-textarea">
        <label className="field-label-xs">{label}</label>
        <div className="field-quill-wrapper">
          <SmartRichTextEditor mode={richTextEditorMode} label={label} value={value || ''} onChange={onChange} toolbar={['bold', 'italic', 'ol', 'ul', 'link', 'clear', 'preview']} />
        </div>
      </div>
    );
  }

  if (inputType === 'array') {
    return (
      <div className="field-item">
        <label className="field-label-xs">{label}</label>
        <textarea
          placeholder="Ein Wert pro Zeile"
          value={Array.isArray(value) ? value.join('\n') : ''}
          onChange={(e) => onChange(e.target.value.split('\n').filter((v) => v.trim()))}
          rows={2}
          className="input-field-small field-input-full field-array-textarea"
        />
      </div>
    );
  }

  if (inputType === 'image') {
    return (
      <div className="field-item">
        <label className="field-label-xs">{label}</label>
        <div className="field-url-row">
          <input type="text" placeholder="Bild-URL" value={value || ''} onChange={(e) => onChange(e.target.value)} className="input-field-small field-input-full" />
          {openFileModal && (
            <button type="button" onClick={() => openFileModal((url) => onChange(url))} className="btn-modern-small" title={devTitle(`Bild fuer Feld ${label} auswaehlen`)} aria-label={`Bild fuer Feld ${label} auswaehlen`}>📁 Bild</button>
          )}
        </div>
        {value && (
          <div className="field-image-thumb-row">
            <img src={value} alt="" className="field-image-thumb" onClick={() => openFileModal && openFileModal((url) => onChange(url))} />
          </div>
        )}
      </div>
    );
  }

  if (inputType === 'date') {
    return (
      <div className="field-item">
        <label className="field-label-xs">{label}</label>
        <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} className="input-field-small field-input-full" />
      </div>
    );
  }

  if (inputType === 'checkbox') {
    return (
      <div className="field-item">
        <label className="field-label-xs" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={isCheckedValue(value)} onChange={(e) => onChange(e.target.checked ? true : '')} />
          {label}
        </label>
      </div>
    );
  }

  if (inputType === 'color') {
    return (
      <div className="field-item">
        <label className="field-label-xs">{label}</label>
        <div className="field-url-row">
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="input-field-small" />
          <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="#rrggbb" className="input-field-small field-input-full" />
        </div>
      </div>
    );
  }

  if (inputType === 'url') {
    return (
      <div className="field-item">
        <label className="field-label-xs">{label}</label>
        <div className="field-url-row">
          <input type="text" placeholder="URL oder Dateipfad" value={value || ''} onChange={(e) => onChange(e.target.value)} className="input-field-small field-input-full" />
          {openFileModal && (
            <button type="button" onClick={() => openFileModal((url) => onChange(url))} className="btn-modern-small field-input-full" title={devTitle(`Datei fuer Feld ${label} auswaehlen`)} aria-label={`Datei fuer Feld ${label} auswaehlen`}>📁 Datei</button>
          )}
        </div>
      </div>
    );
  }

  const numberOrText = inputType === 'number' ? 'number' : 'text';
  return (
    <div className="field-item">
      <label className="field-label-xs">{label}</label>
      <input type={numberOrText} value={value ?? ''} onChange={(e) => onChange(numberOrText === 'number' ? e.target.valueAsNumber : e.target.value)} className="input-field-small field-input-full" />
    </div>
  );
}

const stripTagsForSummary = (s) => String(s || '').replace(/<[^>]*>/g, '');

// Eine Repeater-Sektion ({{#each:name}}…{{/each:name}}): auf-/zuklappbare
// Einträge mit Verschieben/Duplizieren/Entfernen und "hinzufügen" an jeder
// Position. Von PageEditor.js (Block-Props) UND BlogPostEditor.js
// (Beitrags-Template-Felder) gemeinsam genutzt — vorher hatte jede Maske
// ihre eigene, voneinander abweichende Variante (unterschiedlich
// humanisierte Labels, in Blog kein Auf-/Zuklappen, Textarea-Unterfelder
// ohne eigene volle Zeile).
//
// collapsedRows/onCollapsedRowsChange sind optional ("controlled"): ohne sie
// verwaltet die Komponente ihren Klapp-Zustand selbst (React-State-Setter-
// Signatur: onCollapsedRowsChange(prevArray => nextArray) oder ein Array).
export function RepeaterSectionEditor({
  sectionName,
  subFields,
  rows,
  onRowsChange,
  richTextEditorMode,
  openFileModal,
  devTitle = () => undefined,
  itemLabel,
  getFieldRef = () => undefined,
  collapsedRows: controlledCollapsedRows,
  onCollapsedRowsChange: controlledSetCollapsedRows,
  showSectionLabel = true,
}) {
  const [internalCollapsed, setInternalCollapsed] = React.useState([]);
  const collapsedRows = controlledCollapsedRows ?? internalCollapsed;
  const setCollapsedRows = controlledSetCollapsedRows ?? setInternalCollapsed;

  const isOpen = (i) => !collapsedRows.includes(i);
  const toggleRow = (i) => setCollapsedRows((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  const resetCollapsed = () => setCollapsedRows([]);

  const resolvedItemLabel = itemLabel || (sectionName === 'each' ? 'Eintrag' : formatFieldLabel(sectionName));

  // Fügt den neuen (leeren) Eintrag genau an Position `at` ein und schiebt
  // die Klapp-Indizes danach entsprechend mit.
  const addRow = (at = rows.length) => {
    const emptyRow = Object.fromEntries(subFields.map((sf) => [sf.name, '']));
    onRowsChange([...rows.slice(0, at), emptyRow, ...rows.slice(at)]);
    setCollapsedRows((prev) => prev.map((i) => (i >= at ? i + 1 : i)));
  };

  const addButton = (at) => (
    <button type="button" onClick={() => addRow(at)} className="btn-modern-small repeater-add-btn" title={`Eintrag hier in ${sectionName} einfügen`}>
      <Plus size={12} /> {resolvedItemLabel} hinzufügen
    </button>
  );

  return (
    <div className="field-item field-item-repeater">
      {showSectionLabel && (
        <div className="field-repeater-header">
          <label className="field-label-xs field-repeater-label">{formatFieldLabel(sectionName)}</label>
        </div>
      )}
      <div className="repeater-rows">
        {rows.map((row, rowIdx) => (
          <React.Fragment key={rowIdx}>
            {addButton(rowIdx)}
            <div className="repeater-row">
              <div className="repeater-row-header">
                <button type="button" className="repeater-row-toggle" aria-expanded={isOpen(rowIdx)} onClick={() => toggleRow(rowIdx)}>
                  {isOpen(rowIdx) ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  <span className="repeater-row-num">{resolvedItemLabel} {rowIdx + 1}</span>
                  {!isOpen(rowIdx) && (() => {
                    const sum = subFields
                      .filter((sf) => sf.type !== 'image' && sf.type !== 'url' && sf.type !== 'checkbox' && sf.type !== 'select')
                      .map((sf) => stripTagsForSummary(row[sf.name]).trim())
                      .find(Boolean);
                    return <span className="repeater-row-summary">{sum ? (sum.length > 60 ? `${sum.slice(0, 60)}…` : sum) : '(leer)'}</span>;
                  })()}
                </button>
                <div className="repeater-row-actions">
                  <button
                    type="button"
                    disabled={rowIdx === 0}
                    className="repeater-row-move"
                    title="Nach oben verschieben"
                    onClick={() => {
                      const next = [...rows];
                      [next[rowIdx - 1], next[rowIdx]] = [next[rowIdx], next[rowIdx - 1]];
                      onRowsChange(next);
                      resetCollapsed();
                    }}
                  ><ChevronUp size={13} /></button>
                  <button
                    type="button"
                    disabled={rowIdx === rows.length - 1}
                    className="repeater-row-move"
                    title="Nach unten verschieben"
                    onClick={() => {
                      const next = [...rows];
                      [next[rowIdx], next[rowIdx + 1]] = [next[rowIdx + 1], next[rowIdx]];
                      onRowsChange(next);
                      resetCollapsed();
                    }}
                  ><ChevronDown size={13} /></button>
                  <button
                    type="button"
                    className="repeater-row-duplicate"
                    title={`Eintrag ${rowIdx + 1} duplizieren`}
                    aria-label={`Eintrag ${rowIdx + 1} aus ${sectionName} duplizieren`}
                    onClick={() => {
                      const copy = { ...row };
                      onRowsChange([...rows.slice(0, rowIdx + 1), copy, ...rows.slice(rowIdx + 1)]);
                      resetCollapsed();
                    }}
                  >⧉ Duplizieren</button>
                  <button
                    type="button"
                    className="repeater-row-delete"
                    title={`Eintrag ${rowIdx + 1} entfernen`}
                    aria-label={`Eintrag ${rowIdx + 1} aus ${sectionName} entfernen`}
                    onClick={() => {
                      onRowsChange(rows.filter((_, i) => i !== rowIdx));
                      resetCollapsed();
                    }}
                  >✕</button>
                </div>
              </div>
              {isOpen(rowIdx) && (
                <div className="repeater-row-fields">
                  {subFields.map((sf) => {
                    const sfVal = row[sf.name] !== undefined ? row[sf.name] : '';
                    const setSfVal = (val) => onRowsChange(rows.map((r, i) => (i === rowIdx ? { ...r, [sf.name]: val } : r)));
                    const fieldRef = getFieldRef(rowIdx, sf.name);
                    const subLabel = formatFieldLabel(sf.name);

                    if (sf.type === 'select' && sf.options) {
                      return (
                        <div key={sf.name} className="repeater-subfield">
                          <label className="field-label-xs">{subLabel}</label>
                          <select ref={fieldRef} value={sfVal || ''} onChange={(e) => setSfVal(e.target.value)} className="input-field-small field-input-full">
                            <SelectOptions options={sf.options} value={sfVal} />
                          </select>
                        </div>
                      );
                    }
                    if (sf.type === 'checkbox') {
                      return (
                        <div key={sf.name} className="repeater-subfield">
                          <label className="field-label-xs" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input ref={fieldRef} type="checkbox" checked={isCheckedValue(sfVal)} onChange={(e) => setSfVal(e.target.checked ? true : '')} />
                            {subLabel}
                          </label>
                        </div>
                      );
                    }
                    if (sf.type === 'textarea') {
                      return (
                        <div key={sf.name} className="repeater-subfield repeater-subfield-wide">
                          <label className="field-label-xs">{subLabel}</label>
                          <div ref={fieldRef} className="field-quill-wrapper">
                            <SmartRichTextEditor
                              mode={richTextEditorMode}
                              label={subLabel}
                              value={sfVal}
                              onChange={setSfVal}
                              toolbar={['bold', 'italic', 'ol', 'ul', 'link', 'clear', 'preview']}
                            />
                          </div>
                        </div>
                      );
                    }
                    if (sf.type === 'image' || sf.type === 'url') {
                      return (
                        <div key={sf.name} className="repeater-subfield">
                          <label className="field-label-xs">{subLabel}</label>
                          <div className="field-url-row">
                            <input ref={fieldRef} type="text" placeholder={sf.name} value={sfVal} onChange={(e) => setSfVal(e.target.value)} className="input-field-small field-input-full" />
                            {openFileModal && (
                              <button type="button" onClick={() => openFileModal((url) => setSfVal(url))} className="btn-modern-small" title={`Datei für ${sf.name} auswählen`} aria-label={`Datei für ${sf.name} auswählen`}>📁</button>
                            )}
                          </div>
                          {sf.type === 'image' && sfVal && (
                            <div className="field-image-thumb-row">
                              <img src={sfVal} alt="" className="field-image-thumb" onClick={() => openFileModal && openFileModal((url) => setSfVal(url))} />
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div key={sf.name} className="repeater-subfield">
                        <label className="field-label-xs">{subLabel}</label>
                        <input ref={fieldRef} type={sf.type === 'number' ? 'number' : 'text'} placeholder={sf.name} value={sfVal} onChange={(e) => setSfVal(e.target.value)} className="input-field-small field-input-full" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </React.Fragment>
        ))}
        {addButton(rows.length)}
      </div>
    </div>
  );
}
