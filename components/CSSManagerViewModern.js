import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Edit2, Trash2, FileCode, GripVertical } from 'lucide-react';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

export default function CSSManagerViewModern({ showToast }) {
  const [cssFiles, setCssFiles] = useState([]);
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
      .then(data => setCssFiles(data.files || []))
      .catch(() => setCssFiles([]));
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

  function handleEdit(file, index) {
    fetch(`/api/css?file=${encodeURIComponent(file)}`)
      .then(r => r.json())
      .then(data => {
        setSelectedFile(index);
        setFileName(file);
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

  function handleDelete(file, index) {
    fetch('/api/css', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file })
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
      body: JSON.stringify({ order: newFiles })
    })
      .then(() => {
        setCssFiles(newFiles);
        showToast('Reihenfolge gespeichert', 'success');
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

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
            cssFiles.map((file, index) => (
              <div 
                key={file} 
                className={`editor-list-item ${selectedFile === index ? 'active' : ''}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('index', index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromIndex = parseInt(e.dataTransfer.getData('index'));
                  handleDragEnd(fromIndex, index);
                }}
              >
                <GripVertical size={14} style={{color: selectedFile === index ? 'white' : '#999', cursor: 'grab'}} />
                <div className="editor-item-info" onClick={() => handleEdit(file, index)}>
                  <div className="editor-item-label">{file}</div>
                </div>
                <div className="editor-item-actions">
                  <button 
                    className="icon-btn-small" 
                    onClick={(e) => { e.stopPropagation(); handleEdit(file, index); }}
                    title="Bearbeiten"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    className="icon-btn-small delete" 
                    onClick={(e) => { e.stopPropagation(); handleDelete(file, index); }}
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
