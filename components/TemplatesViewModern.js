import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, Layout, Download, GripVertical, Grid } from 'lucide-react';
import { createButtonHandlers, insertText } from '../lib/insertHelper'

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

export default function TemplatesViewModern({ showToast }) {
  const [templates, setTemplates] = useState([]);
  // inserterRef no longer required; editor registers centrally
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [templateType, setTemplateType] = useState('SITE');
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
      .then(data => setSnippets(data || []))
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

  return (
    <div className="editor-container">
      <div className="editor-sidebar">
        <div className="editor-header">
          <h2><Layout size={18} /> Templates</h2>
          <button className="icon-btn" onClick={handleNew} title="Neues Template">
            <Plus size={18} />
          </button>
        </div>
        
        <div className="editor-list">
          {templates.length === 0 ? (
            <div className="empty-list-state">Keine Templates vorhanden</div>
          ) : (
            templates.map((t, index) => (
              <div 
                key={t.name} 
                className={`editor-list-item ${selectedTemplate === index ? 'active' : ''}`}
              >
                <div className="editor-item-info" onClick={() => handleEdit(t.name, index)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {t.type === 'BLOCK' ? <Grid size={14} /> : <Layout size={14} />}
                    <div className="editor-item-label">{t.name}</div>
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
            ))
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
                style={{ marginLeft: 8, padding: '6px 8px', borderRadius: 4 }}
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
              <div className="snippet-buttons">
                {snippets.map(s => (
                  <button 
                    key={s.label} 
                    className="template-snippet-btn"
                    {...createButtonHandlers(s.snippet, () => setTemplateCode(c => c + s.snippet))}
                  >
                    {s.label}
                  </button>
                ))}
                {navigations.map(nav => (
                  <button 
                    key={nav} 
                    className="template-snippet-btn navigation-snippet"
                    {...createButtonHandlers(`{{navigation:${nav}}}`, () => setTemplateCode(c => c + `{{navigation:${nav}}}`))}
                  >
                    📍 {nav}
                  </button>
                ))}
                {templates
                  .filter(t => t.name !== templateName) // Verhindere Selbstreferenz
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
