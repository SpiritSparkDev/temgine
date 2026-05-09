import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, Code, FileCode, GripVertical, FolderOpen } from '../lib/muiIcons';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

export default function JSManagerViewModern({ showToast }) {
  const [jsFiles, setJsFiles] = useState([]);
  const [disabledIds, setDisabledIds] = useState(new Set());
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [jsCode, setJsCode] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadJSFiles();
  }, []);

  function loadJSFiles() {
    fetch('/api/js')
      .then(r => r.json())
      .then(data => {
        const files = data.files || [];
        setJsFiles(files);
        setDisabledIds(new Set(files.filter(f => !f.enabled).map(f => f.id)));
      })
      .catch(() => setJsFiles([]));
  }

  function saveDisabled(nextDisabled) {
    fetch('/api/js', {
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
    setJsFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, enabled: !next.has(f.id) } : f));
    saveDisabled(next);
  }

  function handleNew() {
    setSelectedFile(null);
    setFileName('');
    setJsCode('// Neues JavaScript\n\n');
    setIsEditing(true);
  }

  function handleUploadFile(ev) {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    if (!f.name || !f.name.toLowerCase().endsWith('.js')) {
      showToast('Bitte eine .js Datei auswählen', 'error');
      return;
    }

    const fd = new FormData();
    fd.append('file', f);

    fetch('/api/js', {
      method: 'POST',
      body: fd
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.success) {
          showToast('JS-Datei hochgeladen', 'success');
          loadJSFiles();
        } else {
          showToast(data.error || 'Fehler beim Hochladen', 'error');
        }
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'))
      .finally(() => { ev.target.value = ''; });
  }

  function handleEdit(fileObj, index) {
    fetch(`/api/js?file=${encodeURIComponent(fileObj.name)}`)
      .then(r => r.json())
      .then(data => {
        setSelectedFile(index);
        setFileName(fileObj.name);
        setJsCode(data.content || '');
        setIsEditing(true);
      })
      .catch(err => showToast('Fehler beim Laden: ' + err.message, 'error'));
  }

  function handleSave() {
    if (!fileName.trim()) {
      showToast('Bitte Dateinamen eingeben', 'error');
      return;
    }

    const filename = fileName.endsWith('.js') ? fileName : fileName + '.js';

    fetch('/api/js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content: jsCode })
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          showToast('JS-Datei gespeichert!', 'success');
          loadJSFiles();
          setIsEditing(false);
          setSelectedFile(null);
        } else {
          showToast(data.error || 'Fehler beim Speichern', 'error');
        }
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  function handleDelete(fileObj, index) {
    fetch('/api/js', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fileObj.name })
    })
      .then(() => {
        showToast('JS-Datei gelöscht', 'success');
        loadJSFiles();
        if (selectedFile === index) {
          setIsEditing(false);
          setSelectedFile(null);
        }
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  function handleDragEnd(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const newFiles = [...jsFiles];
    const [moved] = newFiles.splice(fromIndex, 1);
    newFiles.splice(toIndex, 0, moved);

    fetch('/api/js/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: newFiles.filter(f => f.source === 'extern_js').map(f => f.name) })
    })
      .then(() => {
        setJsFiles(newFiles);
        showToast('Reihenfolge gespeichert', 'success');
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  const externJsFiles = jsFiles.filter(f => f.source === 'extern_js');
  const uploadJsFiles = jsFiles.filter(f => f.source === 'uploads');

  return (
    <div className="editor-container">
      <div className="editor-sidebar">
        <div className="editor-header">
          <h2><FileCode size={18} /> JS Manager</h2>
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <label className="icon-btn" title="JS hochladen" style={{cursor: 'pointer'}}>
              <input type="file" accept=".js" style={{display: 'none'}} onChange={handleUploadFile} />
              <Plus size={18} />
            </label>
            <button className="icon-btn" onClick={handleNew} title="Neue JS-Datei">
              <FileCode size={16} />
            </button>
          </div>
        </div>

        <div className="editor-list">
          {jsFiles.length === 0 ? (
            <div className="empty-list-state">Keine JS-Dateien vorhanden</div>
          ) : (
            <>
              {externJsFiles.map((fileObj) => {
                const index = jsFiles.indexOf(fileObj);
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

              {uploadJsFiles.length > 0 && (
                <>
                  <div style={{ padding: '8px 12px 4px', fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <FolderOpen size={12} /> Uploads
                  </div>
                  {uploadJsFiles.map((fileObj) => {
                    return (
                      <div
                        key={fileObj.id}
                        className="editor-list-item"
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
                placeholder="Dateiname (z.B. custom.js)"
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
                language="javascript"
                value={jsCode}
                onChange={value => setJsCode(value || '')}
                options={{}}
              />
            </div>
          </>
        ) : (
          <div className="editor-empty-state">
            <FileCode size={48} strokeWidth={1} />
            <h3>Wähle eine JS-Datei zum Bearbeiten</h3>
            <p>oder erstelle eine neue mit dem <Plus size={16} style={{verticalAlign: 'middle'}} /> Button</p>
          </div>
        )}
      </div>
    </div>
  );
}
