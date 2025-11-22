import React, { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, Layout, Download, GripVertical } from 'lucide-react';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

export default function TemplatesViewModern({ showToast }) {
  const [templates, setTemplates] = useState([]);
  // Ref to receive the inserter function from CodeEditor
  const inserterRef = useRef(null);
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
    try {
      const api = inserterRef.current || window.__temphelix_editor_api || window.__temphelix_active_editor;
      if (api) {
        try { if (typeof api.focus === 'function') api.focus(); } catch (e) {}
        await new Promise(r => setTimeout(r, 60));
        if (typeof api.insertAsync === 'function') {
          try { const ok = await api.insertAsync(text); if (ok) return; } catch (e) {}
        } else if (typeof api.insert === 'function') {
          try { const ok = api.insert(text); if (ok) return; } catch (e) {}
          await new Promise(r => setTimeout(r, 50));
          try { api.insert(text); return; } catch (e) {}
        }
      }
    } catch (e) {}
    // Fallback: append to the content
    setTemplateCode(c => c + text);
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
                    registerInserter={(fn) => { inserterRef.current = fn }}
                  />
                </div>
              </div>

              <div className="editor-snippets-panel">
              <h4>Snippets einfügen</h4>
              <div className="snippet-buttons">
                {snippets.map(s => (
                  <button 
                    key={s.label} 
                    onMouseDown={(e) => { e.preventDefault(); insertSnippet(s.snippet); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertSnippet(s.snippet); } }}
                    className="template-snippet-btn"
                  >
                    {s.label}
                  </button>
                ))}
                {navigations.map(nav => (
                  <button 
                    key={nav} 
                    onMouseDown={(e) => { e.preventDefault(); insertSnippet(`{{navigation:${nav}}}`); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertSnippet(`{{navigation:${nav}}}`); } }}
                    className="template-snippet-btn navigation-snippet"
                  >
                    📍 {nav}
                  </button>
                ))}
                {templates
                  .filter(tmpl => tmpl !== templateName) // Verhindere Selbstreferenz
                  .map(tmpl => (
                    <button 
                      key={tmpl} 
                      onMouseDown={(e) => { e.preventDefault(); insertSnippet(`{{template:${tmpl}}}`); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertSnippet(`{{template:${tmpl}}}`); } }}
                      className="template-snippet-btn template-snippet"
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
