import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, ChevronLeft } from 'lucide-react';
import ContentEntryEditor from './ContentEntryEditor';
import Toast from './Toast';

/**
 * ContentEntriesView - Manage content entries for a specific model
 * Shows list of entries and allows creating/editing/deleting entries
 */
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

  // Load entries from API
  useEffect(() => {
    if (model?.id) {
      loadEntries();
    }
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
      console.error('Error loading entries:', error);
      showToast(`Fehler beim Laden: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

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
      console.error('Error saving entry:', error);
      showToast(`Fehler beim Speichern: ${error.message}`, 'error');
      return false;
    }
  };

  const handleDeleteEntry = async (entryId) => {
    try {
      const res = await fetch(`/api/content-entries/${entryId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const error = await res.json();
        showToast(`Fehler: ${error.error}`, 'error');
        return false;
      }

      setEntries(prev => prev.filter(e => e.id !== entryId));
      setSelectedEntry(null);
      return true;
    } catch (error) {
      console.error('Error deleting entry:', error);
      showToast(`Fehler beim Löschen: ${error.message}`, 'error');
      return false;
    }
  };

  const filteredEntries = entries.filter(entry => {
    const query = searchQuery.toLowerCase();
    // Search in common fields: title, name, slug
    return (
      (entry.title && entry.title.toLowerCase().includes(query)) ||
      (entry.name && entry.name.toLowerCase().includes(query)) ||
      (entry.slug && entry.slug.toLowerCase().includes(query)) ||
      (entry.id && entry.id.toLowerCase().includes(query))
    );
  });

  // If editing or creating an entry, show the editor
  if (selectedEntry || isCreating) {
    return (
      <div className="content-entries-view">
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
        <ContentEntryEditor
          model={model}
          entry={selectedEntry}
          onSave={handleSaveEntry}
          onCancel={() => {
            setSelectedEntry(null);
            setIsCreating(false);
          }}
          onDelete={handleDeleteEntry}
          showToast={showToast}
        />
      </div>
    );
  }

  // Show entries list
  return (
    <div className="content-entries-view">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="entries-header">
        <div className="entries-header-left">
          <button
            type="button"
            className="btn-icon-only"
            onClick={onClose}
            title="Zurück"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2>{model?.name || 'Content Entries'}</h2>
            <p className="entries-subtitle">{entries.length} Einträge</p>
          </div>
        </div>
        <button
          type="button"
          className="btn-modern green"
          onClick={() => setIsCreating(true)}
          title="Neuer Eintrag"
        >
          <Plus size={16} /> Neuer Eintrag
        </button>
      </div>

      <div className="entries-toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Einträge durchsuchen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="entries-loading">
          <p>Lädt...</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="entries-empty">
          <p>
            {entries.length === 0
              ? 'Noch keine Einträge für dieses Modell'
              : 'Keine Einträge gefunden'}
          </p>
          {entries.length === 0 && (
            <button
              type="button"
              className="btn-modern"
              onClick={() => setIsCreating(true)}
            >
              <Plus size={14} /> Ersten Eintrag erstellen
            </button>
          )}
        </div>
      ) : (
        <div className="entries-list">
          {filteredEntries.map(entry => (
            <div
              key={entry.id}
              className="entry-card"
              onClick={() => setSelectedEntry(entry)}
            >
              <div className="entry-card-content">
                <div className="entry-title">
                  {entry.title || entry.name || entry.id}
                </div>
                {entry.slug && (
                  <div className="entry-meta">
                    <code>{entry.slug}</code>
                  </div>
                )}
                {entry.excerpt && (
                  <div className="entry-excerpt">{entry.excerpt}</div>
                )}
              </div>
              <div className="entry-card-actions">
                <button
                  type="button"
                  className="btn-icon-only hover-primary"
                  onClick={e => {
                    e.stopPropagation();
                    setSelectedEntry(entry);
                  }}
                  title="Bearbeiten"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  type="button"
                  className="btn-icon-only hover-danger"
                  onClick={e => {
                    e.stopPropagation();
                    if (window.confirm(`${entry.title || entry.name || 'Eintrag'} wirklich löschen?`)) {
                      handleDeleteEntry(entry.id);
                    }
                  }}
                  title="Löschen"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .content-entries-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          gap: 0;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .entries-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }

        .entries-header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .entries-header-left h2 {
          margin: 0 0 4px 0;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .entries-subtitle {
          margin: 0;
          font-size: 0.85rem;
          opacity: 0.7;
        }

        .entries-toolbar {
          display: flex;
          gap: 12px;
          padding: 12px 16px;
          background: var(--bg-tertiary);
          border-bottom: 1px solid var(--border-color);
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          flex: 1;
          max-width: 400px;
          opacity: 0.7;
        }

        .search-box input {
          flex: 1;
          border: none;
          background: transparent;
          outline: none;
          font-size: 0.95rem;
          color: var(--text-primary);
        }

        .search-box input::placeholder {
          color: #999;
        }

        .search-box:focus-within {
          opacity: 1;
          border-color: #667eea;
        }

        .entries-loading,
        .entries-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          gap: 16px;
          opacity: 0.6;
        }

        .entries-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 16px;
        }

        .entry-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .entry-card:hover {
          border-color: #667eea;
          background: rgba(102, 126, 234, 0.04);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .entry-card-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .entry-title {
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .entry-meta {
          font-size: 0.8rem;
          opacity: 0.7;
        }

        .entry-meta code {
          background: rgba(0, 0, 0, 0.05);
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.75rem;
          font-family: 'Courier New', monospace;
        }

        .entry-excerpt {
          font-size: 0.85rem;
          opacity: 0.6;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .entry-card-actions {
          display: flex;
          gap: 8px;
          margin-left: 12px;
        }

        .btn-icon-only {
          width: 32px;
          height: 32px;
          padding: 6px;
          border: 1px solid transparent;
          background: transparent;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          color: var(--text-primary);
        }

        .btn-icon-only:hover {
          background: rgba(102, 126, 234, 0.1);
          border-color: #667eea;
        }

        .btn-icon-only.hover-primary:hover {
          color: #667eea;
        }

        .btn-icon-only.hover-danger:hover {
          color: #c62828;
        }
      `}</style>
    </div>
  );
}
