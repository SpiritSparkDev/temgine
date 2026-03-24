import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, Layout, Download, GripVertical, Grid } from 'lucide-react';
import { createButtonHandlers, insertText } from '../lib/insertHelper'
import boundSnippets from '../data/boundSnippets.json'

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

export default function TemplatesViewModern({ showToast }) {
  const [templates, setTemplates] = useState([]);
  // inserterRef no longer required; editor registers centrally
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [templateType, setTemplateType] = useState('SITE');
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
        const fetched = data || []
        // Build bound snippet entries from static list so they appear in editor toolbar
        const boundEntries = (boundSnippets || []).map(b => ({ label: b.label, snippet: `{{snippet:${b.label}}}`, type: 'bound' }))
        // Merge: bound snippets first (immutable), then fetched snippets from DB
        setSnippets([...boundEntries, ...fetched])
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
  const filteredTemplates = templates.filter((t) => {
    if (!normalizedSearch) return true;
    return t.name.toLowerCase().includes(normalizedSearch);
  });

  const boundSnippets = snippets.filter((s) => s.type === 'bound');
  const definedSnippets = snippets.filter((s) => s.type === 'defined');
  const freeSnippets = snippets.filter((s) => !s.type || (s.type !== 'bound' && s.type !== 'defined'));

  return (
    <div className="editor-container">
      <div className="editor-sidebar">
        <div className="editor-header">
          <h2><Layout size={18} /> Templates</h2>
          <button className="icon-btn" onClick={handleNew} title="Neues Template">
            <Plus size={18} />
          </button>
        </div>

        <div className="editor-search-wrap">
          <input
            className="editor-search-input"
            type="text"
            placeholder="Templates suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="editor-list">
          {templates.length === 0 ? (
            <div className="empty-list-state">Keine Templates vorhanden</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="empty-list-state">Keine Treffer für "{searchTerm}"</div>
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
                    title="Bearbeiten"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    className="icon-btn-small delete" 
                    onClick={(e) => { e.stopPropagation(); handleDelete(t.name, index); }}
                    title="Löschen"
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
              <input 
                type="text" 
                className="editor-name-input" 
                placeholder="Template Name" 
                value={templateName} 
                onChange={e => setTemplateName(e.target.value)}
              />
              <select
                value={templateType}
                onChange={e => setTemplateType(e.target.value)}
                className="editor-filter-select"
                title="Template Type"
              >
                <option value="SITE">Site Template</option>
                <option value="BLOCK">Block Template</option>
              </select>
              <div className="editor-toolbar-actions">
                <button className="btn-secondary" onClick={() => setIsEditing(false)}>Abbrechen</button>
                <button className="btn-primary" onClick={handleSave}>Speichern</button>
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
                <div className="template-snippet-stack">
                  {boundSnippets.length > 0 && (
                    <div className="snippet-group">
                      <div className="snippet-group-title">Gebundene Snippets</div>
                      <div className="snippet-buttons">
                        {boundSnippets.map(s => (
                          <button key={s.label} className="template-snippet-btn bound-snippet" {...createButtonHandlers(s.snippet || '', () => setTemplateCode(c => c + (s.snippet || '')))}>{s.label} ({s.snippet})</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {definedSnippets.length > 0 && (
                    <div className="snippet-group">
                      <div className="snippet-group-title">Definierte Snippets</div>
                      <div className="snippet-buttons">
                        {definedSnippets.map(s => (
                          <button key={s.label} className="template-snippet-btn defined-snippet" {...createButtonHandlers(s.snippet || '', () => setTemplateCode(c => c + (s.snippet || '')))}>{s.label}{s.handler ? ` - ${s.handler}` : ''}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {freeSnippets.length > 0 && (
                    <div className="snippet-group">
                      <div className="snippet-group-title">Freie Snippets</div>
                      <div className="snippet-buttons">
                        {freeSnippets.map(s => (
                          <button key={s.label} className="template-snippet-btn" {...createButtonHandlers(s.snippet || '', () => setTemplateCode(c => c + (s.snippet || '')))}>{s.label}</button>
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
                      {templates
                        .filter(t => t.name !== templateName)
                        .map(t => (
                          <button 
                            key={t.name} 
                            className="template-snippet-btn template-snippet"
                            {...createButtonHandlers(`{{template:${t.name}}}`, () => setTemplateCode(c => c + `{{template:${t.name}}}`))}
                          >
                            🧩 {t.name}
                          </button>
                        ))}
                    </div>
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
