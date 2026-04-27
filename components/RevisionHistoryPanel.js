import React, { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Trash2, Clock, Loader } from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '–';
  const d = new Date(dateStr);
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function RevisionHistoryPanel({ pageId, pageName, onClose, onRestored, showToast }) {
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadRevisions = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pages/revisions?pageId=${encodeURIComponent(pageId)}`);
      if (res.ok) {
        const data = await res.json();
        setRevisions(data);
      } else {
        showToast && showToast('Fehler beim Laden der Versionen', 'error');
      }
    } catch (e) {
      showToast && showToast('Fehler beim Laden der Versionen', 'error');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { loadRevisions(); }, [loadRevisions]);

  const handleRestore = async (revisionId) => {
    setRestoringId(revisionId);
    try {
      const res = await fetch('/api/pages/revisions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisionId }),
      });
      if (res.ok) {
        showToast && showToast('Version wiederhergestellt', 'success');
        await loadRevisions();
        onRestored && onRestored();
      } else {
        const d = await res.json();
        showToast && showToast(d.error || 'Fehler beim Wiederherstellen', 'error');
      }
    } catch (e) {
      showToast && showToast('Fehler beim Wiederherstellen', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (revisionId) => {
    setDeletingId(revisionId);
    try {
      const res = await fetch('/api/pages/revisions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisionId }),
      });
      if (res.ok) {
        setRevisions(prev => prev.filter(r => r.id !== revisionId));
        showToast && showToast('Version gelöscht', 'success');
      } else {
        const d = await res.json();
        showToast && showToast(d.error || 'Fehler beim Löschen', 'error');
      }
    } catch (e) {
      showToast && showToast('Fehler beim Löschen', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {/* Hintergrund-Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 999,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '380px',
        background: '#fff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        zIndex: 1000,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'inherit',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #e5e7eb',
          background: '#f9fafb',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Versionsverlauf</h3>
            {pageName && (
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>{pageName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6b7280', padding: '4px', borderRadius: '4px',
              display: 'flex', alignItems: 'center',
            }}
            title="Schließen"
          >
            <X size={18} />
          </button>
        </div>

        {/* Revisionsliste */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: '#9ca3af' }}>
              <Loader size={20} style={{ animation: 'spin 1s linear infinite', marginRight: '0.5rem' }} />
              Lade Versionen…
            </div>
          )}

          {!loading && revisions.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.9rem' }}>
              Noch keine Versionen vorhanden.
            </div>
          )}

          {!loading && revisions.map((rev, idx) => {
            const d = rev.data || {};
            const blockCount = Array.isArray(d.blocks) ? d.blocks.length : null;
            const isBackup = rev.note && rev.note.startsWith('Automatisches Backup');
            const isRestoring = restoringId === rev.id;
            const isDeleting = deletingId === rev.id;
            const busy = isRestoring || isDeleting;

            return (
              <div
                key={rev.id}
                style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  background: isBackup ? '#fefce8' : '#fff',
                  opacity: busy ? 0.6 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Clock size={14} style={{ color: '#9ca3af', marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.85rem', color: '#111827' }}>
                      {d.title || `Version ${revisions.length - idx}`}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '1px' }}>
                      {formatDate(rev.createdAt)}
                      {blockCount !== null && ` · ${blockCount} Block${blockCount !== 1 ? 's' : ''}`}
                      {d.status && ` · ${d.status}`}
                    </div>
                    {rev.note && (
                      <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '2px', fontStyle: 'italic' }}>
                        {rev.note}
                      </div>
                    )}
                  </div>
                  {idx === 0 && (
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px',
                      background: '#dcfce7', color: '#16a34a', borderRadius: '999px',
                      flexShrink: 0,
                    }}>
                      Aktuell
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => handleDelete(rev.id)}
                    disabled={busy}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', fontSize: '0.75rem',
                      background: 'none', border: '1px solid #e5e7eb', borderRadius: '4px',
                      color: '#ef4444', cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                    title="Diese Version löschen"
                  >
                    {isDeleting ? <Loader size={12} /> : <Trash2 size={12} />}
                    Löschen
                  </button>
                  <button
                    onClick={() => handleRestore(rev.id)}
                    disabled={busy || idx === 0}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', fontSize: '0.75rem',
                      background: idx === 0 ? '#f3f4f6' : '#2563eb',
                      border: 'none', borderRadius: '4px',
                      color: idx === 0 ? '#9ca3af' : '#fff',
                      cursor: busy || idx === 0 ? 'not-allowed' : 'pointer',
                    }}
                    title={idx === 0 ? 'Dies ist bereits die aktuelle Version' : 'Diese Version wiederherstellen'}
                  >
                    {isRestoring ? <Loader size={12} /> : <RotateCcw size={12} />}
                    Wiederherstellen
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '0.75rem 1.25rem',
          borderTop: '1px solid #e5e7eb',
          background: '#f9fafb',
          fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center',
        }}>
          {revisions.length > 0 ? `${revisions.length} Version${revisions.length !== 1 ? 'en' : ''} gespeichert` : ''}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
