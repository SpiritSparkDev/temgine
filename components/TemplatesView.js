import React from 'react';
import { createButtonHandlers } from '../lib/insertHelper'
import dynamic from 'next/dynamic';
import { GripVertical, Plus, Trash2, Download } from 'lucide-react';
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
      console.log('Geladene Templates:', data);
      setAllTemplates(data || []);
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
      const names = await res.json();
      
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
                {templateList.map((tmpl, index) => (
                  <li 
                    key={tmpl}
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
                      className={`template-list-item ${templateName === tmpl ? 'active' : ''}`}
                      onDragEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                      onDragLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                    >
                      <GripVertical size={14} style={{ color: 'var(--text-tertiary)' }} />
                      <button
                        onClick={() => loadTemplate(tmpl)}
                        className="template-list-item-btn"
                      >
                        {tmpl}
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
                    className="template-snippet-btn"
                    {...createButtonHandlers(s.snippet, () => setTemplateCode(c => c + s.snippet))}
                  >
                    {s.label}
                  </button>
                ))}
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
                  .filter(tmpl => tmpl !== templateName) // Verhindere Selbstreferenz
                  .map(tmpl => (
                    <button 
                      key={tmpl} 
                      className="template-snippet-btn template-snippet"
                      {...createButtonHandlers(`{{template:${tmpl}}}`, () => setTemplateCode(c => c + `{{template:${tmpl}}}`))}
                    >
                      🧩 {tmpl}
                    </button>
                  ))}
              </div>
            </div>
          )}

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
