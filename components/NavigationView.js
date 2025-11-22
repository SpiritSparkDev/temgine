import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Save, Eye, FileText, Plus, Trash2 } from 'lucide-react';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

export default function NavigationView({ showToast }) {
  const [navigations, setNavigations] = useState([]);
  const [selectedNav, setSelectedNav] = useState('');
  const [navName, setNavName] = useState('');
  const [navCode, setNavCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  

  useEffect(() => {
    loadNavigations();
  }, []);

  const loadNavigations = async () => {
    try {
      const res = await fetch('/api/navigations');
      const data = await res.json();
      setNavigations(data.navigations || []);
    } catch (error) {
      showToast('Fehler beim Laden der Navigationen: ' + error.message, 'error');
    }
  };

  const loadNavigation = async (name) => {
    if (!name) return;
    try {
      const res = await fetch(`/api/navigations?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      setSelectedNav(name);
      setNavName(name);
      setNavCode(data.code || '');
      setIsCreating(false);
    } catch (error) {
      showToast('Fehler beim Laden: ' + error.message, 'error');
    }
  };

  const saveNavigation = async () => {
    const name = navName.trim();
    if (!name) {
      showToast('Bitte Namen eingeben', 'error');
      return;
    }

    try {
      const res = await fetch('/api/navigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code: navCode }),
      });

      if (res.ok) {
        showToast('Navigation gespeichert', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        const error = await res.json();
        showToast(error.error || 'Fehler beim Speichern', 'error');
      }
    } catch (error) {
      showToast('Fehler: ' + error.message, 'error');
    }
  };

  const deleteNavigation = async () => {
    const name = navName.trim();
    if (!name) {
      showToast('Keine Navigation ausgewählt', 'error');
      return;
    }

    try {
      const res = await fetch('/api/navigations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        showToast('Navigation gelöscht', 'success');
        setNavName('');
        setNavCode('<nav class="main-nav">\n  <ul>\n    {{#each pages}}\n      <li><a href="/{{slug}}">{{title}}</a></li>\n    {{/each}}\n  </ul>\n</nav>');
        setSelectedNav('');
        await loadNavigations();
      } else {
        const error = await res.json();
        showToast(error.error || 'Fehler beim Löschen', 'error');
      }
    } catch (error) {
      showToast('Fehler: ' + error.message, 'error');
    }
  };

  const handleNew = () => {
    setNavName('');
    setNavCode('<nav class="main-nav">\n  <ul>\n    {{#each pages}}\n      <li><a href="/{{slug}}">{{title}}</a></li>\n    {{/each}}\n  </ul>\n</nav>');
    setSelectedNav('');
    setIsCreating(true);
  };

  const insertSnippet = (snippet) => {
    // Append snippet to nav code since CodeEditor does not expose Monaco APIs
    setNavCode(c => c + snippet);
  };

  return (
    <div className="templates-view">
      <div className="templates-sidebar">
        <div className="sidebar-header">
          <h3>Navigationen</h3>
          <button className="icon-btn" onClick={handleNew} title="Neue Navigation">
            <Plus size={18} />
          </button>
        </div>

        <div className="templates-list">
          {navigations.map(nav => (
            <div
              key={nav}
              className={`template-item ${selectedNav === nav ? 'active' : ''}`}
              onClick={() => loadNavigation(nav)}
            >
              <FileText size={16} />
              <span>{nav}</span>
            </div>
          ))}
        </div>

        <div className="sidebar-section">
          <h4>Verfügbare Variablen</h4>
          <div className="snippets-grid">
            <button className="snippet-btn" onMouseDown={(e) => { e.preventDefault(); insertSnippet('{{#each pages}}'); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertSnippet('{{#each pages}}'); } }}>
              #each pages
            </button>
            <button className="snippet-btn" onMouseDown={(e) => { e.preventDefault(); insertSnippet('{{/each}}'); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertSnippet('{{/each}}'); } }}>
              /each
            </button>
            <button className="snippet-btn" onMouseDown={(e) => { e.preventDefault(); insertSnippet('{{title}}'); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertSnippet('{{title}}'); } }}>
              title
            </button>
            <button className="snippet-btn" onMouseDown={(e) => { e.preventDefault(); insertSnippet('{{slug}}'); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertSnippet('{{slug}}'); } }}>
              slug
            </button>
            <button className="snippet-btn" onMouseDown={(e) => { e.preventDefault(); insertSnippet('{{#if children}}'); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertSnippet('{{#if children}}'); } }}>
              #if children
            </button>
            <button className="snippet-btn" onMouseDown={(e) => { e.preventDefault(); insertSnippet('{{/if}}'); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); insertSnippet('{{/if}}'); } }}>
              /if
            </button>
          </div>
        </div>
      </div>

      <div className="templates-editor">
        <div className="editor-header">
          <div className="header-left">
            <input
              type="text"
              value={navName}
              onChange={e => setNavName(e.target.value)}
              placeholder="Navigationsname"
              className="nav-name-input"
            />
          </div>
          <div className="header-actions">
            <button className="btn-secondary" onClick={deleteNavigation} disabled={!navName}>
              <Trash2 size={16} />
              Löschen
            </button>
            <button className="btn-primary" onClick={saveNavigation}>
              <Save size={16} />
              Speichern
            </button>
          </div>
        </div>

        <div className="editor-content">
          <CodeEditor
            height="600px"
            language="html"
            value={navCode}
            onChange={value => setNavCode(value || '')}
            options={{}}
          />
        </div>

        <div className="editor-info">
          <p>
            <strong>Hinweis:</strong> Navigationen werden automatisch aus dem Seitenbaum generiert.
            Verwende <code>{'{{#each pages}}'}</code> um über alle Seiten zu iterieren.
            Jede Seite hat: <code>title</code>, <code>slug</code>, <code>children</code>
          </p>
        </div>
      </div>
    </div>
  );
}
