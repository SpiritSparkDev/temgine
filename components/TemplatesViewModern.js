import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, Layout, Download, GripVertical } from 'lucide-react';
import { createButtonHandlers, insertText } from '../lib/insertHelper'

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

export default function TemplatesViewModern({ showToast }) {
  const [templates, setTemplates] = useState([]);
  // inserterRef no longer required; editor registers centrally
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateCode, setTemplateCode] = useState('');
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
      .then(data => setTemplates(data || []))
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
      body: JSON.stringify({ name: templateName, code: templateCode })
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
            templates.map((name, index) => (
              <div 
                key={name} 
                className={`editor-list-item ${selectedTemplate === index ? 'active' : ''}`}
              >
                <div className="editor-item-info" onClick={() => handleEdit(name, index)}>
                  <div className="editor-item-label">{name}</div>
                </div>
                <div className="editor-item-actions">
                  <button 
                    className="icon-btn-small" 
                    onClick={(e) => { e.stopPropagation(); handleEdit(name, index); }}
                    title="Bearbeiten"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    className="icon-btn-small delete" 
                    onClick={(e) => { e.stopPropagation(); handleDelete(name, index); }}
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
