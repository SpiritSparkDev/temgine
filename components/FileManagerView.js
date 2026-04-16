import React, { useState, useEffect } from 'react';
import { Upload, Trash2, Image as ImageIcon, FileText, Download, Copy, FolderPlus, Folder, ChevronRight } from 'lucide-react';

export default function FileManagerView({ showToast }) {
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState('all'); // all, images, documents
  const [currentFolder, setCurrentFolder] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

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

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const folderParam = currentFolder ? `?folder=${encodeURIComponent(currentFolder)}` : '';
      const res = await fetch(`/api/files${folderParam}`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        showToast('Datei erfolgreich hochgeladen!', 'success');
        loadFiles();
      } else {
        showToast(data.error || 'Upload fehlgeschlagen', 'error');
      }
    } catch (error) {
      showToast('Fehler beim Upload: ' + error.message, 'error');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/images/process', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        showToast('Bild verarbeitet und optimiert!', 'success');
        loadFiles();
      } else {
        showToast(data.error || 'Verarbeitung fehlgeschlagen', 'error');
      }
    } catch (error) {
      showToast('Fehler: ' + error.message, 'error');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function handleDelete(fileUrl) {
    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: fileUrl })
      });

      const data = await res.json();

      if (data.success) {
        showToast('Datei gelÃ¶scht', 'success');
        loadFiles();
      } else {
        showToast(data.error || 'Fehler beim LÃ¶schen', 'error');
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

  const filteredFiles = files.filter(file => {
    if (filter === 'images') return isImage(file.name);
    if (filter === 'documents') return !isImage(file.name);
    return true;
  });

  const breadcrumbParts = currentFolder ? currentFolder.split('/') : [];

  return (
    <div className="file-manager-container">
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
          <label className="btn-primary upload-btn">
            <Upload size={16} />
            Datei hochladen
            <input
              type="file"
              onChange={handleUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>

          <label className="btn-primary upload-btn">
            <ImageIcon size={16} />
            Bild hochladen & optimieren
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={uploading}
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
        <button
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Alle ({files.length})
        </button>
        <button
          className={`filter-btn ${filter === 'images' ? 'active' : ''}`}
          onClick={() => setFilter('images')}
        >
          Bilder ({files.filter(f => isImage(f.name)).length})
        </button>
        <button
          className={`filter-btn ${filter === 'documents' ? 'active' : ''}`}
          onClick={() => setFilter('documents')}
        >
          Dokumente ({files.filter(f => !isImage(f.name)).length})
        </button>
      </div>

      {uploading && (
        <div className="upload-overlay">
          <div className="upload-spinner"></div>
          <p>Verarbeite Datei...</p>
        </div>
      )}

      <div className="file-grid">
        {/* ZurÃ¼ck-Karte wenn in Unterordner */}
        {currentFolder && (
          <div className="file-card file-card-folder" onClick={navigateUp} title="Ãœbergeordneter Ordner" style={{ cursor: 'pointer' }}>
            <div className="file-preview">
              <div className="file-icon"><Folder size={48} /></div>
            </div>
            <div className="file-info">
              <div className="file-name">..</div>
              <div className="file-meta">ZurÃ¼ck</div>
            </div>
          </div>
        )}

        {/* Ordner-Karten */}
        {folders.map((folder, index) => (
          <div
            key={`folder-${index}`}
            className="file-card file-card-folder"
            onClick={() => navigateInto(folder.name)}
            title={`Ordner Ã¶ffnen: ${folder.name}`}
            style={{ cursor: 'pointer' }}
          >
            <div className="file-preview">
              <div className="file-icon"><Folder size={48} /></div>
            </div>
            <div className="file-info">
              <div className="file-name" title={folder.name}>{folder.name}</div>
              <div className="file-meta">Ordner</div>
            </div>
          </div>
        ))}

        {/* Datei-Karten */}
        {filteredFiles.length === 0 && folders.length === 0 && !currentFolder ? (
          <div className="empty-state">
            <p>Keine Dateien vorhanden</p>
          </div>
        ) : filteredFiles.length === 0 && filter !== 'all' ? (
          <div className="empty-state">
            <p>Keine Dateien in dieser Kategorie</p>
          </div>
        ) : (
          filteredFiles.map((file, index) => (
            <div key={index} className="file-card">
              <div className="file-preview">
                {isImage(file.name) ? (
                  <img src={file.url} alt={file.name} />
                ) : (
                  <div className="file-icon">
                    <FileText size={48} />
                  </div>
                )}
              </div>

              <div className="file-info">
                <div className="file-name" title={file.name}>
                  {file.name}
                </div>
                <div className="file-meta">
                  {formatFileSize(file.size)}
                </div>
              </div>

              <div className="file-actions">
                <button
                  className="icon-btn-small"
                  onClick={() => copyToClipboard(file.url)}
                  title="URL kopieren"
                >
                  <Copy size={14} />
                </button>
                <a
                  href={file.url}
                  download
                  className="icon-btn-small"
                  title="Herunterladen"
                >
                  <Download size={14} />
                </a>
                <button
                  className="icon-btn-small delete"
                  onClick={() => handleDelete(file.url)}
                  title="LÃ¶schen"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
