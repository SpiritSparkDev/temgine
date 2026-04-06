import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, Layout, Download, GripVertical, Grid } from 'lucide-react';
import { createButtonHandlers, insertText } from '../lib/insertHelper'
import TemplateStructurePreview from './TemplateStructurePreview';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

const SYSTEM_PLACEHOLDERS = [
  { label: 'Titel', snippet: '{{title}}' },
  { label: 'Slug', snippet: '{{slug}}' },
  { label: 'Autor', snippet: '{{data.author}}' },
  { label: 'Seitenkopf', snippet: '{{data.pageHeader}}' },
  { label: 'Kindseite', snippet: '{{isChild}}' },
  { label: 'Blöcke', snippet: '{{{blocks}}}' }
]

const SYSTEM_SNIPPET_KEYS = new Set([
  'blocks', 'title', 'titel', 'slug', 'author', 'page title', 'page slug', 'page header', 'header', 'is child'
])

const normalizeSystemName = (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ')

const isSystemSnippet = (snippet) => {
  return SYSTEM_SNIPPET_KEYS.has(normalizeSystemName(snippet?.key || snippet?.label))
}

const getSnippetReference = (snippet) => {
  const key = String(snippet?.key || '').trim()
  if (!key) return ''
  return `{{snippetHtml:${key}}}`
}

export default function TemplatesViewModern({ showToast }) {
  const showDevHints = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  const devTitle = (text) => (showDevHints ? text : undefined);
  const [templates, setTemplates] = useState([]);
  // inserterRef no longer required; editor registers centrally
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [templateType, setTemplateType] = useState('SITE');
  const [activeTemplateScope, setActiveTemplateScope] = useState('SITE');
  const [searchTerm, setSearchTerm] = useState('');
  const [snippets, setSnippets] = useState([]);
  const [navigations, setNavigations] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  

  useEffect(() => {
    loadTemplates();
    loadSnippets();
    loadNavigations();
  }, []);

  function loadTemplates() {
    fetch('/api/templates')
      .then(r => r.json())
      .then(data => {
        let list = Array.isArray(data) ? data : [];
        if (list.length > 0 && typeof list[0] === 'string') {
          list = list.map(n => ({ name: n, type: 'SITE' }));
        }
        setTemplates(list);
      })
      .catch(() => setTemplates([]));
  }

  function loadSnippets() {
    fetch('/api/snippets')
      .then(r => r.json())
      .then(data => {
        setSnippets(data || [])
      })
      .catch(() => setSnippets([]));
  }

  function loadNavigations() {
    fetch('/api/navigations')
      .then(r => r.json())
      .then(data => setNavigations(data.navigations || []))
      .catch(() => setNavigations([]));
  }

  function handleNew() {
    setSelectedTemplate(null);
    setTemplateName('');
    setTemplateCode('<section class="my-section">\n  <div class="container">\n    <h1>{{title}}</h1>\n    <p>{{text}}</p>\n  </div>\n</section>');
    setTemplateType(activeTemplateScope);
    setIsEditing(true);
  }

  function handleEdit(name, index) {
    fetch(`/api/templates?name=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(data => {
        setSelectedTemplate(index);
        setTemplateName(data.name);
        setTemplateCode(data.code);
        setTemplateType(data.type || 'SITE');
        setActiveTemplateScope(data.type || 'SITE');
        setIsEditing(true);
      })
      .catch(err => showToast('Fehler beim Laden: ' + err.message, 'error'));
  }

  function handleSave() {
    if (!templateName.trim()) {
      showToast('Bitte Template-Namen eingeben', 'error');
      return;
    }

    fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName, code: templateCode, type: templateType })
    })
      .then(r => r.json())
      .then(() => {
        showToast('Template gespeichert!', 'success');
        loadTemplates();
        setIsEditing(false);
        setSelectedTemplate(null);
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  function handleDelete(name, index) {
    fetch('/api/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
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

  async function insertSnippet(text) {
    await insertText(text, () => setTemplateCode(c => c + text))
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const siteTemplates = templates.filter((t) => (t.type || 'SITE') === 'SITE');
  const blockTemplates = templates.filter((t) => t.type === 'BLOCK');
  const filteredTemplates = templates.filter((t) => {
    const typeMatches = (t.type || 'SITE') === activeTemplateScope;
    const searchMatches = !normalizedSearch || t.name.toLowerCase().includes(normalizedSearch);
    return typeMatches && searchMatches;
  });

  const editorSnippets = snippets.filter((s) => !isSystemSnippet(s));

  return (
    <div className="editor-container">
      <div className="editor-sidebar">
        <div className="editor-header">
          <div className="editor-header-copy">
            <h2><Layout size={18} /> Templates</h2>
            {showDevHints && <p className="editor-role-hint">Bereich: Template-Liste, Filter und Schnellaktionen</p>}
          </div>
          <button
            className="icon-btn"
            onClick={handleNew}
            title={devTitle('Funktion: Neues Template anlegen')}
            aria-label="Neues Template anlegen"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="editor-search-wrap">
          <div className="editor-segmented-control template-scope-switcher">
            <button
              type="button"
              className={`editor-segment-btn ${activeTemplateScope === 'SITE' ? 'active' : ''}`}
              onClick={() => setActiveTemplateScope('SITE')}
              title={devTitle('Filter: Nur Site-Templates anzeigen')}
              aria-label="Nur Site-Templates anzeigen"
            >
              Site
              <span className="editor-segment-count">{siteTemplates.length}</span>
            </button>
            <button
              type="button"
              className={`editor-segment-btn ${activeTemplateScope === 'BLOCK' ? 'active' : ''}`}
              onClick={() => setActiveTemplateScope('BLOCK')}
              title={devTitle('Filter: Nur Block-Templates anzeigen')}
              aria-label="Nur Block-Templates anzeigen"
            >
              Block
              <span className="editor-segment-count">{blockTemplates.length}</span>
            </button>
          </div>
          <input
            className="editor-search-input"
            type="text"
            placeholder={`${activeTemplateScope === 'SITE' ? 'Site' : 'Block'} Templates suchen...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            title={devTitle(`Suche innerhalb der ${activeTemplateScope === 'SITE' ? 'Site' : 'Block'}-Templates`)}
            aria-label={`Template-Suche fuer ${activeTemplateScope === 'SITE' ? 'Site' : 'Block'}-Templates`}
          />
        </div>
        
        <div className="editor-list">
          {templates.length === 0 ? (
            <div className="empty-list-state">Keine Templates vorhanden</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="empty-list-state">Keine {activeTemplateScope === 'SITE' ? 'Site' : 'Block'} Templates{searchTerm ? ` für "${searchTerm}"` : ''}</div>
          ) : (
            filteredTemplates.map((t) => {
              const index = templates.findIndex((x) => x.name === t.name);
              return (
              <div 
                key={t.name} 
                className={`editor-list-item ${selectedTemplate === index ? 'active' : ''}`}
                onClick={() => handleEdit(t.name, index)}
                role="button"
                tabIndex={0}
                title={devTitle(`Komponente: Template ${t.name}. Funktion: Template zum Bearbeiten oeffnen.`)}
                aria-label={`Template ${t.name} zum Bearbeiten oeffnen`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleEdit(t.name, index);
                  }
                }}
              >
                <div className="editor-item-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {t.type === 'BLOCK' ? <Grid size={14} /> : <Layout size={14} />}
                    <div className="editor-item-label">{t.name}</div>
                    <span className={`template-type-badge ${t.type === 'BLOCK' ? 'block' : 'site'}`}>
                      {t.type === 'BLOCK' ? 'Block' : 'Site'}
                    </span>
                  </div>
                </div>
                <div className="editor-item-actions">
                  <button 
                    className="icon-btn-small" 
                    onClick={(e) => { e.stopPropagation(); handleEdit(t.name, index); }}
                    title={devTitle(`Funktion: Template ${t.name} bearbeiten`)}
                    aria-label={`Template ${t.name} bearbeiten`}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    className="icon-btn-small delete" 
                    onClick={(e) => { e.stopPropagation(); handleDelete(t.name, index); }}
                    title={devTitle(`Funktion: Template ${t.name} loeschen`)}
                    aria-label={`Template ${t.name} loeschen`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )})
          )}
        </div>
      </div>

      <div className="editor-main">
        {isEditing ? (
          <>
            <div className="editor-toolbar">
              {showDevHints && <span className="editor-role-hint">Bereich: Template-Metadaten und Speicheraktionen</span>}
              <input 
                type="text" 
                className="editor-name-input" 
                placeholder="Template Name" 
                value={templateName} 
                onChange={e => setTemplateName(e.target.value)}
                title={devTitle('Feld: Template-Name')}
                aria-label="Template-Name"
              />
              <div className="editor-toolbar-actions">
                <button className="btn-secondary" onClick={() => setIsEditing(false)} title={devTitle('Aenderungen verwerfen und Editor verlassen')}>Abbrechen</button>
                <button className="btn-primary" onClick={handleSave} title={devTitle('Template speichern')}>Speichern</button>
              </div>
            </div>
            
            <div className="templates-editor-columns">
              <div className="templates-editor-wrapper">
                <div className="editor-codemirror-wrapper">
                  <CodeEditor
                    height="100%"
                    language="html"
                    value={templateCode}
                    onChange={value => setTemplateCode(value || '')}
                    options={{}}
                  />
                </div>
              </div>

              <div className="editor-snippets-panel">
                <h4>Snippets einfügen</h4>
                {showDevHints && <p className="editor-section-hint">Funktion: Vorlagenbausteine, Navigationen und Referenzen in den Code einfuegen</p>}
                <div className="template-snippet-stack">
                  {SYSTEM_PLACEHOLDERS.length > 0 && (
                    <div className="snippet-group">
                      <div className="snippet-group-title">Systemwerte</div>
                      <div className="snippet-buttons">
                        {SYSTEM_PLACEHOLDERS.map(s => (
                          <button key={s.label} className="template-snippet-btn bound-snippet" title={devTitle(`Systemwert einfuegen: ${s.label}`)} aria-label={`Systemwert ${s.label} einfuegen`} {...createButtonHandlers(s.snippet || '', () => setTemplateCode(c => c + (s.snippet || '')))}>{s.label} ({s.snippet})</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {editorSnippets.length > 0 && (
                    <div className="snippet-group">
                      <div className="snippet-group-title">Gespeicherte Snippets</div>
                      <div className="snippet-buttons">
                        {editorSnippets.map(s => (
                          <button key={s.key || s.label} className={`template-snippet-btn ${s.type === 'defined' ? 'defined-snippet' : ''}`} title={devTitle(`Snippet-Referenz einfuegen: ${s.label}`)} aria-label={`Snippet-Referenz ${s.label} einfuegen`} {...createButtonHandlers(getSnippetReference(s), () => setTemplateCode(c => c + getSnippetReference(s)))}>{s.label} ({s.key})</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {navigations.length > 0 && (
                    <div className="snippet-group">
                      <div className="snippet-group-title">Navigationen</div>
                      <div className="snippet-buttons">
                        {navigations.map(nav => (
                          <button 
                            key={nav} 
                            className="template-snippet-btn navigation-snippet"
                            title={devTitle(`Navigation einfuegen: ${nav}`)}
                            aria-label={`Navigation ${nav} einfuegen`}
                            {...createButtonHandlers(`{{navigation:${nav}}}`, () => setTemplateCode(c => c + `{{navigation:${nav}}}`))}
                          >
                            📍 {nav}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="snippet-group">
                    <div className="snippet-group-title">Templates referenzieren</div>
                    <div className="snippet-buttons">
                      <button
                        className="template-snippet-btn"
                        {...createButtonHandlers('<h{{headingLevel}}>{{headingText}}</h{{headingLevel}}>', () => setTemplateCode(c => c + '<h{{headingLevel}}>{{headingText}}</h{{headingLevel}}>'))}
                        title="Dynamisches Heading mit frei wählbarem Level"
                      >
                        Heading Dynamisch
                      </button>
                      {templates
                        .filter(t => t.name !== templateName)
                        .map(t => (
                          <button 
                            key={t.name} 
                            className="template-snippet-btn template-snippet"
                            title={devTitle(`Template-Referenz einfuegen: ${t.name}`)}
                            aria-label={`Template-Referenz ${t.name} einfuegen`}
                            {...createButtonHandlers(`{{template:${t.name}}}`, () => setTemplateCode(c => c + `{{template:${t.name}}}`))}
                          >
                            🧩 {t.name}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className="snippet-group">
                    <div className="snippet-group-title">Strukturvorschau</div>
                    <TemplateStructurePreview code={templateCode} />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="editor-empty-state">
            <Layout size={48} strokeWidth={1} />
            <h3>Wähle ein Template zum Bearbeiten</h3>
            <p>oder erstelle ein neues mit dem <Plus size={16} style={{verticalAlign: 'middle'}} /> Button</p>
          </div>
        )}
      </div>
    </div>
  );
}
