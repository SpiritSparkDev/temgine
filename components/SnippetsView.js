import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, Code } from 'lucide-react';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });
import { createButtonHandlers } from '../lib/insertHelper'

export default function SnippetsView({ showToast }) {
  const [snippets, setSnippets] = useState([]);
  const [selectedSnippet, setSelectedSnippet] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);


  useEffect(() => {
    loadSnippets();
  }, []);

  function loadSnippets() {
    fetch('/api/snippets')
      .then(r => r.json())
      .then(data => {
        setSnippets(data || []);
      })
      .catch(() => setSnippets([]));
  }

  function handleNew() {
    setSelectedSnippet(null);
    setEditLabel('');
    setEditContent('');
    setEditType('free');
    setEditHandler('');
    setIsEditing(true);
  }

  function handleEdit(snippet, index) {
    setSelectedSnippet(index);
    setEditLabel(snippet.label);
    setEditContent(snippet.snippet);
    setEditType(snippet.type || 'free');
    setEditHandler(snippet.handler || '');
    setIsEditing(true);
  }

  const [editType, setEditType] = useState('free');
  const [editHandler, setEditHandler] = useState('');
  const [activeTab, setActiveTab] = useState('content');

  function handleSave() {
    const newSnippets = [...snippets];
    let snippetValue = editContent;
    if (editType === 'bound') {
      // ensure bound snippets use the #token form; if user left content empty, derive from label
      if (!snippetValue || !snippetValue.startsWith('#')) {
        const token = String(editContent || editLabel || '').trim() || ''
        const sanitized = token.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\.-]/g, '').toLowerCase()
        snippetValue = '#' + (sanitized || 'value')
      }
    }
    const snippetData = { label: editLabel, snippet: snippetValue, type: editType };
    if (editHandler) snippetData.handler = editHandler;
    
    if (selectedSnippet !== null) {
      newSnippets[selectedSnippet] = snippetData;
    } else {
      newSnippets.push(snippetData);
    }
    
    fetch('/api/snippets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSnippets)
    })
      .then(() => {
        showToast('Snippet gespeichert', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 500);
      })
      .catch(err => showToast('Fehler beim Speichern: ' + err.message, 'error'));
  }

  // Use centralized insert helper
  function fallbackAppend(text) { setEditContent(c => c + text) }

  function handleDelete(index) {
    // Bestätigung wird durch UI-Interaktion impliziert
    
    const newSnippets = snippets.filter((_, i) => i !== index);
    
    fetch('/api/snippets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSnippets)
    })
      .then(() => {
        setSnippets(newSnippets);
        if (selectedSnippet === index) {
          setIsEditing(false);
          setSelectedSnippet(null);
        }
      })
      .catch(err => showToast('Fehler beim Löschen: ' + err.message, 'error'));
  }

  return (
    <div className="snippets-editor-container">
      <div className="snippets-sidebar">
        <div className="snippets-header">
          <h2><Code size={18} /> Snippets</h2>
          <button className="icon-btn" onClick={handleNew} title="Neues Snippet">
            <Plus size={18} />
          </button>
        </div>
        
        <div className="snippets-list">
          {snippets.length === 0 ? (
            <div className="empty-state">Keine Snippets vorhanden</div>
          ) : (
            snippets.map((snippet, index) => (
              <div 
                key={index} 
                className={`snippet-list-item ${selectedSnippet === index ? 'active' : ''}`}
              >
                <div className="snippet-info" onClick={() => handleEdit(snippet, index)}>
                  <div className="snippet-label">{snippet.label}</div>
                  <div className="snippet-preview">{snippet.snippet.substring(0, 60)}...</div>
                </div>
                <div className="snippet-actions">
                  <button 
                    className="icon-btn-small" 
                    onClick={(e) => { e.stopPropagation(); handleEdit(snippet, index); }}
                    title="Bearbeiten"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    className="icon-btn-small delete" 
                    onClick={(e) => { e.stopPropagation(); handleDelete(index); }}
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

      <div className="snippets-editor">
        {isEditing ? (
          <>
            <div className="editor-header">
              <div className="snippet-tabs" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className={`tab-btn ${activeTab === 'content' ? 'active' : ''}`} onClick={() => setActiveTab('content')}>Inhalt</button>
                <button className={`tab-btn ${activeTab === 'meta' ? 'active' : ''}`} onClick={() => setActiveTab('meta')}>Metadaten</button>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="editor-actions">
                  <button className="btn-secondary" onClick={() => setIsEditing(false)}>Abbrechen</button>
                  <button className="btn-primary" onClick={handleSave}>Speichern</button>
                </div>
              </div>
            </div>

            <div className="templates-editor-columns">
              <div className="templates-editor-wrapper" style={{ flex: 1 }}>
                <div className="editor-wrapper">
                  {activeTab === 'content' ? (
                    <CodeEditor
                      height="600px"
                      language="html"
                      value={editContent}
                      onChange={v => setEditContent(v || '')}
                      options={{}}
                    />
                  ) : (
                    <div style={{ padding: 12 }}>
                      <label>Label</label>
                      <input
                        type="text"
                        className="snippet-label-input"
                        placeholder="Snippet Name"
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        style={{ width: '100%', marginBottom: 8 }}
                      />
                      <label>Typ</label>
                      <select value={editType} onChange={e => setEditType(e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
                        <option value="free">Free (editable)</option>
                        <option value="bound">Bound (#name) — auto-filled from DB</option>
                        <option value="defined">Defined (special handler)</option>
                      </select>
                      {editType === 'defined' && (
                        <>
                          <label>Handler</label>
                          <input type="text" placeholder="handler (e.g. url, heading)" value={editHandler} onChange={e => setEditHandler(e.target.value)} style={{ width: '100%' }} />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="editor-snippets-panel">
                <h4>Einfügehilfen</h4>
                <div className="snippet-buttons">
                  <button type="button" className="template-snippet-btn" {...createButtonHandlers('{{title}}', () => fallbackAppend('{{title}}'))}>{'{{title}}'}</button>
                  <button type="button" className="template-snippet-btn" {...createButtonHandlers('{{text}}', () => fallbackAppend('{{text}}'))}>{'{{text}}'}</button>
                  <button type="button" className="template-snippet-btn" {...createButtonHandlers('{{images.0}}', () => fallbackAppend('{{images.0}}'))}>{'{{images.0}}'}</button>
                  <button type="button" className="template-snippet-btn" {...createButtonHandlers('{{author}}', () => fallbackAppend('{{author}}'))}>{'{{author}}'}</button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-editor-state">
            <Code size={48} strokeWidth={1} />
            <h3>Wähle ein Snippet zum Bearbeiten</h3>
            <p>oder erstelle ein neues mit dem <Plus size={16} style={{verticalAlign: 'middle'}} /> Button</p>
          </div>
        )}
      </div>
    </div>
  );
}
