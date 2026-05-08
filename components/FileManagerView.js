import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Trash2, Image as ImageIcon, FileText, Download, Copy, FolderPlus, Folder, ChevronRight, Clock, CheckSquare, Square, AlertTriangle, Tag, X, Info } from 'lucide-react';

// ── XHR-Upload mit Fortschritts-Callback ────────────────────────────────────
function xhrUpload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText || '{}'));
      } else {
        let msg = 'Upload fehlgeschlagen';
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (_e) {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Netzwerkfehler'));
    xhr.send(formData);
  });
}

// ── MetadataModal ────────────────────────────────────────────────────────────
function isImageFile(filename) {
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename);
}

function MetadataModal({ file, metadata, onSave, onClose }) {
  const [altText,   setAltText]   = useState(metadata?.altText   || '');
  const [copyright, setCopyright] = useState(metadata?.copyright || '');
  const [caption,   setCaption]   = useState(metadata?.caption   || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({ url: file.url, altText, copyright, caption });
    setSaving(false);
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-primary, #fff)', borderRadius: 12, padding: 28, width: 440, maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Tag size={16} />
          <strong style={{ flex: 1 }}>Metadaten: {file.name}</strong>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {isImageFile(file.name) && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.8rem', color: '#c62828' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            Alt-Text ist für Barrierefreiheit und SEO Pflicht.
          </div>
        )}

        <label className="field-label-xs">Alt-Text {isImageFile(file.name) && <span style={{ color: '#c62828' }}>*</span>}</label>
        <input type="text" value={altText} onChange={e => setAltText(e.target.value)}
          placeholder="Beschreibt das Bild für Screenreader und SEO"
          maxLength={500} className="input-field-small"
          style={{ width: '100%', marginBottom: 12, boxSizing: 'border-box' }} autoFocus={isImageFile(file.name)} />

        <label className="field-label-xs">Copyright / Quelle</label>
        <input type="text" value={copyright} onChange={e => setCopyright(e.target.value)}
          placeholder="z.B. © Max Mustermann, Unsplash"
          maxLength={200} className="input-field-small"
          style={{ width: '100%', marginBottom: 12, boxSizing: 'border-box' }} />

        <label className="field-label-xs">Bildunterschrift</label>
        <input type="text" value={caption} onChange={e => setCaption(e.target.value)}
          placeholder="Optionale Bildunterschrift"
          maxLength={500} className="input-field-small"
          style={{ width: '100%', marginBottom: 20, boxSizing: 'border-box' }} />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button type="button" className="btn-primary" onClick={handleSave}
            disabled={saving || (isImageFile(file.name) && !altText.trim())}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Haupt-Komponente ─────────────────────────────────────────────────────────

export default function FileManagerView({ showToast }) {
  const MAX_IMAGE_RETRIES = 2;
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [filter, setFilter] = useState('all');
  const [currentFolder, setCurrentFolder] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [dragging, setDragging] = useState(false);
  // uploadQueue: [{ id, name, done, error, progress }]
  const [uploadQueue, setUploadQueue] = useState([]);
  const [failedImages, setFailedImages] = useState({});
  // Batch-Selektion
  const [selectedUrls, setSelectedUrls] = useState(new Set());
  const [batchMode, setBatchMode] = useState(false);
  // Metadaten: url → { altText, copyright, caption }
  const [metadataMap, setMetadataMap] = useState({});
  const [metaModalFile, setMetaModalFile] = useState(null);
  const [folderDragDropEnabled, setFolderDragDropEnabled] = useState(false);
  const [isRepairingNames, setIsRepairingNames] = useState(false);

  const dragCounter = useRef(0);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const folderInputRef = useRef(null);

  useEffect(() => {
    loadFiles();
  }, [currentFolder]);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setFolderDragDropEnabled(data?.folderDragDropEnabled === 'true');
      })
      .catch(() => {
        setFolderDragDropEnabled(false);
      });
  }, []);

  async function loadFiles() {
    try {
      const res = await fetch(`/api/files?folder=${encodeURIComponent(currentFolder)}`);
      const data = await res.json();
      const fileList = data.files || [];
      setFiles(fileList);
      setFolders(data.folders || []);
      setFailedImages({});
      if (fileList.length > 0) loadMetadata(fileList.map(f => f.url));
    } catch (_e) { setFiles([]); setFolders([]); setFailedImages({}); }
  }

  async function loadMetadata(urls) {
    if (!urls.length) return;
    try {
      const res = await fetch(`/api/files/metadata?urls=${encodeURIComponent(urls.join(','))}`);
      const data = await res.json();
      if (data.metadata) setMetadataMap(prev => ({ ...prev, ...data.metadata }));
    } catch (_e) {}
  }

  async function saveMetadata(entry) {
    try {
      const res = await fetch('/api/files/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      const data = await res.json();
      if (data.ok) {
        setMetadataMap(prev => ({ ...prev, [entry.url]: data.metadata }));
        showToast('Metadaten gespeichert', 'success');
      } else {
        showToast(data.error || 'Fehler beim Speichern', 'error');
      }
    } catch (_e) { showToast('Netzwerkfehler', 'error'); }
  }

  function navigateInto(folderName) {
    setCurrentFolder(prev => prev ? `${prev}/${folderName}` : folderName);
    setFilter('all');
    setSelectedUrls(new Set());
  }

  function navigateUp() {
    setCurrentFolder(prev => {
      const parts = prev.split('/');
      parts.pop();
      return parts.join('/');
    });
    setFilter('all');
    setSelectedUrls(new Set());
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

  // Upload-Verarbeitung via XHR mit Fortschritt
  async function processFileList(fileList) {
    const filesArray = Array.from(fileList);
    const entries = filesArray.map(f => ({
      id:       Math.random().toString(36).slice(2),
      name:     f.webkitRelativePath || f.relativePath || f.name,
      done:     false,
      error:    false,
      progress: 0,
    }));
    setUploadQueue(prev => [...prev, ...entries]);

    const isFolderUpload = filesArray.some(file => Boolean(file.webkitRelativePath || file.relativePath));

    if (isFolderUpload) {
      try {
        for (let index = 0; index < filesArray.length; index += 1) {
          const file = filesArray[index];
          const id = entries[index].id;
          const relativePath = String(file.webkitRelativePath || file.relativePath || file.name).replace(/\\/g, '/');
          const parts = relativePath.split('/').filter(Boolean);
          const relativeDir = parts.slice(0, -1).join('/');
          const uploadTarget = [currentFolder, relativeDir].filter(Boolean).join('/');
          const formData = new FormData();
          formData.append('file', file);

          const url = `/api/files${uploadTarget ? `?folder=${encodeURIComponent(uploadTarget)}` : ''}`;
          await xhrUpload(url, formData, (progress) => {
            const overall = Math.round(((index + (progress / 100)) / filesArray.length) * 100);
            setUploadQueue(prev => prev.map(e => {
              if (e.id === id) return { ...e, progress, done: progress >= 100 };
              if (entries.slice(index + 1).some(en => en.id === e.id)) return e;
              if (entries.slice(0, index).some(en => en.id === e.id)) return { ...e, progress: 100, done: true };
              return e;
            }));
            setUploadQueue(prev => prev.map(e => (
              entries.some(en => en.id === e.id) ? { ...e, batchProgress: overall } : e
            )));
          });

          setUploadQueue(prev => prev.map(e => e.id === id ? { ...e, done: true, progress: 100 } : e));
        }

        setTimeout(() => {
          setUploadQueue(prev => prev.filter(e => !entries.some(en => en.id === e.id)));
        }, 1500);

        await loadFiles();
        showToast(`${entries.length} Datei(en) aus Ordner hochgeladen`, 'success');
        return;
      } catch (err) {
        setUploadQueue(prev => prev.map(e => (
          entries.some(en => en.id === e.id) ? { ...e, done: true, error: true } : e
        )));
        showToast(`Ordner-Upload fehlgeschlagen: ${err.message}`, 'error');
        return;
      }
    }

    await Promise.all(
      filesArray.map(async (file, i) => {
        const id = entries[i].id;
        const updateProgress = (p) =>
          setUploadQueue(prev => prev.map(e => e.id === id ? { ...e, progress: p } : e));
        try {
          const formData = new FormData();
          formData.append('file', file);
          if (file.webkitRelativePath || file.relativePath) {
            formData.append('relativePath', file.webkitRelativePath || file.relativePath);
          }
          const url = `/api/files${currentFolder ? `?folder=${encodeURIComponent(currentFolder)}` : ''}`;
          await xhrUpload(url, formData, updateProgress);
          setUploadQueue(prev => prev.map(e => e.id === id ? { ...e, done: true, progress: 100 } : e));
        } catch (err) {
          setUploadQueue(prev => prev.map(e => e.id === id ? { ...e, done: true, error: true } : e));
          showToast(`Fehler bei "${file.name}": ${err.message}`, 'error');
        }
      })
    );

    setTimeout(() => {
      setUploadQueue(prev => prev.filter(e => !entries.some(en => en.id === e.id)));
    }, 1500);
    loadFiles();
    showToast(`${entries.length === 1 ? '1 Datei' : `${entries.length} Dateien`} hochgeladen`, 'success');
  }

  function handleFileInputChange(e) {
    if (e.target.files?.length) processFileList(e.target.files);
    e.target.value = '';
  }

  function handleImageInputChange(e) {
    if (e.target.files?.length) processFileList(e.target.files);
    e.target.value = '';
  }

  function handleFolderInputChange(e) {
    if (e.target.files?.length) processFileList(e.target.files);
    e.target.value = '';
  }

  async function readDroppedEntry(entry, parentPath = '') {
    if (!entry) return [];

    if (entry.isFile) {
      return await new Promise((resolve) => {
        entry.file((file) => {
          file.relativePath = `${parentPath}${file.name}`;
          resolve([file]);
        }, () => resolve([]));
      });
    }

    if (!entry.isDirectory) return [];

    const reader = entry.createReader();
    const directoryEntries = [];

    while (true) {
      const batch = await new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
      }).catch(() => []);

      if (!batch || batch.length === 0) break;
      directoryEntries.push(...batch);
    }

    const nestedFiles = await Promise.all(
      directoryEntries.map((childEntry) => readDroppedEntry(childEntry, `${parentPath}${entry.name}/`))
    );

    return nestedFiles.flat();
  }

  async function collectDroppedFiles(dataTransfer) {
    const items = Array.from(dataTransfer?.items || []);
    const entryItems = items
      .filter((item) => item.kind === 'file' && typeof item.webkitGetAsEntry === 'function')
      .map((item) => item.webkitGetAsEntry())
      .filter(Boolean);

    if (entryItems.length === 0) {
      return Array.from(dataTransfer?.files || []);
    }

    const nestedFiles = await Promise.all(entryItems.map((entry) => readDroppedEntry(entry)));
    return nestedFiles.flat();
  }

  // Drag & Drop
  const handleDragEnter = useCallback((e) => {
    if (!folderDragDropEnabled) return;
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setDragging(true);
  }, [folderDragDropEnabled]);

  const handleDragLeave = useCallback((e) => {
    if (!folderDragDropEnabled) return;
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, [folderDragDropEnabled]);

  const handleDragOver = useCallback((e) => {
    if (!folderDragDropEnabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, [folderDragDropEnabled]);

  const handleDrop = useCallback(async (e) => {
    if (!folderDragDropEnabled) return;
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    const dropped = await collectDroppedFiles(e.dataTransfer);
    if (dropped?.length) {
      processFileList(dropped);
    }
  }, [currentFolder, folderDragDropEnabled]);

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
        setSelectedUrls(prev => { const n = new Set(prev); n.delete(fileUrl); return n; });
        loadFiles();
      } else {
        showToast(data.error || 'Fehler beim Löschen', 'error');
      }
    } catch (error) {
      showToast('Fehler: ' + error.message, 'error');
    }
  }

  // ── Batch-Aktionen ───────────────────────────────────────────────────────

  function toggleSelect(url) {
    setSelectedUrls(prev => {
      const n = new Set(prev);
      if (n.has(url)) n.delete(url); else n.add(url);
      return n;
    });
  }

  function toggleSelectAll() {
    if (selectedUrls.size === filteredFiles.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(filteredFiles.map(f => f.url)));
    }
  }

  async function handleBatchDelete() {
    const toDelete = [...selectedUrls];
    if (!toDelete.length) return;
    if (!confirm(`${toDelete.length} Datei(en) löschen?`)) return;
    let deleted = 0;
    for (const url of toDelete) {
      try {
        const res = await fetch('/api/files', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: url })
        });
        const data = await res.json();
        if (data.success) deleted++;
      } catch (_e) {}
    }
    showToast(`${deleted} Datei(en) gelöscht`, deleted === toDelete.length ? 'success' : 'warning');
    setSelectedUrls(new Set());
    loadFiles();
  }

  async function handleBatchCopyUrls() {
    try {
      await navigator.clipboard.writeText([...selectedUrls].join('\n'));
      showToast(`${selectedUrls.size} URL(s) kopiert`, 'success');
    } catch (_e) {
      showToast('Kopieren fehlgeschlagen', 'error');
    }
  }

  function copyToClipboard(url) {
    navigator.clipboard.writeText(url);
    showToast('URL kopiert', 'success');
  }

  async function handleRepairBrokenNames() {
    const folderLabel = currentFolder || 'uploads';
    if (!confirm(`Defekte Datei- und Ordnernamen in "${folderLabel}" und allen Unterordnern reparieren?`)) return;

    setIsRepairingNames(true);
    try {
      const res = await fetch('/api/files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'repair-filenames', folder: currentFolder })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Dateinamen konnten nicht repariert werden', 'error');
        return;
      }

      await loadFiles();
      const renamedTotal = Number(data.renamedFiles || 0) + Number(data.renamedFolders || 0);
      if (renamedTotal === 0) {
        showToast('Keine defekten Dateinamen gefunden', 'success');
        return;
      }

      showToast(
        `${data.renamedFiles || 0} Datei(en), ${data.renamedFolders || 0} Ordner, ${data.metadataUpdated || 0} Metadaten und ${data.referencesUpdated?.replacedUrls || 0} Inhalts-Referenzen aktualisiert`,
        'success'
      );
    } catch (error) {
      showToast('Fehler: ' + error.message, 'error');
    } finally {
      setIsRepairingNames(false);
    }
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  function isImage(filename) {
    return isImageFile(filename);
  }

  function handleImageError(url) {
    setFailedImages(prev => ({
      ...prev,
      [url]: (prev[url] || 0) + 1,
    }));
  }

  const filteredFiles = files.filter(file => {
    if (filter === 'images')      return isImage(file.name);
    if (filter === 'documents')   return !isImage(file.name);
    if (filter === 'missing-alt') return isImage(file.name) && !metadataMap[file.url]?.altText;
    return true;
  });

  const missingAltCount = files.filter(f => isImage(f.name) && !metadataMap[f.url]?.altText).length;
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
      {folderDragDropEnabled && dragging && (
        <div className="file-drop-overlay">
          <div className="file-drop-overlay-inner">
            <Upload size={48} />
            <p>Dateien hier ablegen</p>
          </div>
        </div>
      )}

      {/* Metadaten-Modal */}
      {metaModalFile && (
        <MetadataModal
          file={metaModalFile}
          metadata={metadataMap[metaModalFile.url] || null}
          onSave={saveMetadata}
          onClose={() => setMetaModalFile(null)}
        />
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

          <button
            className={`btn-secondary${batchMode ? ' active' : ''}`}
            onClick={() => { setBatchMode(v => !v); setSelectedUrls(new Set()); }}
            title="Mehrfachauswahl"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <CheckSquare size={16} />
            Auswahl
          </button>

          <button
            className="btn-secondary"
            onClick={handleRepairBrokenNames}
            disabled={isRepairingNames}
            title="Aktuellen Ordner und Unterordner nach defekten Namen durchsuchen und reparieren"
            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: isRepairingNames ? 0.7 : 1, cursor: isRepairingNames ? 'wait' : 'pointer' }}
          >
            <FileText size={16} />
            {isRepairingNames ? 'Repariere Namen…' : 'Dateinamen reparieren'}
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

          <label className="btn-primary upload-btn" title="Kompletten Ordner mit Unterordnern hochladen">
            <Folder size={16} />
            Ordner hochladen
            <input
              ref={folderInputRef}
              type="file"
              multiple
              webkitdirectory=""
              directory=""
              onChange={handleFolderInputChange}
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

      {/* Batch-Aktionen-Toolbar */}
      {batchMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 14px', borderBottom: '1px solid var(--border-color, #e0e0e0)', marginBottom: 12 }}>
          <button type="button" className="btn-secondary"
            onClick={toggleSelectAll}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}
          >
            {selectedUrls.size === filteredFiles.length && filteredFiles.length > 0
              ? <CheckSquare size={14} />
              : <Square size={14} />}
            Alle {selectedUrls.size > 0 ? `(${selectedUrls.size})` : ''}
          </button>
          {selectedUrls.size > 0 && (
            <>
              <button type="button" className="btn-secondary" onClick={handleBatchCopyUrls}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                <Copy size={14} /> URLs kopieren
              </button>
              <button type="button" className="btn-secondary" onClick={handleBatchDelete}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#c62828' }}>
                <Trash2 size={14} /> {selectedUrls.size} löschen
              </button>
            </>
          )}
        </div>
      )}

      {/* Fehlende Alt-Text Warnung */}
      {missingAltCount > 0 && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', marginBottom: 12, borderRadius: 8, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', fontSize: '0.82rem', color: '#92400e', cursor: 'pointer' }}
          onClick={() => setFilter('missing-alt')}
          title="Klicken um nur diese Bilder anzuzeigen"
        >
          <AlertTriangle size={14} />
          <strong>{missingAltCount} Bild{missingAltCount > 1 ? 'er' : ''} ohne Alt-Text</strong>
          — klicken zum Filtern
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
        {missingAltCount > 0 && (
          <button className={`filter-btn ${filter === 'missing-alt' ? 'active' : ''}`}
            onClick={() => setFilter('missing-alt')}
            style={{ color: '#b45309' }}>
            ⚠ Alt-Text fehlt ({missingAltCount})
          </button>
        )}
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

        {/* Upload-Queue: Fortschrittsbalken */}
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
              <div className="file-meta">{entry.error ? 'Fehler' : `${entry.progress ?? 0}%`}</div>
              {!entry.error && (
                <div style={{ height: 4, borderRadius: 2, background: 'var(--border-color, #e0e0e0)', marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${entry.progress ?? 0}%`, background: '#22c55e', borderRadius: 2, transition: 'width 0.2s ease' }} />
                </div>
              )}
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
        {filteredFiles.length === 0 && filter !== 'all' && uploadQueue.length === 0 && (
          <div className="empty-state">
            <p>Keine Dateien in dieser Kategorie</p>
          </div>
        )}

        {/* Datei-Karten */}
        {filteredFiles.map((file, index) => {
          const imageFailureCount = failedImages[file.url] || 0;
          const imageRetryExhausted = imageFailureCount > MAX_IMAGE_RETRIES;
          const imageSrc = imageFailureCount > 0
            ? `${file.url}${file.url.includes('?') ? '&' : '?'}retry=${imageFailureCount}`
            : file.url;
          const isSelected = selectedUrls.has(file.url);
          const meta       = metadataMap[file.url];
          const missingAlt = isImage(file.name) && !meta?.altText;
          return (
            <div key={index} className={`file-card${isSelected ? ' file-card-selected' : ''}`} style={{ position: 'relative' }}>

              {/* Selektion-Checkbox (Batch-Modus) */}
              {batchMode && (
                <div onClick={() => toggleSelect(file.url)}
                  style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, cursor: 'pointer', background: 'rgba(255,255,255,0.9)', borderRadius: 4, padding: 2, display: 'flex' }}>
                  {isSelected
                    ? <CheckSquare size={18} style={{ color: '#2563eb' }} />
                    : <Square size={18} style={{ color: '#9ca3af' }} />}
                </div>
              )}

              {/* Alt-Text fehlt Badge */}
              {missingAlt && (
                <div onClick={() => setMetaModalFile(file)}
                  title="Alt-Text fehlt – klicken zum Bearbeiten"
                  style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, background: 'rgba(245,158,11,0.9)', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                  <AlertTriangle size={10} /> Alt
                </div>
              )}

              <div className="file-preview"
                onClick={batchMode ? () => toggleSelect(file.url) : undefined}
                style={batchMode ? { cursor: 'pointer' } : undefined}>
                {isImage(file.name) && !imageRetryExhausted ? (
                  <img src={imageSrc} alt={meta?.altText || file.name} onError={() => handleImageError(file.url)} />
                ) : isImage(file.name) && imageRetryExhausted ? (
                  <div className="file-not-ready"><Clock size={28} /><span>Bild konnte nicht geladen werden</span></div>
                ) : (
                  <div className="file-icon"><FileText size={48} /></div>
                )}
              </div>

              <div className="file-info">
                <div className="file-name" title={file.name}>{file.name}</div>
                <div className="file-meta">{formatFileSize(file.size)}</div>
                {meta?.altText && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary, #757575)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Info size={9} style={{ display: 'inline', marginRight: 3 }} />
                    {meta.altText}
                  </div>
                )}
              </div>

              <div className="file-actions">
                <button className="icon-btn-small" onClick={() => copyToClipboard(file.url)} title="URL kopieren">
                  <Copy size={14} />
                </button>
                <button className="icon-btn-small" onClick={() => setMetaModalFile(file)} title="Metadaten bearbeiten">
                  <Tag size={14} />
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
