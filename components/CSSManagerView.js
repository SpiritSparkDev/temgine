import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { GripVertical, X } from '../lib/muiIcons';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

export default function CSSManagerView({ showToast }) {
  const [cssFiles, setCssFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [cssCode, setCssCode] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);

  useEffect(() => {
    loadCSSFiles();
  }, []);

  const loadCSSFiles = async () => {
    try {
      const res = await fetch('/api/css');
      const data = await res.json();
      setCssFiles(data.files || []);
    } catch (error) {
      showToast('Fehler beim Laden der CSS-Dateien: ' + error.message, 'error');
    }
  };

  const saveCSSOrder = async (files) => {
    try {
      const res = await fetch('/api/css/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: files }),
      });

      if (res.ok) {
        showToast('Reihenfolge gespeichert', 'success');
      } else {
        showToast('Fehler beim Speichern der Reihenfolge', 'error');
      }
    } catch (error) {
      showToast('Fehler: ' + error.message, 'error');
    }
  };

  const loadCSSFile = async (filename) => {
    try {
      const res = await fetch(`/api/css?file=${encodeURIComponent(filename)}`);
      const data = await res.json();
      setCssCode(data.content || '');
      setSelectedFile(filename);
      setIsCreating(false);
    } catch (error) {
      showToast('Fehler beim Laden: ' + error.message, 'error');
    }
  };

  const handleSave = async () => {
    if (!selectedFile && !newFileName) {
      showToast('Bitte wählen Sie eine Datei oder geben Sie einen Namen ein', 'error');
      return;
    }

    const filename = selectedFile || newFileName;
    
    try {
      const res = await fetch('/api/css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: cssCode }),
      });

      if (res.ok) {
        showToast('CSS-Datei gespeichert', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        const data = await res.json();
        showToast('Fehler: ' + data.error, 'error');
      }
    } catch (error) {
      showToast('Fehler beim Speichern: ' + error.message, 'error');
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      showToast('Bitte wählen Sie eine Datei aus', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target.result;
        const res = await fetch('/api/css', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: uploadFile.name, content }),
        });

        if (res.ok) {
          showToast('Datei hochgeladen', 'success');
          loadCSSFiles();
          setUploadFile(null);
        } else {
          const data = await res.json();
          showToast('Fehler: ' + data.error, 'error');
        }
      } catch (error) {
        showToast('Fehler beim Upload: ' + error.message, 'error');
      }
    };
    reader.readAsText(uploadFile);
  };

  const handleDelete = async (filename) => {
    if (!confirm(`CSS-Datei "${filename}" wirklich löschen?`)) return;

    try {
      const res = await fetch('/api/css', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });

      if (res.ok) {
        showToast('CSS-Datei gelöscht', 'success');
        loadCSSFiles();
        if (selectedFile === filename) {
          setSelectedFile(null);
          setCssCode('');
        }
      } else {
        const data = await res.json();
        showToast('Fehler: ' + data.error, 'error');
      }
    } catch (error) {
      showToast('Fehler beim Löschen: ' + error.message, 'error');
    }
  };

  const handleNewFile = () => {
    setIsCreating(true);
    setSelectedFile(null);
    setCssCode('/* Neue CSS-Datei */\n');
  };

  return (
    <div className="admin-editor-area">
      <div className="css-manager-grid">
        
        {/* Sidebar */}
        <div className="css-sidebar">
          <h3>CSS-Dateien</h3>
          
          <button onClick={handleNewFile} className="css-new-btn">
            + Neue CSS-Datei
          </button>

          <div className="css-upload-section">
            <label>Datei hochladen</label>
            <input
              type="file"
              accept=".css"
              onChange={(e) => setUploadFile(e.target.files[0])}
              className="css-upload-input"
            />
            {uploadFile && (
              <button onClick={handleUpload} className="css-upload-btn">
                Hochladen
              </button>
            )}
          </div>

          <div className="css-files-divider">
            <h4>Dateien (Drag & Drop zum Sortieren)</h4>
            {cssFiles.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Keine CSS-Dateien vorhanden</p>
            ) : (
              <ul className="css-file-list">
                {cssFiles.map((file, index) => (
                  <li 
                    key={file} 
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('cssIndex', index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIndex = parseInt(e.dataTransfer.getData('cssIndex'));
                      const toIndex = index;
                      if (fromIndex !== toIndex) {
                        const newFiles = [...cssFiles];
                        const [moved] = newFiles.splice(fromIndex, 1);
                        newFiles.splice(toIndex, 0, moved);
                        setCssFiles(newFiles);
                        saveCSSOrder(newFiles);
                      }
                    }}
                  >
                    <div 
                      className={`css-file-item ${selectedFile === file ? 'active' : ''}`}
                      onDragEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                      onDragLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
                    >
                      <GripVertical size={14} style={{ color: 'var(--text-tertiary)' }} />
                      <button
                        onClick={() => loadCSSFile(file)}
                        className="css-file-btn"
                      >
                        {file}
                      </button>
                      <button
                        onClick={() => handleDelete(file)}
                        className="css-file-delete-btn"
                        title="Löschen"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="css-editor-column">
          {isCreating && (
            <div className="css-filename-section">
              <label>Dateiname (mit .css Endung)</label>
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="z.B. custom-styles.css"
                className="css-filename-input"
              />
            </div>
          )}

          <div className="css-editor-wrapper">
            <CodeEditor
              height="600px"
              language="css"
              value={cssCode}
              onChange={(value) => setCssCode(value || '')}
              options={{}}
            />
          </div>

          <div className="action-bar">
            <button onClick={handleSave} className="btn-primary">
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
