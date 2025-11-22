import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, Menu } from 'lucide-react';
import { createButtonHandlers, insertText } from '../lib/insertHelper'

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

export default function NavigationViewModern({ showToast }) {
  const [navigations, setNavigations] = useState([]);
  const [selectedNav, setSelectedNav] = useState(null);
  const [navName, setNavName] = useState('');
  const [navCode, setNavCode] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  // editor registers centrally via registerEditorApi
  

  useEffect(() => {
    loadNavigations();
  }, []);

  function loadNavigations() {
    fetch('/api/navigations')
      .then(r => r.json())
      .then(data => setNavigations(data.navigations || []))
      .catch(() => setNavigations([]));
  }

  function handleNew() {
    setSelectedNav(null);
    setNavName('');
    setNavCode('<nav class="main-nav">\n  <ul>\n    {{#pages}}\n      <li>\n        <a href="/{{slug}}">{{title}}</a>\n        {{#children}}\n          <ul>\n            {{#.}}\n              <li><a href="/{{slug}}">{{title}}</a></li>\n            {{/.}}\n          </ul>\n        {{/children}}\n      </li>\n    {{/pages}}\n  </ul>\n</nav>');
    setIsEditing(true);
  }

  function handleEdit(name, index) {
    fetch(`/api/navigations?name=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(data => {
        setSelectedNav(index);
        setNavName(data.name);
        setNavCode(data.code);
        setIsEditing(true);
      })
      .catch(err => showToast('Fehler beim Laden: ' + err.message, 'error'));
  }

  function handleSave() {
    if (!navName.trim()) {
      showToast('Bitte Navigation-Namen eingeben', 'error');
      return;
    }

    fetch('/api/navigations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: navName, code: navCode })
    })
      .then(() => {
        showToast('Navigation gespeichert!', 'success');
        loadNavigations();
        setIsEditing(false);
        setSelectedNav(null);
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  function handleDelete(name, index) {
    fetch('/api/navigations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
      .then(() => {
        showToast('Navigation gelöscht', 'success');
        loadNavigations();
        if (selectedNav === index) {
          setIsEditing(false);
          setSelectedNav(null);
        }
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  async function insertSnippet(text) {
    await insertText(text, () => setNavCode(c => c + text))
  }

  return (
    <div className="editor-container">
      <div className="editor-sidebar">
        <div className="editor-header">
          <h2><Menu size={18} /> Navigation</h2>
          <button className="icon-btn" onClick={handleNew} title="Neue Navigation">
            <Plus size={18} />
          </button>
        </div>
        
        <div className="editor-list">
          {navigations.length === 0 ? (
            <div className="empty-list-state">Keine Navigationen vorhanden</div>
          ) : (
            navigations.map((name, index) => (
              <div 
                key={name} 
                className={`editor-list-item ${selectedNav === index ? 'active' : ''}`}
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
                placeholder="Navigation Name" 
                value={navName} 
                onChange={e => setNavName(e.target.value)}
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
                    value={navCode}
                    onChange={value => setNavCode(value || '')}
                    options={{}}
                  />
                </div>
              </div>

              <div className="editor-snippets-panel">
              <h4>Mustache Variablen</h4>
              <div className="snippet-buttons">
                <button className="template-snippet-btn" {...createButtonHandlers('{{#pages}}\n  \n{{/pages}}', () => setNavCode(c => c + '{{#pages}}\n  \n{{/pages}}'))}>{'{{#pages}}'}</button>
                <button className="template-snippet-btn" {...createButtonHandlers('{{slug}}', () => setNavCode(c => c + '{{slug}}'))}>{'{{slug}}'}</button>
                <button className="template-snippet-btn" {...createButtonHandlers('{{title}}', () => setNavCode(c => c + '{{title}}'))}>{'{{title}}'}</button>
                <button className="template-snippet-btn" {...createButtonHandlers('{{#children}}\n  \n{{/children}}', () => setNavCode(c => c + '{{#children}}\n  \n{{/children}}'))}>{'{{#children}}'}</button>
              </div>
              </div>
            </div>
          </>
        ) : (
          <div className="editor-empty-state">
            <Menu size={48} strokeWidth={1} />
            <h3>Wähle eine Navigation zum Bearbeiten</h3>
            <p>oder erstelle eine neue mit dem <Plus size={16} style={{verticalAlign: 'middle'}} /> Button</p>
          </div>
        )}
      </div>
    </div>
  );
}
