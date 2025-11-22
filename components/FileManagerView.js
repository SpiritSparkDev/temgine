import React, { useState, useEffect } from 'react';
import { Upload, Trash2, Image as ImageIcon, FileText, Download, Copy } from 'lucide-react';

export default function FileManagerView({ showToast }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState('all'); // all, images, documents

  useEffect(() => {
    loadFiles();
  }, []);

  function loadFiles() {
    fetch('/api/files')
      .then(r => r.json())
      .then(data => setFiles(data.files || []))
      .catch(() => setFiles([]));
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/files', {
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

  async function handleDelete(filename) {
    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
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

  const filteredFiles = files.filter(file => {
    if (filter === 'images') return isImage(file.name);
    if (filter === 'documents') return !isImage(file.name);
    return true;
  });

  return (
    <div className="file-manager-container">
      <div className="file-manager-header">
        <h2>Dateimanagement</h2>
        
        <div className="file-manager-actions">
          <label className="btn-primary upload-btn">
            <Upload size={16} />
            Datei hochladen
            <input 
              type="file" 
              onChange={handleUpload}
              disabled={uploading}
              style={{display: 'none'}}
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
              style={{display: 'none'}}
            />
          </label>
        </div>
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
        {filteredFiles.length === 0 ? (
          <div className="empty-state">
            <p>Keine Dateien vorhanden</p>
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
                  onClick={() => handleDelete(file.name)}
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
  );
}
