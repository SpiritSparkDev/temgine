import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Search, ChevronLeft, FileText, Clock, Hash, GripVertical } from 'lucide-react';
import ContentEntryEditor from './ContentEntryEditor';
import Toast from './Toast';

export default function ContentEntriesView({
  model = null,
  onClose = null,
}) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [toast, setToast] = useState(null);
  const dragIdRef = useRef(null);
  const dragOverIdRef = useRef(null);

  useEffect(() => {
    if (model?.id) loadEntries();
  }, [model?.id]);

  const loadEntries = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/content-entries?contentTypeId=${model.id}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : data.entries || []);
      } else {
        showToast('Fehler beim Laden der Einträge', 'error');
      }
    } catch (error) {
      showToast(`Fehler beim Laden: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (message, type = 'info') => setToast({ message, type });

  const handleSaveEntry = async (entry) => {
    try {
      const method = entry.id ? 'PUT' : 'POST';
      const url = entry.id
        ? `/api/content-entries/${entry.id}`
        : `/api/content-entries?contentTypeId=${model.id}`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });

      if (!res.ok) {
        const error = await res.json();
        showToast(`Fehler: ${error.error}`, 'error');
        return false;
      }

      const savedEntry = await res.json();
      setEntries(prev => {
        const idx = prev.findIndex(e => e.id === savedEntry.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = savedEntry;
          return next;
        }
        return [...prev, savedEntry];
      });

      setSelectedEntry(null);
      setIsCreating(false);
      return true;
    } catch (error) {
      showToast(`Fehler beim Speichern: ${error.message}`, 'error');
      return false;
    }
  };

  const handleDeleteEntry = async (entryId) => {
    try {
      const res = await fetch(`/api/content-entries/${entryId}`, { method: 'DELETE' });
      if (!res.ok) {
        const error = await res.json();
        showToast(`Fehler: ${error.error}`, 'error');
        return false;
      }
      setEntries(prev => prev.filter(e => e.id !== entryId));
      setSelectedEntry(null);
      return true;
    } catch (error) {
      showToast(`Fehler beim Löschen: ${error.message}`, 'error');
      return false;
    }
  };

  const filteredEntries = entries.filter(entry => {
    const q = searchQuery.toLowerCase();
    return (
      (entry.title && entry.title.toLowerCase().includes(q)) ||
      (entry.name && entry.name.toLowerCase().includes(q)) ||
      (entry.slug && entry.slug.toLowerCase().includes(q)) ||
      (entry.id && entry.id.toLowerCase().includes(q))
    );
  });

  // ── Drag-and-drop reorder (only when not filtering) ──────────────────────
  const isDraggable = !searchQuery;

  const handleDragStart = (id) => {
    dragIdRef.current = id;
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    dragOverIdRef.current = id;
  };

  const handleDrop = async () => {
    const fromId = dragIdRef.current;
    const toId = dragOverIdRef.current;
    dragIdRef.current = null;
    dragOverIdRef.current = null;
    if (!fromId || !toId || fromId === toId) return;

    const fromIdx = entries.findIndex(e => e.id === fromId);
    const toIdx = entries.findIndex(e => e.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;

    const next = [...entries];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setEntries(next);

    try {
      await fetch('/api/content-entries/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map(e => e.id) }),
      });
    } catch {
      showToast('Fehler beim Speichern der Reihenfolge', 'error');
      loadEntries(); // revert on failure
    }
  };

  // ── Editor view ──────────────────────────────────────────────────────────
  if (selectedEntry || isCreating) {
    return (
      <div className="cev-root">
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        <ContentEntryEditor
          model={model}
          entry={selectedEntry}
          onSave={handleSaveEntry}
          onCancel={() => { setSelectedEntry(null); setIsCreating(false); }}
          onDelete={handleDeleteEntry}
          showToast={showToast}
        />
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  const getEntryTitle = (entry) => entry.title || entry.name || entry.headline || null;
  const getEntryMeta = (entry) => entry.slug || entry.id?.slice(0, 12) + '…' || '';

  return (
    <div className="cev-root">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="cev-header">
        <div className="cev-header-left">
          <button className="cev-back-btn" onClick={onClose} title="Zurück">
            <ChevronLeft size={18} />
          </button>
          <div>
            <h2 className="cev-title">{model?.name || 'Content Entries'}</h2>
            <p className="cev-subtitle">{entries.length} {entries.length === 1 ? 'Eintrag' : 'Einträge'}</p>
          </div>
        </div>
        <button className="cev-btn-primary" onClick={() => setIsCreating(true)}>
          <Plus size={15} /> Neuer Eintrag
        </button>
      </div>

      {/* Search bar */}
      <div className="cev-toolbar">
        <div className="cev-search">
          <Search size={15} />
          <input
            type="text"
            placeholder="Einträge durchsuchen…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="cev-search-clear" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="cev-body">
        {isLoading ? (
          <div className="cev-state">
            <div className="cev-spinner" />
            <p>Lade Einträge…</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="cev-state">
            <FileText size={40} strokeWidth={1} style={{ opacity: 0.3 }} />
            <p>{entries.length === 0 ? 'Noch keine Einträge vorhanden' : 'Keine Einträge gefunden'}</p>
            {entries.length === 0 && (
              <button className="cev-btn-primary" onClick={() => setIsCreating(true)}>
                <Plus size={14} /> Ersten Eintrag erstellen
              </button>
            )}
          </div>
        ) : (
          <div className="cev-list">
            {filteredEntries.map(entry => {
              const title = getEntryTitle(entry);
              const meta = getEntryMeta(entry);
              const updatedAt = entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString('de-DE') : null;
              return (
                <div
                  key={entry.id}
                  className="cev-card"
                  onClick={() => setSelectedEntry(entry)}
                  draggable={isDraggable}
                  onDragStart={isDraggable ? () => handleDragStart(entry.id) : undefined}
                  onDragOver={isDraggable ? (e) => handleDragOver(e, entry.id) : undefined}
                  onDrop={isDraggable ? handleDrop : undefined}
                >
                  {isDraggable && (
                    <div className="cev-card-drag" onClick={e => e.stopPropagation()} title="Ziehen zum Sortieren">
                      <GripVertical size={16} />
                    </div>
                  )}
                  <div className="cev-card-icon">
                    <FileText size={18} />
                  </div>
                  <div className="cev-card-body">
                    <div className="cev-card-title">{title || <span className="cev-no-title">Ohne Titel</span>}</div>
                    <div className="cev-card-meta">
                      {entry.slug && (
                        <span className="cev-card-meta-item">
                          <Hash size={11} /> {entry.slug}
                        </span>
                      )}
                      {updatedAt && (
                        <span className="cev-card-meta-item">
                          <Clock size={11} /> {updatedAt}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="cev-card-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className="cev-icon-btn"
                      onClick={() => setSelectedEntry(entry)}
                      title="Bearbeiten"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      className="cev-icon-btn danger"
                      onClick={() => {
                        if (window.confirm(`"${title || 'Eintrag'}" wirklich löschen?`)) {
                          handleDeleteEntry(entry.id);
                        }
                      }}
                      title="Löschen"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .cev-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .cev-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 20px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }

        .cev-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cev-title {
          margin: 0 0 2px;
          font-size: 1.1rem;
          font-weight: 700;
        }

        .cev-subtitle {
          margin: 0;
          font-size: 0.8rem;
          opacity: 0.55;
        }

        .cev-back-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border: 1px solid var(--border-color);
          border-radius: 7px;
          background: var(--bg-primary);
          cursor: pointer;
          color: var(--text-primary);
          transition: all 0.15s;
          flex-shrink: 0;
        }

        .cev-back-btn:hover {
          border-color: #6366f1;
          background: rgba(99,102,241,0.08);
          color: #6366f1;
        }

        .cev-toolbar {
          padding: 10px 20px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }

        .cev-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 12px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 7px;
          max-width: 420px;
          transition: border-color 0.15s;
        }

        .cev-search:focus-within {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }

        .cev-search input {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 0.9rem;
          color: var(--text-primary);
          font-family: inherit;
        }

        .cev-search input::placeholder { color: #9ca3af; }

        .cev-search-clear {
          background: none;
          border: none;
          cursor: pointer;
          color: #9ca3af;
          font-size: 1rem;
          padding: 0 2px;
          line-height: 1;
        }

        .cev-search-clear:hover { color: var(--text-primary); }

        .cev-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
        }

        .cev-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 60px 20px;
          text-align: center;
          opacity: 0.6;
          font-size: 0.9rem;
        }

        .cev-spinner {
          width: 28px;
          height: 28px;
          border: 3px solid var(--border-color);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: cev-spin 0.7s linear infinite;
        }

        @keyframes cev-spin { to { transform: rotate(360deg); } }

        .cev-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .cev-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border: 1px solid var(--border-color);
          border-radius: 9px;
          background: var(--bg-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }

        .cev-card[draggable="true"]:active {
          opacity: 0.55;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }

        .cev-card-drag {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px 0;
          color: var(--text-tertiary, #9ca3af);
          cursor: grab;
          flex-shrink: 0;
          opacity: 0.4;
          transition: opacity 0.15s;
        }

        .cev-card:hover .cev-card-drag { opacity: 1; }

        .cev-card:hover {
          border-color: rgba(99,102,241,0.4);
          background: rgba(99,102,241,0.04);
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          transform: translateY(-1px);
        }

        .cev-card-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: rgba(99,102,241,0.1);
          color: #6366f1;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .cev-card-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .cev-card-title {
          font-weight: 600;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cev-no-title {
          font-style: italic;
          opacity: 0.45;
          font-weight: 400;
        }

        .cev-card-meta {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cev-card-meta-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          opacity: 0.55;
          font-family: 'SF Mono', 'Fira Code', monospace;
        }

        .cev-card-actions {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
          opacity: 0;
          transition: opacity 0.15s;
        }

        .cev-card:hover .cev-card-actions { opacity: 1; }

        .cev-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
          color: var(--text-primary);
          transition: all 0.15s;
        }

        .cev-icon-btn:hover {
          background: rgba(99,102,241,0.1);
          border-color: rgba(99,102,241,0.25);
          color: #6366f1;
        }

        .cev-icon-btn.danger:hover {
          background: rgba(239,68,68,0.1);
          border-color: rgba(239,68,68,0.25);
          color: #ef4444;
        }

        .cev-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          background: #6366f1;
          color: #fff;
          border: none;
          border-radius: 7px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          font-family: inherit;
          flex-shrink: 0;
        }

        .cev-btn-primary:hover { background: #4f46e5; }
      `}</style>
    </div>
  );
}
