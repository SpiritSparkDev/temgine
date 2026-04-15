import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2, Layout, Grid, Code2, Save, BookOpen } from 'lucide-react';
import { createButtonHandlers } from '../lib/insertHelper';
import TemplateStructurePreview from './TemplateStructurePreview';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

const SYSTEM_PLACEHOLDERS = [
  { label: 'Titel', snippet: '{{title}}' },
  { label: 'Slug', snippet: '{{slug}}' },
  { label: 'Autor', snippet: '{{data.author}}' },
  { label: 'Seitenkopf', snippet: '{{data.pageHeader}}' },
  { label: 'Kindseite', snippet: '{{isChild}}' },
  { label: 'Blöcke', snippet: '{{{blocks}}}' },
];

function extractVars(code) {
  const vars = new Set();
  const re = /\{\{\{?\s*([^#/>!{}\s][^{}]*?)\s*\}?\}\}/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const v = m[1].trim();
    if (v && !v.includes(' ') && !v.startsWith('!') && !v.startsWith('>')) vars.add(v);
  }
  return [...vars];
}

export default function TemplatesViewModern({ showToast }) {
  const showDevHints = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  const devTitle = (text) => (showDevHints ? text : undefined);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [rightTab, setRightTab] = useState('variables');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  function loadTemplates() {
    fetch('/api/templates')
      .then(r => r.json())
      .then(data => {
        let list = Array.isArray(data) ? data : [];
        if (list.length > 0 && typeof list[0] === 'string') {
          list = list.map(n => ({ name: n, type: 'BLOCK' }));
        }
        setTemplates(list);
      })
      .catch(() => setTemplates([]));
  }

  function handleNew() {
    setSelectedTemplate(null);
    setTemplateName('');
    setTemplateCode('<section class="my-section">\n  <div class="container">\n    <h1>{{title}}</h1>\n    <p>{{text}}</p>\n  </div>\n</section>');
    setIsEditing(true);
  }

  function handleEdit(name, index) {
    fetch(`/api/templates?name=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(data => {
        setSelectedTemplate(index);
        setTemplateName(data.name);
        setTemplateCode(data.code);
        setIsEditing(true);
      })
      .catch(err => showToast('Fehler beim Laden: ' + err.message, 'error'));
  }

  function handleSave() {
    if (!templateName.trim()) {
      showToast('Bitte Template-Namen eingeben', 'error');
      return;
    }
    setIsSaving(true);
    fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName, code: templateCode, type: 'BLOCK' }),
    })
      .then(r => r.json())
      .then(() => {
        showToast('Template gespeichert!', 'success');
        loadTemplates();
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'))
      .finally(() => setIsSaving(false));
  }

  function handleDelete(name, index) {
    fetch('/api/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then(() => {
        showToast('Template gelöscht', 'success');
        loadTemplates();
        if (selectedTemplate === index) {
          setIsEditing(false);
          setSelectedTemplate(null);
        }
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  function handleCancel() {
    setIsEditing(false);
    setSelectedTemplate(null);
    setTemplateName('');
    setTemplateCode('');
  }

  const extractedVars = isEditing ? extractVars(templateCode) : [];
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredTemplates = templates.filter(
    (t) => !normalizedSearch || t.name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <div className="tce-root">
      {/* TOP TOOLBAR */}
      <div className="tce-toolbar">
        <div className="tce-toolbar-left">
          <Layout size={16} className="tce-toolbar-icon" aria-hidden="true" />
          {isEditing ? (
            <input
              type="text"
              className="tce-name-input"
              placeholder="Template-Name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              aria-label="Template-Name"
              title={devTitle('Feld: Template-Name')}
            />
          ) : (
            <span className="tce-toolbar-title">Block-Templates</span>
          )}
        </div>
        <div className="tce-toolbar-right">
          <button
            className="tce-btn tce-btn-ghost"
            onClick={handleNew}
            title={devTitle('Neues Template anlegen')}
            aria-label="Neues Template anlegen"
          >
            <Plus size={13} aria-hidden="true" />
            Neu
          </button>
          {isEditing && (
            <>
              <button
                className="tce-btn tce-btn-ghost"
                onClick={handleCancel}
                title={devTitle('Änderungen verwerfen')}
              >
                Abbrechen
              </button>
              <button
                className="tce-btn tce-btn-primary"
                onClick={handleSave}
                disabled={isSaving}
                title={devTitle('Template speichern')}
              >
                <Save size={13} aria-hidden="true" />
                {isSaving ? 'Speichern…' : 'Speichern'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* BODY: 3 columns */}
      <div className="tce-body">
        {/* LEFT: Template list */}
        <div className="tce-list-panel">
          <div className="tce-list-header">
            <input
              className="tce-search-input"
              type="text"
              placeholder="Suchen…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Template suchen"
            />
          </div>
          <div className="tce-list-body">
            {templates.length === 0 ? (
              <div className="tce-list-empty">Keine Templates vorhanden</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="tce-list-empty">Keine Treffer für „{searchTerm}"</div>
            ) : (
              filteredTemplates.map((t) => {
                const index = templates.findIndex((x) => x.name === t.name);
                return (
                  <div
                    key={t.name}
                    className={`tce-list-item${selectedTemplate === index && isEditing ? ' active' : ''}`}
                    onClick={() => handleEdit(t.name, index)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Template ${t.name} bearbeiten`}
                    title={devTitle(`Template ${t.name} öffnen`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleEdit(t.name, index);
                      }
                    }}
                  >
                    <Grid size={12} className="tce-item-icon" aria-hidden="true" />
                    <span className="tce-item-name">{t.name}</span>
                    <button
                      className="tce-item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(t.name, index);
                      }}
                      aria-label={`Template ${t.name} löschen`}
                      title="Löschen"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* CENTER: Code editor */}
        <div className="tce-code-panel">
          {isEditing ? (
            <>
              <div className="tce-code-tabs">
                <div className="tce-code-tab active">
                  <Code2 size={11} aria-hidden="true" />
                  <span>{templateName || 'unbenannt'}.html</span>
                </div>
              </div>
              <div className="tce-code-body">
                <CodeEditor
                  height="100%"
                  language="html"
                  value={templateCode}
                  onChange={(value) => setTemplateCode(value || '')}
                  options={{}}
                />
              </div>
              <div className="tce-statusbar">
                <span className="tce-status-item">HTML</span>
                <span className="tce-status-sep">·</span>
                <span className="tce-status-item">UTF-8</span>
                <span className="tce-status-sep">·</span>
                <span className="tce-status-type">BLOCK</span>
              </div>
            </>
          ) : (
            <div className="tce-empty-state">
              <Layout size={48} strokeWidth={1} aria-hidden="true" />
              <h3>Wähle ein Template</h3>
              <p>oder erstelle ein neues mit <strong>Neu</strong></p>
            </div>
          )}
        </div>

        {/* RIGHT: Properties panel (only when editing) */}
        {isEditing && (
          <div className="tce-props-panel">
            <div className="tce-props-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={rightTab === 'variables'}
                className={`tce-props-tab${rightTab === 'variables' ? ' active' : ''}`}
                onClick={() => setRightTab('variables')}
              >
                Variablen
              </button>
              <button
                role="tab"
                aria-selected={rightTab === 'structure'}
                className={`tce-props-tab${rightTab === 'structure' ? ' active' : ''}`}
                onClick={() => setRightTab('structure')}
              >
                Struktur
              </button>
              <button
                role="tab"
                aria-selected={rightTab === 'settings'}
                className={`tce-props-tab${rightTab === 'settings' ? ' active' : ''}`}
                onClick={() => setRightTab('settings')}
              >
                Settings
              </button>
              <button
                role="tab"
                aria-selected={rightTab === 'referenz'}
                className={`tce-props-tab${rightTab === 'referenz' ? ' active' : ''}`}
                onClick={() => setRightTab('referenz')}
              >
                <BookOpen size={11} aria-hidden="true" />
                Referenz
              </button>
            </div>

            <div className="tce-props-body">
              {rightTab === 'variables' && (
                <div className="tce-vars">
                  <div className="tce-vars-section">
                    <div className="tce-vars-title">Systemwerte</div>
                    {SYSTEM_PLACEHOLDERS.map((s) => (
                      <div key={s.label} className="tce-var-row">
                        <span className="tce-var-code">{s.snippet}</span>
                        <button
                          className="tce-var-insert-btn"
                          {...createButtonHandlers(s.snippet, () =>
                            setTemplateCode((c) => c + s.snippet)
                          )}
                          aria-label={`${s.label} einfügen`}
                          title={devTitle(`Systemwert ${s.label} einfügen`)}
                        >
                          {s.label}
                        </button>
                      </div>
                    ))}
                  </div>

                  {extractedVars.length > 0 && (
                    <div className="tce-vars-section">
                      <div className="tce-vars-title">Im Template erkannt</div>
                      {extractedVars.map((v) => (
                        <div key={v} className="tce-var-row tce-var-row--detected">
                          <span className="tce-var-code">{`{{${v}}}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {rightTab === 'structure' && (
                <div className="tce-structure-tab">
                  <TemplateStructurePreview code={templateCode} />
                </div>
              )}

              {rightTab === 'referenz' && (
                <div className="tce-ref-tab">

                  <div className="tce-ref-group">
                    <div className="tce-ref-heading">Typen-Annotationen</div>
                    <table className="tce-ref-table">
                      <tbody>
                        <tr><td><code>:text</code></td><td>Einzeiliges Textfeld</td></tr>
                        <tr><td><code>:textarea</code></td><td>Richtext-Editor</td></tr>
                        <tr><td><code>:number</code></td><td>Zahlenfeld</td></tr>
                        <tr><td><code>:url</code></td><td>URL + Datei-Picker</td></tr>
                        <tr><td><code>:image</code></td><td>Bildpfad-Picker</td></tr>
                        <tr><td><code>:date</code></td><td>Datumsfeld</td></tr>
                        <tr><td><code>:color</code></td><td>Farbauswahl</td></tr>
                        <tr><td><code>:array</code></td><td>Liste (zeilenweise)</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="tce-ref-group">
                    <div className="tce-ref-heading">Systemvariablen</div>
                    <table className="tce-ref-table">
                      <tbody>
                        <tr><td><code>{'{{page.title}}'}</code></td><td>Seitentitel</td></tr>
                        <tr><td><code>{'{{page.slug}}'}</code></td><td>Seiten-Slug</td></tr>
                        <tr><td><code>{'{{inner}}'}</code></td><td>HTML der Kindblöcke</td></tr>
                        <tr><td><code>{'{{{nav:main}}}'}</code></td><td>Hauptnavigation (HTML)</td></tr>
                        <tr><td><code>{'{{{nav:page}}}'}</code></td><td>Seitennavigation (HTML)</td></tr>
                        <tr><td><code>{'{{{nav:mobile}}}'}</code></td><td>Mobile-Navigation (HTML)</td></tr>
                        <tr><td><code>{'{{{nav:auto}}}'}</code></td><td>Auto-Nav aus Seitenbaum</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="tce-ref-group">
                    <div className="tce-ref-heading">Mustache-Syntax</div>
                    <table className="tce-ref-table">
                      <tbody>
                        <tr><td><code>{'{{var}}'}</code></td><td>Variable (escaped)</td></tr>
                        <tr><td><code>{'{{{'}<span>{'var}'}</span>{'}'}</code></td><td>Variable (HTML roh)</td></tr>
                        <tr><td><code>{'{{#s}}…{{/s}}'}</code></td><td>Abschnitt / Schleife</td></tr>
                        <tr><td><code>{'{{^s}}…{{/s}}'}</code></td><td>Invertierter Abschnitt</td></tr>
                        <tr><td><code>{'{{#hasChildren}}'}</code></td><td>Wenn Unterseiten existieren</td></tr>
                        <tr><td><code>{'{{#children}}'}</code></td><td>Unterseiten iterieren</td></tr>
                        <tr><td><code>{'{{#pages}}'}</code></td><td>Nav-Seiten iterieren</td></tr>
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

              {rightTab === 'settings' && (
                <div className="tce-settings-tab">
                  <div className="tce-setting-group">
                    <label className="tce-setting-label" htmlFor="tce-settings-name">
                      Name
                    </label>
                    <input
                      id="tce-settings-name"
                      type="text"
                      className="tce-setting-input"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                  </div>
                  <div className="tce-setting-group">
                    <span className="tce-setting-label">Typ</span>
                    <div className="tce-type-badge">BLOCK</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
