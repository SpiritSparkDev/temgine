import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, Code, FileCode, GripVertical, FolderOpen } from '../lib/muiIcons';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

export default function CSSManagerViewModern({ showToast }) {
  const [cssFiles, setCssFiles] = useState([]);
  const [disabledIds, setDisabledIds] = useState(new Set());
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [cssCode, setCssCode] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadCSSFiles();
  }, []);

  function loadCSSFiles() {
    fetch('/api/css')
      .then(r => r.json())
      .then(data => {
        const files = data.files || [];
        setCssFiles(files);
        setDisabledIds(new Set(files.filter(f => !f.enabled).map(f => f.id)));
      })
      .catch(() => setCssFiles([]));
  }

  function saveDisabled(nextDisabled) {
    fetch('/api/css', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: [...nextDisabled] }),
    }).catch(err => showToast('Fehler beim Speichern: ' + err.message, 'error'));
  }

  function toggleEnabled(fileObj) {
    const next = new Set(disabledIds);
    if (next.has(fileObj.id)) {
      next.delete(fileObj.id);
    } else {
      next.add(fileObj.id);
    }
    setDisabledIds(next);
    setCssFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, enabled: !next.has(f.id) } : f));
    saveDisabled(next);
  }

  function handleNew() {
    setSelectedFile(null);
    setFileName('');
    setCssCode('/* Neues CSS Stylesheet */\n\n');
    setIsEditing(true);
  }

  function handleUploadFile(ev) {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    if (!f.name || !f.name.toLowerCase().endsWith('.css')) {
      showToast('Bitte eine .css Datei auswählen', 'error');
      return;
    }

    const fd = new FormData();
    fd.append('file', f);

    fetch('/api/css', {
      method: 'POST',
      body: fd
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.success) {
          showToast('CSS-Datei hochgeladen', 'success');
          loadCSSFiles();
        } else {
          showToast(data.error || 'Fehler beim Hochladen', 'error');
        }
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'))
      .finally(() => { ev.target.value = ''; });
  }

  function handleEdit(fileObj, index) {
    fetch(`/api/css?file=${encodeURIComponent(fileObj.name)}`)
      .then(r => r.json())
      .then(data => {
        setSelectedFile(index);
        setFileName(fileObj.name);
        setCssCode(data.content || '');
        setIsEditing(true);
      })
      .catch(err => showToast('Fehler beim Laden: ' + err.message, 'error'));
  }

  function handleSave() {
    if (!fileName.trim()) {
      showToast('Bitte Dateinamen eingeben', 'error');
      return;
    }

    const filename = fileName.endsWith('.css') ? fileName : fileName + '.css';

    fetch('/api/css', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content: cssCode })
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          showToast('CSS-Datei gespeichert!', 'success');
          loadCSSFiles();
          setIsEditing(false);
          setSelectedFile(null);
        } else {
          showToast(data.error || 'Fehler beim Speichern', 'error');
        }
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  function handleDelete(fileObj, index) {
    fetch('/api/css', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fileObj.name })
    })
      .then(() => {
        showToast('CSS-Datei gelöscht', 'success');
        loadCSSFiles();
        if (selectedFile === index) {
          setIsEditing(false);
          setSelectedFile(null);
        }
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  function handleDragEnd(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const newFiles = [...cssFiles];
    const [moved] = newFiles.splice(fromIndex, 1);
    newFiles.splice(toIndex, 0, moved);

    fetch('/api/css/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: newFiles.filter(f => f.source === 'extern_css').map(f => f.name) })
    })
      .then(() => {
        setCssFiles(newFiles);
        showToast('Reihenfolge gespeichert', 'success');
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  const externCssFiles = cssFiles.filter(f => f.source === 'extern_css');
  const uploadCssFiles = cssFiles.filter(f => f.source === 'uploads');

  return (
    <div className="editor-container">
      <div className="editor-sidebar">
        <div className="editor-header">
          <h2><FileCode size={18} /> CSS Manager</h2>
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <label className="icon-btn" title="CSS hochladen" style={{cursor: 'pointer'}}>
              <input type="file" accept=".css" style={{display: 'none'}} onChange={handleUploadFile} />
              <Plus size={18} />
            </label>
            <button className="icon-btn" onClick={handleNew} title="Neue CSS-Datei">
              <FileCode size={16} />
            </button>
          </div>
        </div>

        <div className="editor-list">
          {cssFiles.length === 0 ? (
            <div className="empty-list-state">Keine CSS-Dateien vorhanden</div>
          ) : (
            <>
              {/* extern_css files â€” editable, draggable, deletable */}
              {externCssFiles.map((fileObj) => {
                const index = cssFiles.indexOf(fileObj);
                return (
                  <div
                    key={fileObj.id}
                    className={`editor-list-item ${selectedFile === index ? 'active' : ''}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('index', String(index))}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIndex = parseInt(e.dataTransfer.getData('index'), 10);
                      handleDragEnd(fromIndex, index);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!disabledIds.has(fileObj.id)}
                      onChange={() => toggleEnabled(fileObj)}
                      onClick={(e) => e.stopPropagation()}
                      title={disabledIds.has(fileObj.id) ? 'Aktivieren' : 'Deaktivieren'}
                      style={{ flexShrink: 0, cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                      aria-label={`${fileObj.name} ${disabledIds.has(fileObj.id) ? 'aktivieren' : 'deaktivieren'}`}
                    />
                    <GripVertical size={14} style={{color: selectedFile === index ? 'white' : '#999', cursor: 'grab', flexShrink: 0}} />
                    <div className="editor-item-info" onClick={() => handleEdit(fileObj, index)} style={{flex:1, minWidth:0}}>
                      <div className="editor-item-label">{fileObj.name}</div>
                    </div>
                    <div className="editor-item-actions">
                      <button
                        className="icon-btn-small"
                        onClick={(e) => { e.stopPropagation(); handleEdit(fileObj, index); }}
                        title="Bearbeiten"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        className="icon-btn-small delete"
                        onClick={(e) => { e.stopPropagation(); handleDelete(fileObj, index); }}
                        title="Löschen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* uploads CSS files â€” checkbox only, no edit/delete */}
              {uploadCssFiles.length > 0 && (
                <>
                  <div style={{ padding: '8px 12px 4px', fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FolderOpen size={12} /> Uploads
                  </div>
                  {uploadCssFiles.map((fileObj) => {
                    const index = cssFiles.indexOf(fileObj);
                    return (
                      <div
                        key={fileObj.id}
                        className={`editor-list-item`}
                        style={{ opacity: disabledIds.has(fileObj.id) ? 0.5 : 1 }}
                      >
                        <input
                          type="checkbox"
                          checked={!disabledIds.has(fileObj.id)}
                          onChange={() => toggleEnabled(fileObj)}
                          onClick={(e) => e.stopPropagation()}
                          title={disabledIds.has(fileObj.id) ? 'Aktivieren' : 'Deaktivieren'}
                          style={{ flexShrink: 0, cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                          aria-label={`${fileObj.name} ${disabledIds.has(fileObj.id) ? 'aktivieren' : 'deaktivieren'}`}
                        />
                        <div className="editor-item-info" style={{flex:1, minWidth:0}}>
                          <div className="editor-item-label" title={fileObj.href}>{fileObj.name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {fileObj.href}
                          </div>
                        </div>
                        <span style={{ fontSize: '10px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
                          uploads
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </>
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
                placeholder="Dateiname (z.B. custom.css)"
                value={fileName}
                onChange={e => setFileName(e.target.value)}
              />
              <div className="editor-toolbar-actions">
                <button className="btn-secondary" onClick={() => setIsEditing(false)}>Abbrechen</button>
                <button className="btn-primary" onClick={handleSave}>Speichern</button>
              </div>
            </div>

            <div className="editor-codemirror-wrapper">
              <CodeEditor
                height="100%"
                language="css"
                value={cssCode}
                onChange={value => setCssCode(value || '')}
                options={{}}
              />
            </div>
          </>
        ) : (
          <div className="editor-empty-state">
            <FileCode size={48} strokeWidth={1} />
            <h3>Wähle eine CSS-Datei zum Bearbeiten</h3>
            <p>oder erstelle eine neue mit dem <Plus size={16} style={{verticalAlign: 'middle'}} /> Button</p>
          </div>
        )}
      </div>
    </div>
  );
}
