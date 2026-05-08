import React from 'react';
import { createButtonHandlers } from '../lib/insertHelper'
import dynamic from 'next/dynamic';
import { GripVertical, Plus, Trash2, Download, ChevronDown, ChevronUp } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import TemplatePreviewIframe from './TemplatePreviewIframe';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

export default function TemplatesView({ 
  templateList, 
  templateName, 
  setTemplateName, 
  templateCode, 
  setTemplateCode, 
  snippets, 
  loadTemplate, 
  saveTemplate, 
  deleteTemplate 
}) {
  const [navigations, setNavigations] = React.useState([]);
  const [allTemplates, setAllTemplates] = React.useState([]);
  const [refOpen, setRefOpen] = React.useState(false);

  // Lade Navigationen und Templates beim Start
  React.useEffect(() => {
    loadNavigations();
    loadAllTemplates();
  }, []);

  const loadNavigations = async () => {
    try {
      const res = await fetch('/api/navigations');
      const data = await res.json();
      setNavigations(data.navigations || []);
    } catch (error) {
      console.error('Fehler beim Laden der Navigationen:', error);
    }
  };

  const loadAllTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      let list = Array.isArray(data) ? data : [];
      if (list.length > 0 && typeof list[0] === 'string') {
        list = list.map(n => ({ name: n, type: 'SITE' }));
      }
      list = list.filter(t => !t.blogType);
      console.log('Geladene Templates:', list);
      setAllTemplates(list || []);
    } catch (error) {
      console.error('Fehler beim Laden der Templates:', error);
    }
  };

  // Templates neu laden wenn sich templateList ändert
  React.useEffect(() => {
    if (templateList && templateList.length > 0) {
      setAllTemplates(templateList);
    }
  }, [templateList]);

  function insertKeyword(snippet) {
    // Append snippet to the template code; CodeMirror wrapper does not expose Monaco's editor instance
    setTemplateCode(c => c + snippet);
  }

  const handleNewTemplate = () => {
    setTemplateName('');
    setTemplateCode('<section class="my-section">\n  <div class="container">\n    <h1>{{title}}</h1>\n    <p>{{text}}</p>\n    </div>\n</section>');
  };

  const saveTemplateOrder = async (orderedList) => {
    try {
      const res = await fetch('/api/templates/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderedList }),
      });

      if (!res.ok) {
        console.error('Fehler beim Speichern der Reihenfolge');
      }
    } catch (error) {
      console.error('Fehler beim Speichern der Reihenfolge:', error);
    }
  };

  const exportCurrentTemplate = () => {
    if (!templateName || !templateCode) {
      alert('Kein Template ausgewählt oder leer');
      return;
    }
    const templateData = {
      name: templateName,
      code: templateCode
    };
    const blob = new Blob([JSON.stringify(templateData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${templateName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAllTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      const list = await res.json();
      let names = Array.isArray(list) ? list : [];
      if (names.length > 0 && typeof names[0] !== 'string') {
        names = names.map(n => n.name);
      }
      const templates = [];
      for (const name of names) {
        const templateRes = await fetch(`/api/templates?name=${encodeURIComponent(name)}`);
        if (templateRes.ok) {
          const data = await templateRes.json();
          templates.push({ name: data.name, code: data.code });
        }
      }
      
      const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'all_templates.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Fehler beim Exportieren: ' + error.message);
    }
  };

  return (
    <div className="admin-editor-area" style={{ height: 'calc(100vh - 120px)', overflow: 'hidden', width: '100%', boxSizing: 'border-box', maxHeight: 'calc(100vh - 120px)' }}>
      <div className="templates-view-grid">
        
        {/* Sidebar - Template-Liste */}
        <div className="template-sidebar">
          <h3>Templates</h3>
          
          <button onClick={handleNewTemplate} className="template-new-btn">
            <Plus size={16} />
            Neues Template
          </button>

          <div className="template-list-divider">
            <h4>Template-Liste</h4>
            {templateList.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Keine Templates vorhanden</p>
            ) : (
              <ul className="template-list">
                {templateList.map((tmplObj, index) => (
                  <li 
                    key={tmplObj && tmplObj.name ? tmplObj.name : String(tmplObj)}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('templateIndex', index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIndex = parseInt(e.dataTransfer.getData('templateIndex'));
                      const toIndex = index;
                      if (fromIndex !== toIndex) {
                        const newList = [...templateList];
                        const [moved] = newList.splice(fromIndex, 1);
                        newList.splice(toIndex, 0, moved);
                        saveTemplateOrder(newList);
                        window.location.reload();
                      }
                    }}
                  >
                      <div 
                      className={`template-list-item ${templateName === (tmplObj && tmplObj.name ? tmplObj.name : tmplObj) ? 'active' : ''}`}
                      onDragEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                      onDragLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                    >
                      <GripVertical size={14} style={{ color: 'var(--text-tertiary)' }} />
                      <button
                        onClick={() => loadTemplate(tmplObj && tmplObj.name ? tmplObj.name : tmplObj)}
                        className="template-list-item-btn"
                      >
                        {tmplObj && tmplObj.name ? tmplObj.name : tmplObj}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Editor - Mittlere Spalte */}
        <div className="template-editor-column">
          {/* Template Name Input */}
          <div className="template-name-section">
            <label>Template Name</label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="z.B. Hero Section, Feature Cards, Pricing Table..."
              className="template-name-input"
            />
          </div>

          {/* Snippet-Bar */}
          <div className="template-snippet-section">
            <label>Snippets einfügen</label>
            <div className="template-snippet-buttons">
                {snippets.map(s => (
                  <button 
                    key={s.label} 
                    className={`template-snippet-btn ${s.type === 'bound' ? 'bound-snippet' : (s.type === 'defined' ? 'defined-snippet' : '')}`}
                    {...createButtonHandlers(s.snippet || '', () => setTemplateCode(c => c + (s.snippet || '')))}
                  >
                    {s.label}{s.type === 'bound' ? ' (bound)' : s.type === 'defined' ? ' (defined)' : ''}
                  </button>
                ))}
              </div>
              {/* Bound snippets list */}
              <div style={{ marginTop: 8 }}>
                <label>Gebundene Snippets</label>
                <div className="template-snippet-buttons">
                  {snippets.filter(s => s.type === 'bound').map(s => (
                    <button key={s.label} className="template-snippet-btn bound-snippet" {...createButtonHandlers(s.snippet || '', () => setTemplateCode(c => c + (s.snippet || '')))}>{s.label} ({s.snippet})</button>
                  ))}
                </div>
              </div>
              {/* Defined snippets list */}
              <div style={{ marginTop: 8 }}>
                <label>Definierte Snippets</label>
                <div className="template-snippet-buttons">
                  {snippets.filter(s => s.type === 'defined').map(s => (
                    <button key={s.label} className="template-snippet-btn defined-snippet" {...createButtonHandlers(s.snippet || '', () => setTemplateCode(c => c + (s.snippet || '')))}>{s.label}{s.handler ? ` — ${s.handler}` : ''}</button>
                  ))}
                </div>
              </div>
          </div>

          {/* Navigation Snippets */}
          {navigations.length > 0 && (
            <div className="template-snippet-section">
              <label>Navigationen einfügen</label>
              <div className="template-snippet-buttons">
                {navigations.map(nav => (
                  <button 
                    key={nav} 
                    className="template-snippet-btn navigation-snippet"
                    {...createButtonHandlers(`{{navigation:${nav}}}`, () => setTemplateCode(c => c + `{{navigation:${nav}}}`))}
                  >
                    📍 {nav}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Template Snippets */}
          {allTemplates.length > 0 && (
            <div className="template-snippet-section">
              <label>Templates einfügen</label>
              <div className="template-snippet-buttons">
                {allTemplates
                  .filter(t => (t && t.name ? t.name : t) !== templateName) // Verhindere Selbstreferenz
                  .map(t => {
                    const name = t && t.name ? t.name : t;
                    return (
                      <button 
                        key={name} 
                        className="template-snippet-btn template-snippet"
                        {...createButtonHandlers(`{{template:${name}}}`, () => setTemplateCode(c => c + `{{template:${name}}}`))}
                      >
                        🧩 {name}
                      </button>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Referenz-Panel */}
          <div className="template-ref-section">
            <button
              className="template-ref-toggle"
              onClick={() => setRefOpen(v => !v)}
              aria-expanded={refOpen}
            >
              <span>📖 Referenz: Variablen &amp; Datentypen</span>
              {refOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {refOpen && (
              <div className="template-ref-body">

                {/* Mustache Syntax */}
                <div className="template-ref-group">
                  <p className="template-ref-heading">Mustache-Syntax</p>
                  <table className="template-ref-table">
                    <tbody>
                      <tr><td><code>{'{{variable}}'}</code></td><td>Wert ausgeben (HTML-escaped)</td></tr>
                      <tr><td><code>{'{{{'}<span>{'variable}'}</span>{'}'}</code></td><td>Roher HTML-Wert (nicht escaped)</td></tr>
                      <tr><td><code>{'{{#section}}…{{/section}}'}</code></td><td>Abschnitt / Array-Schleife</td></tr>
                      <tr><td><code>{'{{^inverted}}…{{/inverted}}'}</code></td><td>Negiert – rendert wenn falsy</td></tr>
                      <tr><td><code>{'{{! Kommentar }}'}</code></td><td>Kommentar (wird nicht ausgegeben)</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* Typed variables */}
                <div className="template-ref-group">
                  <p className="template-ref-heading">Variablen-Typen <code>{'{{varName:typ}}'}</code></p>
                  <table className="template-ref-table">
                    <tbody>
                      <tr><td><code>:text</code></td><td>Einzeiliges Textfeld <em>(Standard)</em></td></tr>
                      <tr><td><code>:textarea</code></td><td>Mehrzeiliger Rich-Text-Editor (Quill)</td></tr>
                      <tr><td><code>:number</code></td><td>Zahlenfeld — z.B. <code>{'{{level:number}}'}</code> → <code>{'<h{{level:number}}>'}</code></td></tr>
                      <tr><td><code>:url</code></td><td>URL-Eingabe mit Datei-Picker</td></tr>
                      <tr><td><code>:image</code></td><td>Bildpfad mit Datei-Picker</td></tr>
                      <tr><td><code>:date</code></td><td>Datumsfeld</td></tr>
                      <tr><td><code>:color</code></td><td>Farbauswahl</td></tr>
                      <tr><td><code>:array</code></td><td>Liste (ein Wert pro Zeile)</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* System variables */}
                <div className="template-ref-group">
                  <p className="template-ref-heading">Systemvariablen</p>
                  <table className="template-ref-table">
                    <tbody>
                      <tr><td><code>{'{{page.title}}'}</code></td><td>Titel der aktuellen Seite</td></tr>
                      <tr><td><code>{'{{page.slug}}'}</code></td><td>Slug der aktuellen Seite</td></tr>
                      <tr><td><code>{'{{page.isChild}}'}</code></td><td>Wahr wenn Unterseite</td></tr>
                      <tr><td><code>{'{{inner}}'}</code></td><td>Gerenderter Inhalt der Kind-Blöcke</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* Navigation variables */}
                <div className="template-ref-group">
                  <p className="template-ref-heading">Navigations-Platzhalter</p>
                  <table className="template-ref-table">
                    <tbody>
                      <tr><td><code>{'{{{nav:main}}}'}</code></td><td>Aktive Hauptnavigation</td></tr>
                      <tr><td><code>{'{{{nav:page}}}'}</code></td><td>Aktive Seitennavigation</td></tr>
                      <tr><td><code>{'{{{nav:mobile}}}'}</code></td><td>Aktive Mobile-Navigation</td></tr>
                      <tr><td><code>{'{{{nav:auto}}}'}</code></td><td>Auto-Navigation aus Seitenbaum (verschachtelt)</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* Nav data context */}
                <div className="template-ref-group">
                  <p className="template-ref-heading">Datenkontext Navigations-Templates</p>
                  <table className="template-ref-table">
                    <thead><tr><th>Variable</th><th>Typ</th><th>Beschreibung</th></tr></thead>
                    <tbody>
                      <tr><td><code>{'{{#pages}}'}</code></td><td>Array</td><td>Alle veröffentlichten Seiten (für MAIN / MOBILE)</td></tr>
                      <tr><td><code>{'{{slug}}'}</code></td><td>String</td><td>Vollständiger Pfad, z.B. <code>leistungen/webdesign</code></td></tr>
                      <tr><td><code>{'{{title}}'}</code></td><td>String</td><td>Seitentitel</td></tr>
                      <tr><td><code>{'{{hasChildren}}'}</code></td><td>Boolean</td><td>Wahr wenn Unterseiten vorhanden</td></tr>
                      <tr><td><code>{'{{#children}}'}</code></td><td>Array</td><td>Unterseiten (gleiche Struktur)</td></tr>
                      <tr><td><code>{'{{#anchors}}'}</code></td><td>Array</td><td>Anker-Links (für PAGE-Navigation)</td></tr>
                      <tr><td><code>{'{{anchorId}}'}</code></td><td>String</td><td>Anker-ID des Abschnitts</td></tr>
                    </tbody>
                  </table>
                </div>

              </div>
            )}
          </div>

          {/* Monaco Editor */}
          <div style={{ flex: 1, minHeight: 0, maxHeight: '600px', maxWidth: '100%', overflow: 'hidden' }}>
            <ErrorBoundary fallback={({ error, reset }) => (
              <div style={{ padding: '2rem' }}>
                <div style={{ color: '#dc2626', marginBottom: '1rem' }}>
                  Editor konnte nicht geladen werden.
                </div>
                <div style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                  {String(error?.message || error)}
                </div>
                <button onClick={reset} style={{ padding: '0.5rem 1rem' }}>
                  Neu versuchen
                </button>
                <textarea 
                  value={templateCode} 
                  onChange={e => setTemplateCode(e.target.value)}
                  style={{
                    width: '100%',
                    height: '50ch',
                    marginTop: '1rem',
                    fontFamily: 'monospace',
                    padding: '1rem',
                  }}
                />
              </div>
            )}>
                <CodeEditor
                  height="600px"
                  language="html"
                  value={templateCode}
                  onChange={v => setTemplateCode(v || '')}
                  options={{}}
                />
            </ErrorBoundary>
          </div>

          {/* Action Bar */}
          <div className="template-actions-section">
            <button className="btn-primary" onClick={saveTemplate}>
              Speichern
            </button>
            <button 
              className="icon-btn delete" 
              onClick={deleteTemplate}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Trash2 size={16} />
              Löschen
            </button>
            <div style={{ flex: 1 }} />
            <button 
              className="icon-btn"
              onClick={exportCurrentTemplate}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              title="Aktuelles Template exportieren"
            >
              <Download size={16} />
              Exportieren
            </button>
            <button 
              className="btn-primary"
              onClick={exportAllTemplates}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              title="Alle Templates exportieren"
            >
              <Download size={16} />
              Alle exportieren
            </button>
          </div>
        </div>

        {/* Preview - Rechte Spalte */}
        <div className="template-preview-column">
          <div className="template-preview-header">
            <h3>Live-Vorschau</h3>
          </div>
          <div className="template-preview-content">
            <TemplatePreviewIframe code={templateCode} height="100%" />
          </div>
        </div>

      </div>
    </div>
  );
}

// Sidebar component for templates
export function TemplatesSidebar({ templateList, templateName, setTemplateName, setTemplateCode, loadTemplate }) {
  return (
    <>
      <h2>Templates</h2>
      <ul className="admin-template-list">
        <li>
          <button 
            className={!templateName ? 'selected' : ''} 
            onClick={() => { 
              setTemplateName(''); 
              setTemplateCode('<section class="my-section">\n  <div class="container">\n    <h1>{{title}}</h1>\n    <p>{{text}}</p>\n     </div>\n</section>'); 
            }}
          >
            Neues Template
          </button>
        </li>
        {templateList.map(t => (
          <li key={t}>
            <button 
              className={templateName === t ? 'selected' : ''} 
              onClick={() => loadTemplate(t)}
            >
              {t}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
