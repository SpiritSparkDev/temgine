import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Folder, LayoutGrid, ArrowLeft } from '../lib/muiIcons';

const PAGE_SIZE = 60;
const STORE_KEY = 'temgine.filePicker.v1';
const TYPE_CHIPS = [['image', 'Bilder'], ['document', 'Dokumente'], ['video', 'Video/Audio'], ['archive', 'Archive'], ['other', 'Sonstige']];
const RANGES = [['all', 'Alle'], ['today', 'Letzte 24 Std.'], ['week', 'Letzte 7 Tage'], ['month', 'Letzte 30 Tage'], ['year', 'Letztes Jahr']];
const SORTS = [
  ['name:asc', 'Name A → Z'], ['name:desc', 'Name Z → A'],
  ['created:desc', 'Erstellt (neueste)'], ['created:asc', 'Erstellt (älteste)'],
  ['modified:desc', 'Geändert (neueste)'], ['modified:asc', 'Geändert (älteste)'],
  ['size:desc', 'Größe (größte)'], ['size:asc', 'Größe (kleinste)'],
];
const DEFAULT_FILTER = { types: [], created: 'all', modified: 'all', sort: 'name:asc' };
const IMG_RE = /\.(jpe?g|png|gif|webp|svg|avif)$/i;

function loadStored() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (s && typeof s === 'object') return { ...DEFAULT_FILTER, ...s.filter, q: '' };
  } catch (e) { /* ohne localStorage weiter */ }
  return { ...DEFAULT_FILTER, q: '' };
}

function fmtSize(b) {
  if (b == null) return '';
  return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(1)} KB`;
}

// XHR statt fetch, damit upload.onprogress verfügbar ist.
function uploadOne(file, folder, onProgress) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', folder != null ? `/api/files?folder=${encodeURIComponent(folder)}` : '/api/files');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ ok: true });
      let msg = 'Unbekannter Fehler';
      try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) { /* ignorieren */ }
      resolve({ ok: false, error: msg });
    };
    xhr.onerror = () => resolve({ ok: false, error: 'Netzwerkfehler' });
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

export default function FilePickerModal({ open, mode = 'file', onSelect, onClose, showToast = () => {}, devTitle = () => undefined }) {
  const isFolderMode = mode === 'folder';
  const [tab, setTab] = useState('gallery');
  const [filter, setFilter] = useState(loadStored);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [folder, setFolder] = useState('');
  const [folderContents, setFolderContents] = useState({ files: [], folders: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [maxFileSize, setMaxFileSize] = useState(null);
  const [upload, setUpload] = useState(null); // { percent, label } | null
  const [dragging, setDragging] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderError, setNewFolderError] = useState('');
  const reqId = useRef(0);
  const abortRef = useRef(null);
  const dragDepth = useRef(0);
  const uploading = !!upload;

  // Beim Öffnen zurücksetzen
  useEffect(() => {
    if (!open) return;
    setTab(isFolderMode ? 'folders' : 'gallery');
    setFolder('');
    setFolderContents({ files: [], folders: [] });
    setQ(''); setDebouncedQ('');
    setNewFolderOpen(false); setNewFolderError('');
    setFilter(loadStored());
    if (isFolderMode) loadFolder('');
    fetch('/api/files?limits=1').then(r => r.ok ? r.json() : null).then(d => {
      if (d && Number.isFinite(d.maxFileSize)) setMaxFileSize(d.maxFileSize);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  // Esc schließt
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Filter merken
  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ filter })); } catch (e) { /* ignorieren */ }
  }, [filter, open]);

  // Suche entprellen
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const fetchGallery = useCallback(async (pageNo, append) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const id = ++reqId.current;
    const [sort, dir] = filter.sort.split(':');
    const p = new URLSearchParams({ paged: '1', page: String(pageNo), pageSize: String(PAGE_SIZE), sort, dir });
    if (debouncedQ) p.set('q', debouncedQ);
    if (filter.types.length) p.set('types', filter.types.join(','));
    if (filter.created !== 'all') p.set('createdWithin', filter.created);
    if (filter.modified !== 'all') p.set('modifiedWithin', filter.modified);
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/files?${p}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (id !== reqId.current) return;
      setFiles(prev => append ? [...prev, ...(data.files || [])] : (data.files || []));
      setTotal(data.total || 0);
      setPage(data.page || pageNo);
    } catch (e) {
      if (e.name === 'AbortError' || id !== reqId.current) return;
      setLoadError('Dateien konnten nicht geladen werden.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [filter, debouncedQ]);

  useEffect(() => {
    if (!open || tab !== 'gallery' || isFolderMode) return;
    fetchGallery(1, false);
  }, [open, tab, isFolderMode, fetchGallery, reloadKey]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  async function loadFolder(f) {
    const safe = f || '';
    setFolder(safe);
    try {
      const res = await fetch(`/api/files?folder=${encodeURIComponent(safe)}`);
      if (res.ok) {
        const data = await res.json();
        setFolderContents({ files: data.files || [], folders: data.folders || [] });
      }
    } catch (e) {
      console.error('Ordner laden fehlgeschlagen:', e);
    }
  }

  async function createFolder(e) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    setNewFolderError('');
    try {
      const res = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: name, parentFolder: folder }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setNewFolderError(res.status === 409 ? 'Ordner existiert bereits.' : (d.error || 'Ungültiger Ordnername.'));
        return;
      }
      setNewFolderName(''); setNewFolderOpen(false);
      await loadFolder(folder);
    } catch (err) {
      setNewFolderError('Netzwerkfehler beim Anlegen des Ordners.');
    }
  }

  async function uploadFiles(fileList) {
    const all = Array.from(fileList || []);
    if (all.length === 0 || uploading) return;
    const target = tab === 'folders' ? folder : null;
    const accepted = [];
    for (const f of all) {
      if (maxFileSize != null && f.size > maxFileSize) {
        showToast(`${f.name} ist zu groß (${fmtSize(f.size)}, max. ${fmtSize(maxFileSize)}) und wurde übersprungen`, 'error');
      } else accepted.push(f);
    }
    if (accepted.length === 0) return;
    const totalBytes = accepted.reduce((s, f) => s + f.size, 0) || 1;
    let doneBytes = 0;
    let ok = 0;
    setUpload({ percent: 0, label: `0 / ${accepted.length}` });
    for (let i = 0; i < accepted.length; i++) {
      const f = accepted[i];
      const r = await uploadOne(f, target, (loaded) => {
        setUpload({ percent: Math.round(((doneBytes + loaded) / totalBytes) * 100), label: `${i + 1} / ${accepted.length}: ${f.name}` });
      });
      doneBytes += f.size;
      if (r.ok) ok += 1; else showToast(`Fehler beim Hochladen von ${f.name}: ${r.error}`, 'error');
    }
    setUpload(null);
    if (tab === 'folders') await loadFolder(folder); else setReloadKey(k => k + 1);
    if (ok > 0) showToast(`${ok} von ${all.length} Datei(en) hochgeladen`, ok === all.length ? 'success' : 'error');
  }

  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const dragProps = {
    onDragEnter: (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current += 1; setDragging(true); },
    onDragOver: (e) => { if (hasFiles(e)) e.preventDefault(); },
    onDragLeave: (e) => { if (!hasFiles(e)) return; dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } },
    onDrop: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); dragDepth.current = 0; setDragging(false);
      uploadFiles(e.dataTransfer.files);
    },
  };

  if (!open) return null;

  const filterActive = filter.types.length > 0 || filter.created !== 'all' || filter.modified !== 'all' || q !== '';
  const toggleType = (key) => setFilter(f => ({ ...f, types: f.types.includes(key) ? f.types.filter(t => t !== key) : [...f.types, key] }));
  const select = (url) => { onSelect && onSelect(url); };
  const isImg = (f) => (f.type ? f.type === 'image' : IMG_RE.test(f.filename || f.name || ''));

  return (
    <div className="file-modal-overlay" style={{ zIndex: 10001 }}>
      <div className="file-modal file-modal-droppable" role="dialog" aria-modal="true" aria-label={isFolderMode ? 'Ordner auswählen' : 'Datei auswählen'} {...dragProps}>
        {dragging && <div className="file-modal-dropzone">Dateien hier ablegen{tab === 'folders' ? ` (Ordner: uploads/${folder})` : ''}</div>}
        <div className="file-modal-header">
          <h3 className="file-modal-title">{isFolderMode ? 'Ordner auswählen' : 'Datei auswählen'}</h3>
          <div className="file-modal-header-actions">
            <label className={`file-upload-label${uploading ? ' is-uploading' : ''}`}>
              {uploading ? '⏳ Hochladen...' : '⬆️ Hochladen'}
              <input type="file" multiple disabled={uploading} aria-label="Dateien hochladen" style={{ display: 'none' }}
                onChange={(e) => { const list = Array.from(e.target.files); e.target.value = ''; uploadFiles(list); }} />
            </label>
            <button type="button" onClick={onClose} className="file-modal-close-btn" aria-label="Schließen">×</button>
          </div>
        </div>

        {uploading && (
          <div className="file-modal-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={upload.percent} aria-label="Upload-Fortschritt">
            <div className="file-modal-progress-bar" style={{ width: `${upload.percent}%` }} />
            <span className="file-modal-progress-label">{upload.percent}% · {upload.label}</span>
          </div>
        )}

        {!isFolderMode && (
          <div className="file-modal-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'gallery'} aria-label="Galerie" className={`file-modal-tab${tab === 'gallery' ? ' active' : ''}`} onClick={() => setTab('gallery')}>
              <LayoutGrid size={15} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Galerie
            </button>
            <button type="button" role="tab" aria-selected={tab === 'folders'} aria-label="Ordner" className={`file-modal-tab${tab === 'folders' ? ' active' : ''}`} onClick={() => { setTab('folders'); loadFolder(folder); }}>
              <Folder size={15} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Ordner
            </button>
          </div>
        )}

        {!isFolderMode && tab === 'gallery' && (
          <div className="file-modal-filterbar">
            <input type="search" className="file-modal-search" value={q} placeholder="Dateiname suchen…" aria-label="Nach Dateiname suchen" onChange={(e) => setQ(e.target.value)} />
            <div className="file-modal-filter-group">
              {TYPE_CHIPS.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={filter.types.includes(key)} aria-label={`Filter ${label}`} className={`file-modal-chip${filter.types.includes(key) ? ' active' : ''}`} onClick={() => toggleType(key)}>{label}</button>
              ))}
            </div>
            {[['created', 'Erstellt'], ['modified', 'Geändert']].map(([field, label]) => (
              <label key={field} className="file-modal-filter-select">{label}:
                <select value={filter[field]} aria-label={`${label} Zeitraum`} onChange={(e) => setFilter(f => ({ ...f, [field]: e.target.value }))}>
                  {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            ))}
            <label className="file-modal-filter-select">Sortierung:
              <select value={filter.sort} aria-label="Sortierung" onChange={(e) => setFilter(f => ({ ...f, sort: e.target.value }))}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {filterActive && (
              <button type="button" className="file-modal-chip" aria-label="Filter zurücksetzen" onClick={() => { setQ(''); setFilter(f => ({ ...DEFAULT_FILTER, sort: f.sort })); }}>✕ Filter zurücksetzen</button>
            )}
          </div>
        )}

        {!isFolderMode && tab === 'gallery' && (
          <div className="file-modal-grid">
            {loadError && <div className="file-modal-empty">{loadError}</div>}
            {!loadError && files.length === 0 && (
              <div className="file-modal-empty">{loading ? 'Lade…' : (filterActive ? 'Keine Dateien für diese Filter' : 'Keine Dateien hochgeladen')}</div>
            )}
            {files.map((file) => {
              const filename = file.filename || file.name;
              return (
                <div key={file.url} role="button" tabIndex={0} className="file-modal-item"
                  onClick={() => select(file.url)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(file.url); } }}
                  title={devTitle(`Datei auswaehlen: ${filename}`)} aria-label={`Datei auswählen: ${filename}`}>
                  <div className="file-modal-thumb">
                    {isImg(file)
                      ? <img src={file.thumbUrl || file.url} alt={filename} loading="lazy" decoding="async" />
                      : <span className="file-modal-icon">{/\.pdf$/i.test(filename) ? '📄' : /\.docx?$/i.test(filename) ? '📝' : /\.(zip|rar|7z)$/i.test(filename) ? '📦' : /\.(mp4|mov|avi|webm)$/i.test(filename) ? '🎬' : '📎'}</span>}
                  </div>
                  <div className="file-modal-filename">{filename}</div>
                  {file.size != null && <div className="file-modal-filesize">{fmtSize(file.size)}</div>}
                </div>
              );
            })}
            {files.length < total && (
              <button type="button" className="file-modal-chip file-modal-more" disabled={loading} aria-label="Weitere Dateien laden" onClick={() => fetchGallery(page + 1, true)}>
                {loading ? 'Lade…' : `Mehr laden (${files.length} von ${total})`}
              </button>
            )}
          </div>
        )}

        {tab === 'folders' && (
          <>
            <div className="file-modal-breadcrumb">
              <button type="button" className="bc-btn" onClick={() => loadFolder('')}>uploads</button>
              {folder && folder.split('/').map((part, i, arr) => (
                <span key={i}>
                  <span className="bc-sep">/</span>
                  <button type="button" className="bc-btn" onClick={() => loadFolder(arr.slice(0, i + 1).join('/'))}>{part}</button>
                </span>
              ))}
              <button type="button" className="file-modal-chip file-modal-newfolder-btn" aria-label="Neuen Ordner anlegen" onClick={() => { setNewFolderOpen(o => !o); setNewFolderError(''); }}>+ Neuer Ordner</button>
            </div>
            {newFolderOpen && (
              <form className="file-modal-newfolder" onSubmit={createFolder}>
                <input type="text" autoFocus value={newFolderName} placeholder="Ordnername" aria-label="Name des neuen Ordners" onChange={(e) => setNewFolderName(e.target.value)} />
                <button type="submit" className="btn-modern-small" aria-label="Ordner anlegen">Anlegen</button>
                {newFolderError && <span className="file-modal-error" role="alert">{newFolderError}</span>}
              </form>
            )}
            <div className="file-modal-grid">
              {folder && (
                <div role="button" tabIndex={0} aria-label="Eine Ebene nach oben" className="file-modal-item file-modal-folder-item"
                  onClick={() => loadFolder(folder.split('/').slice(0, -1).join('/'))}
                  onKeyDown={(e) => { if (e.key === 'Enter') loadFolder(folder.split('/').slice(0, -1).join('/')); }}>
                  <div className="file-modal-thumb"><ArrowLeft size={40} /></div>
                  <div className="file-modal-filename">..</div>
                </div>
              )}
              {folderContents.folders.map((f) => (
                <div key={f.name} role="button" tabIndex={0} aria-label={`Ordner öffnen: ${f.name}`} className="file-modal-item file-modal-folder-item"
                  onClick={() => loadFolder(folder ? `${folder}/${f.name}` : f.name)}
                  onKeyDown={(e) => { if (e.key === 'Enter') loadFolder(folder ? `${folder}/${f.name}` : f.name); }}>
                  <div className="file-modal-thumb"><Folder size={48} /></div>
                  <div className="file-modal-filename">{f.name}</div>
                </div>
              ))}
              {folderContents.files.map((file) => (
                <div key={file.url} role={isFolderMode ? undefined : 'button'} tabIndex={isFolderMode ? undefined : 0}
                  className={`file-modal-item${isFolderMode ? ' file-modal-item-inert' : ''}`}
                  onClick={isFolderMode ? undefined : () => select(file.url)}
                  onKeyDown={isFolderMode ? undefined : (e) => { if (e.key === 'Enter') select(file.url); }}
                  title={file.name} aria-label={isFolderMode ? file.name : `Datei auswählen: ${file.name}`}>
                  <div className="file-modal-thumb">
                    {IMG_RE.test(file.name) ? <img src={file.thumbUrl || file.url} alt={file.name} loading="lazy" decoding="async" /> : <span className="file-modal-icon">📎</span>}
                  </div>
                  <div className="file-modal-filename">{file.name}</div>
                  {file.size != null && <div className="file-modal-filesize">{fmtSize(file.size)}</div>}
                </div>
              ))}
              {folderContents.folders.length === 0 && folderContents.files.length === 0 && (
                <div className="file-modal-empty">{folder ? 'Ordner ist leer' : 'Bitte oben auf einen Ordner klicken'}</div>
              )}
            </div>
          </>
        )}

        <div className="file-modal-footer">
          <button type="button" onClick={onClose} title={devTitle('Dateiauswahl abbrechen')} aria-label="Dateiauswahl abbrechen" className="file-modal-cancel-btn">Abbrechen</button>
          {isFolderMode && (
            <button type="button" onClick={() => select(folder)} disabled={!folder}
              title={devTitle(!folder ? 'Bitte erst in einen Unterordner wechseln' : `Ordner "${folder}" auswaehlen`)}
              aria-label="Diesen Ordner auswählen" className="btn-modern">✓ Diesen Ordner auswählen</button>
          )}
        </div>
      </div>
    </div>
  );
}
