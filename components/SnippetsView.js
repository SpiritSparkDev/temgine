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
    setIsEditing(true);
  }

  function handleEdit(snippet, index) {
    setSelectedSnippet(index);
    setEditLabel(snippet.label);
    setEditContent(snippet.snippet);
    setIsEditing(true);
  }

  function handleSave() {
    const newSnippets = [...snippets];
    const snippetData = { label: editLabel, snippet: editContent };
    
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
              <input 
                type="text" 
                className="snippet-label-input" 
                placeholder="Snippet Name" 
                value={editLabel} 
                onChange={e => setEditLabel(e.target.value)}
              />
              <div className="editor-actions">
                <button className="btn-secondary" onClick={() => setIsEditing(false)}>Abbrechen</button>
                <button className="btn-primary" onClick={handleSave}>Speichern</button>
              </div>
            </div>
            
            <div className="templates-editor-columns">
              <div className="templates-editor-wrapper">
                <div className="editor-wrapper">
                  <CodeEditor
                    height="600px"
                    language="html"
                    value={editContent}
                    onChange={v => setEditContent(v || '')}
                    options={{}}
                  />
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
