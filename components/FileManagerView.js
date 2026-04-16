import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, Image as ImageIcon, FileText, Download, Copy, FolderPlus, Folder, ChevronRight, Clock } from 'lucide-react';

export default function FileManagerView({ showToast }) {
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [currentFolder, setCurrentFolder] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]); // [{ id, name, done, error }]
  const [failedImages, setFailedImages] = useState(new Set());
  const dragCounter = useRef(0);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  useEffect(() => {
    loadFiles();
  }, [currentFolder]);

  function loadFiles() {
    fetch(`/api/files?folder=${encodeURIComponent(currentFolder)}`)
      .then(r => r.json())
      .then(data => {
        setFiles(data.files || []);
        setFolders(data.folders || []);
      })
      .catch(() => { setFiles([]); setFolders([]); });
  }

  function navigateInto(folderName) {
    setCurrentFolder(prev => prev ? `${prev}/${folderName}` : folderName);
    setFilter('all');
  }

  function navigateUp() {
    setCurrentFolder(prev => {
      const parts = prev.split('/');
      parts.pop();
      return parts.join('/');
    });
    setFilter('all');
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: name, parentFolder: currentFolder })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Ordner "${name}" erstellt`, 'success');
        setNewFolderName('');
        setShowNewFolderInput(false);
        loadFiles();
      } else {
        showToast(data.error || 'Fehler beim Erstellen', 'error');
      }
    } catch (err) {
      showToast('Fehler: ' + err.message, 'error');
    }
  }

  // Upload a single file as a regular file
  async function uploadFile(file, queueId) {
    const formData = new FormData();
    formData.append('file', file);
    const folderParam = currentFolder ? `?folder=${encodeURIComponent(currentFolder)}` : '';
    const res = await fetch(`/api/files${folderParam}`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error((await res.json()).error || 'Upload fehlgeschlagen');
  }

  // Upload a single file as optimized image
  async function uploadImageFile(file, queueId) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/images/process', { method: 'POST', body: formData });
    if (!res.ok) throw new Error((await res.json()).error || 'Verarbeitung fehlgeschlagen');
  }

  async function processFileList(fileList, asImage = false, neverOptimize = false) {
    const entries = Array.from(fileList).map(f => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      done: false,
      error: false
    }));
    setUploadQueue(prev => [...prev, ...entries]);

    await Promise.all(
      Array.from(fileList).map(async (file, i) => {
        const id = entries[i].id;
        try {
          if (!neverOptimize && (asImage || (file.type && file.type.startsWith('image/')))) {
            await uploadImageFile(file, id);
          } else {
            await uploadFile(file, id);
          }
          setUploadQueue(prev => prev.map(e => e.id === id ? { ...e, done: true } : e));
        } catch (err) {
          setUploadQueue(prev => prev.map(e => e.id === id ? { ...e, done: true, error: true } : e));
          showToast(`Fehler bei "${file.name}": ${err.message}`, 'error');
        }
      })
    );

    setUploadQueue(prev => prev.filter(e => !entries.some(en => en.id === e.id)));
    loadFiles();
    showToast(`${entries.length === 1 ? 'Datei' : entries.length + ' Dateien'} hochgeladen`, 'success');
  }

  function handleFileInputChange(e) {
    if (e.target.files?.length) processFileList(e.target.files, false);
    e.target.value = '';
  }

  function handleImageInputChange(e) {
    if (e.target.files?.length) processFileList(e.target.files, true);
    e.target.value = '';
  }

  // Drag & Drop
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    const dropped = e.dataTransfer.files;
    if (dropped?.length) processFileList(dropped, false, true);
  }, [currentFolder]);

  async function handleDelete(fileUrl) {
    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fileUrl })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Datei gelöscht', 'success');
        loadFiles();
      } else {
        showToast(data.error || 'Fehler beim Löschen', 'error');
      }
    } catch (error) {
      showToast('Fehler: ' + error.message, 'error');
    }
  }

  function copyToClipboard(url) {
    navigator.clipboard.writeText(url);
    showToast('URL in Zwischenablage kopiert!', 'success');
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  function isImage(filename) {
    return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename);
  }

  function handleImageError(url) {
    setFailedImages(prev => new Set([...prev, url]));
  }

  const filteredFiles = files.filter(file => {
    if (filter === 'images') return isImage(file.name);
    if (filter === 'documents') return !isImage(file.name);
    return true;
  });

  const breadcrumbParts = currentFolder ? currentFolder.split('/') : [];
  const isUploading = uploadQueue.length > 0;

  return (
    <div
      className={`file-manager-container${dragging ? ' file-manager-dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="file-drop-overlay">
          <div className="file-drop-overlay-inner">
            <Upload size={48} />
            <p>Dateien hier ablegen</p>
          </div>
        </div>
      )}

      <div className="file-manager-header">
        <h2>Dateimanagement</h2>

        <div className="file-manager-actions">
          <button
            className="btn-secondary"
            onClick={() => setShowNewFolderInput(v => !v)}
            title="Neuen Ordner erstellen"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <FolderPlus size={16} />
            Neuer Ordner
          </button>

          <label className="btn-primary upload-btn" title="Mehrere Dateien möglich">
            <Upload size={16} />
            Dateien hochladen
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
          </label>

          <label className="btn-primary upload-btn" title="Mehrere Bilder möglich – werden optimiert">
            <ImageIcon size={16} />
            Bilder optimieren
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageInputChange}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {showNewFolderInput && (
        <div className="file-manager-new-folder">
          <input
            type="text"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') { setShowNewFolderInput(false); setNewFolderName(''); }
            }}
            placeholder="Ordnername"
            className="input-field-small"
            autoFocus
          />
          <button className="btn-primary" onClick={handleCreateFolder}>Erstellen</button>
          <button className="btn-secondary" onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}>Abbrechen</button>
        </div>
      )}

      <div className="file-manager-breadcrumb">
        <button
          className={`breadcrumb-item${currentFolder === '' ? ' active' : ''}`}
          onClick={() => setCurrentFolder('')}
        >
          uploads
        </button>
        {breadcrumbParts.map((part, i) => (
          <React.Fragment key={i}>
            <ChevronRight size={14} className="breadcrumb-sep" />
            <button
              className={`breadcrumb-item${i === breadcrumbParts.length - 1 ? ' active' : ''}`}
              onClick={() => setCurrentFolder(breadcrumbParts.slice(0, i + 1).join('/'))}
            >
              {part}
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="file-manager-filters">
        <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Alle ({files.length})
        </button>
        <button className={`filter-btn ${filter === 'images' ? 'active' : ''}`} onClick={() => setFilter('images')}>
          Bilder ({files.filter(f => isImage(f.name)).length})
        </button>
        <button className={`filter-btn ${filter === 'documents' ? 'active' : ''}`} onClick={() => setFilter('documents')}>
          Dokumente ({files.filter(f => !isImage(f.name)).length})
        </button>
      </div>

      <div className="file-grid">
        {/* Zurück-Karte wenn in Unterordner */}
        {currentFolder && (
          <div className="file-card file-card-folder" onClick={navigateUp} title="Übergeordneter Ordner" style={{ cursor: 'pointer' }}>
            <div className="file-preview">
              <div className="file-icon"><Folder size={48} /></div>
            </div>
            <div className="file-info">
              <div className="file-name">..</div>
              <div className="file-meta">Zurück</div>
            </div>
          </div>
        )}

        {/* Ordner-Karten */}
        {folders.map((folder, index) => (
          <div
            key={`folder-${index}`}
            className="file-card file-card-folder"
            title={`Ordner: ${folder.name}`}
          >
            <div className="file-preview" onClick={() => navigateInto(folder.name)} style={{ cursor: 'pointer' }}>
              <div className="file-icon"><Folder size={48} /></div>
            </div>
            <div className="file-info" onClick={() => navigateInto(folder.name)} style={{ cursor: 'pointer' }}>
              <div className="file-name" title={folder.name}>{folder.name}</div>
              <div className="file-meta">Ordner</div>
            </div>
            <div className="file-actions">
              <button
                className="icon-btn-small delete"
                title="Ordner löschen"
                onClick={(e) => {
                  e.stopPropagation();
                  const folderPath = currentFolder ? `${currentFolder}/${folder.name}` : folder.name;
                  if (!confirm(`Ordner "${folder.name}" und alle Inhalte löschen?`)) return;
                  fetch('/api/files', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folderPath })
                  })
                    .then(r => r.json())
                    .then(d => {
                      if (d.success) { showToast(`Ordner "${folder.name}" gelöscht`, 'success'); loadFiles(); }
                      else showToast(d.error || 'Fehler beim Löschen', 'error');
                    })
                    .catch(err => showToast('Fehler: ' + err.message, 'error'));
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {/* Upload-Queue: Karten für laufende Uploads */}
        {uploadQueue.map(entry => (
          <div key={entry.id} className={`file-card file-card-uploading${entry.error ? ' file-card-error' : ''}`}>
            <div className="file-preview">
              <div className="file-upload-progress-icon">
                {entry.error
                  ? <span className="file-upload-error-icon">⚠️</span>
                  : <div className="file-upload-spinner" />
                }
              </div>
            </div>
            <div className="file-info">
              <div className="file-name" title={entry.name}>{entry.name}</div>
              <div className="file-meta">{entry.error ? 'Fehler' : 'Wird hochgeladen…'}</div>
            </div>
          </div>
        ))}

        {/* Leer-Zustand */}
        {filteredFiles.length === 0 && folders.length === 0 && uploadQueue.length === 0 && !currentFolder && (
          <div className="empty-state">
            <Upload size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p>Keine Dateien vorhanden</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Dateien hier hineinziehen oder oben hochladen</p>
          </div>
        )}
        {filteredFiles.length === 0 && filter !== 'all' && (
          <div className="empty-state">
            <p>Keine Dateien in dieser Kategorie</p>
          </div>
        )}

        {/* Datei-Karten */}
        {filteredFiles.map((file, index) => {
          const imgFailed = failedImages.has(file.url);
          return (
            <div key={index} className="file-card">
              <div className="file-preview">
                {isImage(file.name) && !imgFailed ? (
                  <img
                    src={file.url}
                    alt={file.name}
                    onError={() => handleImageError(file.url)}
                  />
                ) : isImage(file.name) && imgFailed ? (
                  <div className="file-not-ready">
                    <Clock size={28} />
                    <span>Wird verarbeitet</span>
                  </div>
                ) : (
                  <div className="file-icon">
                    <FileText size={48} />
                  </div>
                )}
              </div>

              <div className="file-info">
                <div className="file-name" title={file.name}>{file.name}</div>
                <div className="file-meta">{formatFileSize(file.size)}</div>
              </div>

              <div className="file-actions">
                <button className="icon-btn-small" onClick={() => copyToClipboard(file.url)} title="URL kopieren">
                  <Copy size={14} />
                </button>
                <a href={file.url} download className="icon-btn-small" title="Herunterladen">
                  <Download size={14} />
                </a>
                <button className="icon-btn-small delete" onClick={() => handleDelete(file.url)} title="Löschen">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
