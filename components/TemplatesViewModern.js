import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { insertText } from '../lib/insertHelper';
import { extractTemplateVariables, guessInputType } from '../lib/templateParser';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

const SYSTEM_PLACEHOLDERS = [
  { label: 'Bloecke', snippet: '{{{blocks}}}', type: 'html' },
  { label: 'Titel', snippet: '{{title}}', type: 'string' },
  { label: 'Slug', snippet: '{{slug}}', type: 'string' },
  { label: 'Seitenkopf', snippet: '{{data.pageHeader}}', type: 'string' },
  { label: 'Kindseite', snippet: '{{isChild}}', type: 'boolean' },
];

const TYPE_COLORS = {
  image: '#4d9fff',
  url: '#80d4ff',
  textarea: '#a5d6a7',
  array: '#ffab40',
  number: '#ff8a65',
  text: '#999',
  date: '#ce93d8',
  boolean: '#4db6ac',
};

export default function TemplatesViewModern({ showToast }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('variables');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  function loadTemplates() {
    fetch('/api/templates')
      .then(r => r.json())
      .then(data => {
        let list = Array.isArray(data) ? data : [];
        setTemplates(list);
      })
      .catch(() => setTemplates([]));
  }

  function handleNew() {
    const blank = '<section class="my-section">\n  <div class="container">\n    <h1>{{title}}</h1>\n    <p>{{text}}</p>\n  </div>\n</section>';
    setSelectedTemplate(null);
    setTemplateName('');
    setTemplateCode(blank);
    setIsDirty(true);
    setActiveTab('variables');
  }

  function handleSelect(tpl) {
    if (isDirty && window.confirm('Ungespeicherte Aenderungen verwerfen?') === false) return;
    fetch(`/api/templates?name=${encodeURIComponent(tpl.name)}`)
      .then(r => r.json())
      .then(data => {
        setSelectedTemplate({ name: data.name, code: data.code });
        setTemplateName(data.name);
        setTemplateCode(data.code || '');
        setIsDirty(false);
        setActiveTab('variables');
      })
      .catch(err => showToast('Fehler beim Laden: ' + err.message, 'error'));
  }

  function handleCodeChange(value) {
    setTemplateCode(value || '');
    setIsDirty(true);
  }

  function handleNameChange(e) {
    setTemplateName(e.target.value);
    setIsDirty(true);
  }

  async function handleSave() {
    const name = templateName.trim();
    if (!name) {
      showToast('Bitte Template-Namen eingeben', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code: templateCode, type: 'BLOCK' })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('Template gespeichert!', 'success');
      setSelectedTemplate({ name, code: templateCode });
      setIsDirty(false);
      loadTemplates();
    } catch (err) {
      showToast('Fehler: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(tplName, e) {
    e.stopPropagation();
    if (!window.confirm(`Template "${tplName}" wirklich loeschen?`)) return;
    try {
      await fetch('/api/templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tplName })
      });
      showToast('Template geloescht', 'success');
      if (selectedTemplate?.name === tplName) {
        setSelectedTemplate(null);
        setTemplateName('');
        setTemplateCode('');
        setIsDirty(false);
      }
      loadTemplates();
    } catch (err) {
      showToast('Fehler beim Loeschen: ' + err.message, 'error');
    }
  }

  function handleCancel() {
    if (isDirty && !window.confirm('Aenderungen verwerfen?')) return;
    if (selectedTemplate) {
      setTemplateName(selectedTemplate.name);
      setTemplateCode(selectedTemplate.code);
    } else {
      setTemplateName('');
      setTemplateCode('');
    }
    setIsDirty(false);
  }

  async function handleInsert(text) {
    await insertText(text, () => setTemplateCode(c => c + text));
  }

  const filteredTemplates = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(t => t.name.toLowerCase().includes(q));
  }, [templates, searchTerm]);

  const extractedVars = useMemo(() => {
    if (!templateCode) return [];
    return extractTemplateVariables(templateCode);
  }, [templateCode]);

  const hasOpenTemplate = templateName !== '' || templateCode !== '';

  return (
    <div className="tce-container">
      <div className="tce-toolbar">
        <div className="tce-toolbar-left">
          {hasOpenTemplate ? (
            <input
              type="text"
              className="tce-name-input"
              value={templateName}
              onChange={handleNameChange}
              placeholder="template-name"
            />
          ) : (
            <span className="tce-toolbar-title">Templates</span>
          )}
        </div>
        {hasOpenTemplate && (
          <div className="tce-toolbar-right">
            <button className="tce-btn" onClick={handleCancel} title="Aenderungen verwerfen">
              <X size={14} /> Abbrechen
            </button>
            <button
              className="tce-btn tce-btn--primary"
              onClick={handleSave}
              disabled={isSaving}
              title="Template speichern"
            >
              <Save size={14} /> {isSaving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        )}
      </div>

      <div className="tce-columns">
        <div className="tce-panel tce-panel--left">
          <div className="tce-panel-header">
            <span className="tce-panel-title">Templates</span>
            <button
              className="tce-icon-btn"
              onClick={handleNew}
              title="Neues Template"
              aria-label="Neues Template anlegen"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="tce-panel-search">
            <input
              type="text"
              className="tce-search-input"
              placeholder="Suchen..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="tce-list">
            {templates.length === 0 ? (
              <div className="tce-empty">Keine Templates vorhanden</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="tce-empty">Keine Treffer</div>
            ) : (
              filteredTemplates.map(t => (
                <div
                  key={t.name}
                  className={`tce-list-item ${selectedTemplate?.name === t.name ? 'active' : ''}`}
                  onClick={() => handleSelect(t)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(t); } }}
                  aria-label={`Template ${t.name} oeffnen`}
                >
                  <span className="tce-list-item-name">{t.name}</span>
                  <div className="tce-list-item-actions">
                    <button
                      className="tce-icon-btn tce-icon-btn--small tce-icon-btn--danger"
                      onClick={e => handleDelete(t.name, e)}
                      title={`Template ${t.name} loeschen`}
                      aria-label={`Template ${t.name} loeschen`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="tce-panel tce-panel--center">
          {hasOpenTemplate ? (
            <>
              <div className="tce-code-tabs">
                <div className="tce-code-tab active">
                  <Edit2 size={12} />
                  <span>{templateName || 'neues-template'}.html</span>
                </div>
              </div>
              <div className="tce-code-editor-wrap">
                <CodeEditor
                  height="100%"
                  language="html"
                  value={templateCode}
                  onChange={handleCodeChange}
                  options={{}}
                />
              </div>
            </>
          ) : (
            <div className="tce-empty-state">
              <Edit2 size={40} strokeWidth={1} />
              <p>Template aus der Liste waehlen oder neues erstellen</p>
              <button className="tce-btn tce-btn--primary" onClick={handleNew}>
                <Plus size={14} /> Neues Template
              </button>
            </div>
          )}
        </div>

        <div className="tce-panel tce-panel--right">
          <div className="tce-props-tabs">
            <button
              className={`tce-props-tab ${activeTab === 'variables' ? 'active' : ''}`}
              onClick={() => setActiveTab('variables')}
            >
              Variables
            </button>
            <button
              className={`tce-props-tab ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          </div>

          <div className="tce-props-content">
            {activeTab === 'variables' && (
              <>
                <div className="tce-var-section">
                  <div className="tce-var-section-title">Systemwerte</div>
                  {SYSTEM_PLACEHOLDERS.map(p => (
                    <div
                      key={p.snippet}
                      className="tce-var-item"
                      onClick={() => handleInsert(p.snippet)}
                      role="button"
                      tabIndex={0}
                      title={`${p.snippet} einfuegen`}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleInsert(p.snippet); } }}
                    >
                      <span className="tce-var-type" style={{ color: TYPE_COLORS[p.type] || '#999' }}>{p.type}</span>
                      <span className="tce-var-name">{p.snippet}</span>
                      <span className="tce-var-insert">Insert</span>
                    </div>
                  ))}
                </div>

                {hasOpenTemplate && (
                  <div className="tce-var-section">
                    <div className="tce-var-section-title">
                      Template-Variablen
                      {extractedVars.length > 0 && <span className="tce-var-count">{extractedVars.length}</span>}
                    </div>
                    {extractedVars.length === 0 ? (
                      <div className="tce-var-empty">Keine freien Variablen erkannt</div>
                    ) : (
                      extractedVars.map(varName => {
                        const type = guessInputType(varName);
                        const snippet = `{{${varName}}}`;
                        return (
                          <div
                            key={varName}
                            className="tce-var-item"
                            onClick={() => handleInsert(snippet)}
                            role="button"
                            tabIndex={0}
                            title={`${snippet} einfuegen`}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleInsert(snippet); } }}
                          >
                            <span className="tce-var-type" style={{ color: TYPE_COLORS[type] || '#999' }}>{type}</span>
                            <span className="tce-var-name">{snippet}</span>
                            <span className="tce-var-insert">Insert</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

              </>
            )}

            {activeTab === 'settings' && (
              <div className="tce-var-section">
                <div className="tce-var-section-title">Template-Einstellungen</div>
                <div className="tce-setting-group">
                  <label className="tce-setting-label">Name</label>
                  <input
                    type="text"
                    className="tce-setting-input"
                    value={templateName}
                    onChange={handleNameChange}
                    placeholder="template-name"
                  />
                </div>
                <div className="tce-setting-group">
                  <label className="tce-setting-label">Typ</label>
                  <input type="text" className="tce-setting-input" value="Block" readOnly />
                </div>
                <div className="tce-setting-group">
                  <label className="tce-setting-label">Zeilen</label>
                  <input
                    type="text"
                    className="tce-setting-input"
                    value={templateCode ? templateCode.split('\n').length : 0}
                    readOnly
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tce-statusbar">
        <div className="tce-statusbar-left">
          <span className="tce-status-dot" style={{ background: isDirty ? '#f39c12' : '#00c853' }} />
          <span>{isDirty ? 'Ungespeichert' : 'Gespeichert'}</span>
          <span>UTF-8</span>
          <span>HTML</span>
          <span>{templates.length} Templates</span>
        </div>
        <div className="tce-statusbar-right">
          <span>{extractedVars.length > 0 ? `${extractedVars.length} Variablen` : 'Keine Variablen'}</span>
        </div>
      </div>

      <style>{`
        .tce-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #1a1a1a;
          color: #e1e1e1;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          overflow: hidden;
        }
        .tce-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          height: 50px;
          min-height: 50px;
          background: #252525;
          border-bottom: 1px solid #333;
          gap: 12px;
          flex-shrink: 0;
        }
        .tce-toolbar-left {
          display: flex;
          align-items: center;
          flex: 1;
          gap: 12px;
          min-width: 0;
        }
        .tce-toolbar-title {
          font-size: 15px;
          font-weight: 600;
          color: #fff;
        }
        .tce-toolbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .tce-name-input {
          background: transparent;
          border: none;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
          padding: 6px 10px;
          border-radius: 4px;
          min-width: 200px;
          max-width: 400px;
        }
        .tce-name-input:hover { background: #2d2d2d; }
        .tce-name-input:focus { outline: none; background: #2d2d2d; }
        .tce-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: transparent;
          border: 1px solid #3d3d3d;
          color: #e1e1e1;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .tce-btn:hover { background: #2d2d2d; border-color: #4d4d4d; }
        .tce-btn--primary { background: #0d99ff; border-color: #0d99ff; color: #fff; }
        .tce-btn--primary:hover { background: #0a7cd6; border-color: #0a7cd6; }
        .tce-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .tce-columns {
          display: grid;
          grid-template-columns: 260px 1fr 300px;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .tce-panel {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .tce-panel--left {
          background: #1e1e1e;
          border-right: 1px solid #2d2d2d;
        }
        .tce-panel--center {
          background: #1a1a1a;
        }
        .tce-panel--right {
          background: #1e1e1e;
          border-left: 1px solid #2d2d2d;
        }
        .tce-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-bottom: 1px solid #2d2d2d;
          background: #252525;
          flex-shrink: 0;
        }
        .tce-panel-title {
          font-size: 11px;
          font-weight: 600;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .tce-icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: transparent;
          border: none;
          color: #0d99ff;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.15s;
        }
        .tce-icon-btn:hover { background: #2d2d2d; }
        .tce-icon-btn--small { width: 22px; height: 22px; }
        .tce-icon-btn--danger { color: #e74c3c; opacity: 0; }
        .tce-panel-search {
          padding: 8px;
          border-bottom: 1px solid #2d2d2d;
          flex-shrink: 0;
        }
        .tce-search-input {
          width: 100%;
          padding: 6px 10px;
          background: #252525;
          border: 1px solid #3d3d3d;
          color: #e1e1e1;
          font-size: 12px;
          border-radius: 4px;
          box-sizing: border-box;
        }
        .tce-search-input:focus { outline: none; border-color: #0d99ff; }
        .tce-list {
          flex: 1;
          overflow-y: auto;
          padding: 6px;
        }
        .tce-list-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          color: #e1e1e1;
          transition: background 0.15s;
          gap: 8px;
        }
        .tce-list-item:hover { background: #2d2d2d; }
        .tce-list-item:hover .tce-icon-btn--danger { opacity: 1; }
        .tce-list-item.active { background: #0d99ff20; color: #0d99ff; }
        .tce-list-item-name {
          flex: 1;
          font-family: 'Fira Code', 'Monaco', monospace;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tce-list-item-actions { flex-shrink: 0; }
        .tce-empty {
          padding: 16px;
          color: #666;
          font-size: 12px;
          text-align: center;
        }
        .tce-code-tabs {
          display: flex;
          background: #252525;
          border-bottom: 1px solid #2d2d2d;
          padding: 0 8px;
          flex-shrink: 0;
        }
        .tce-code-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 9px 12px;
          color: #fff;
          font-size: 12px;
          border-bottom: 2px solid #0d99ff;
        }
        .tce-code-editor-wrap {
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .tce-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 16px;
          color: #555;
        }
        .tce-empty-state p { font-size: 14px; }
        .tce-props-tabs {
          display: flex;
          background: #252525;
          border-bottom: 1px solid #2d2d2d;
          flex-shrink: 0;
        }
        .tce-props-tab {
          flex: 1;
          padding: 10px;
          background: transparent;
          border: none;
          color: #999;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }
        .tce-props-tab:hover { color: #e1e1e1; }
        .tce-props-tab.active { color: #fff; border-bottom-color: #0d99ff; }
        .tce-props-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }
        .tce-var-section { margin-bottom: 20px; }
        .tce-var-section-title {
          font-size: 10px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tce-var-count {
          background: #2d2d2d;
          color: #999;
          font-size: 10px;
          padding: 1px 5px;
          border-radius: 3px;
        }
        .tce-var-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 10px;
          background: #252525;
          border: 1px solid #3d3d3d;
          border-radius: 4px;
          margin-bottom: 4px;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'Fira Code', monospace;
          font-size: 11px;
        }
        .tce-var-item:hover { background: #2d2d2d; border-color: #4d4d4d; }
        .tce-var-type {
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          min-width: 44px;
          background: #1a1a1a;
          padding: 1px 4px;
          border-radius: 2px;
        }
        .tce-var-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tce-var-insert { font-size: 10px; color: #0d99ff; opacity: 0; transition: opacity 0.15s; }
        .tce-var-item:hover .tce-var-insert { opacity: 1; }
        .tce-var-empty { color: #555; font-size: 11px; padding: 4px 0; }
        .tce-setting-group { margin-bottom: 12px; }
        .tce-setting-label {
          display: block;
          font-size: 11px;
          color: #999;
          font-weight: 500;
          margin-bottom: 5px;
        }
        .tce-setting-input {
          width: 100%;
          padding: 7px 10px;
          background: #252525;
          border: 1px solid #3d3d3d;
          color: #e1e1e1;
          font-size: 12px;
          border-radius: 4px;
          font-family: 'Fira Code', monospace;
          box-sizing: border-box;
        }
        .tce-setting-input:focus { outline: none; border-color: #0d99ff; }
        .tce-setting-input[readonly] { color: #666; cursor: default; }
        .tce-statusbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          height: 30px;
          min-height: 30px;
          background: #252525;
          border-top: 1px solid #2d2d2d;
          font-size: 11px;
          color: #666;
          flex-shrink: 0;
        }
        .tce-statusbar-left, .tce-statusbar-right {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .tce-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }
        .tce-list::-webkit-scrollbar,
        .tce-props-content::-webkit-scrollbar { width: 6px; }
        .tce-list::-webkit-scrollbar-track,
        .tce-props-content::-webkit-scrollbar-track { background: transparent; }
        .tce-list::-webkit-scrollbar-thumb,
        .tce-props-content::-webkit-scrollbar-thumb { background: #3d3d3d; border-radius: 3px; }
      `}</style>
    </div>
  );
}
