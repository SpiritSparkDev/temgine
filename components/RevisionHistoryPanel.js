import React, { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Trash2, Clock, Loader, GitCompare } from '../lib/muiIcons';

function formatDate(dateStr) {
  if (!dateStr) return '–';
  const d = new Date(dateStr);
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Render a simple line-level diff between two text strings
function renderDiff(oldText, newText) {
  if (oldText === newText) return <span style={{ color: '#6b7280' }}>(unverändert)</span>;
  return (
    <span>
      <span style={{ background: '#fee2e2', color: '#991b1b', textDecoration: 'line-through', marginRight: 4 }}>
        {String(oldText ?? '—')}
      </span>
      <span style={{ background: '#dcfce7', color: '#166534' }}>
        {String(newText ?? '—')}
      </span>
    </span>
  );
}

function DiffView({ revA, revB, onClose }) {
  const a = revA.data || {};
  const b = revB.data || {};
  const aBlocks = Array.isArray(a.blocks) ? a.blocks : [];
  const bBlocks = Array.isArray(b.blocks) ? b.blocks : [];

  const rows = [
    { label: 'Titel', old: a.title, new: b.title },
    { label: 'Slug', old: a.slug, new: b.slug },
    { label: 'Status', old: a.status, new: b.status },
    { label: 'Blöcke (Anzahl)', old: aBlocks.length, new: bBlocks.length },
    { label: 'Meta Title', old: a.seo?.metaTitle, new: b.seo?.metaTitle },
    { label: 'Meta Description', old: a.seo?.metaDescription, new: b.seo?.metaDescription },
  ];

  return (
    <div style={{ padding: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <strong style={{ fontSize: '0.9rem' }}>Versionsvergleich</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', display: 'flex', gap: '1rem' }}>
        <span>A: {formatDate(revA.createdAt)}</span>
        <span>→</span>
        <span>B: {formatDate(revB.createdAt)}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>Feld</th>
            <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280', fontWeight: 600 }}>Änderung</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '5px 6px', color: '#374151', whiteSpace: 'nowrap' }}>{row.label}</td>
              <td style={{ padding: '5px 6px' }}>{renderDiff(row.old, row.new)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Block-level diff */}
      {(aBlocks.length > 0 || bBlocks.length > 0) && (
        <div style={{ marginTop: '0.75rem' }}>
          <strong style={{ fontSize: '0.8rem', color: '#374151' }}>Block-Änderungen</strong>
          <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#6b7280' }}>
            {bBlocks.map((bBlock, i) => {
              const aBlock = aBlocks[i];
              const changed = !aBlock || JSON.stringify(aBlock) !== JSON.stringify(bBlock);
              const added = !aBlock;
              return (
                <div key={i} style={{ padding: '3px 6px', borderRadius: 4, marginBottom: 2, background: added ? '#dcfce7' : changed ? '#fef9c3' : 'transparent' }}>
                  Block {i + 1}: {bBlock.template || bBlock.type || '?'}
                  {added && <span style={{ marginLeft: 6, color: '#166534' }}>+neu</span>}
                  {!added && changed && <span style={{ marginLeft: 6, color: '#854d0e' }}>geändert</span>}
                </div>
              );
            })}
            {aBlocks.slice(bBlocks.length).map((_, i) => (
              <div key={`del-${i}`} style={{ padding: '3px 6px', borderRadius: 4, marginBottom: 2, background: '#fee2e2' }}>
                Block {bBlocks.length + i + 1}: <span style={{ color: '#991b1b' }}>entfernt</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RevisionHistoryPanel({ pageId, pageName, onClose, onRestored, showToast }) {
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [compareIds, setCompareIds] = useState([]); // up to 2 revision IDs for comparison
  const [showDiff, setShowDiff] = useState(false);

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
        setCompareIds(prev => prev.filter(id => id !== revisionId));
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

  function toggleCompare(revId) {
    setCompareIds(prev => {
      if (prev.includes(revId)) return prev.filter(id => id !== revId);
      if (prev.length >= 2) return [prev[1], revId]; // rotate: keep latest selected + new
      return [...prev, revId];
    });
    setShowDiff(false);
  }

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

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => toggleCompare(rev.id)}
                    disabled={busy}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 10px', fontSize: '0.75rem',
                      background: compareIds.includes(rev.id) ? '#eff6ff' : 'none',
                      border: `1px solid ${compareIds.includes(rev.id) ? '#3b82f6' : '#e5e7eb'}`,
                      borderRadius: '4px',
                      color: compareIds.includes(rev.id) ? '#2563eb' : '#6b7280',
                      cursor: busy ? 'not-allowed' : 'pointer',
                    }}
                    title={compareIds.includes(rev.id) ? 'Aus Vergleich entfernen' : 'Zum Vergleich auswählen (2 Versionen wählen)'}
                  >
                    <GitCompare size={12} />
                    {compareIds.includes(rev.id) ? `✓ ${compareIds.indexOf(rev.id) === 0 ? 'A' : 'B'}` : 'Vergleich'}
                  </button>
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

      {/* Diff overlay */}
      {showDiff && compareIds.length === 2 && (() => {
        const revA = revisions.find(r => r.id === compareIds[0]);
        const revB = revisions.find(r => r.id === compareIds[1]);
        if (!revA || !revB) return null;
        return (
          <div style={{
            position: 'fixed', top: 0, right: '385px', bottom: 0,
            width: '480px',
            background: '#fff',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
            zIndex: 1000,
            overflowY: 'auto',
            fontFamily: 'inherit',
          }}>
            <DiffView revA={revA} revB={revB} onClose={() => setShowDiff(false)} />
          </div>
        );
      })()}

      {/* Compare banner */}
      {compareIds.length > 0 && !showDiff && (
        <div style={{
          position: 'fixed',
          bottom: '1rem', right: '395px',
          background: '#1e3a8a', color: '#fff',
          borderRadius: '8px', padding: '8px 14px',
          fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          zIndex: 1001,
        }}>
          <GitCompare size={14} />
          {compareIds.length === 1 ? 'Wähle eine zweite Version' : '2 Versionen ausgewählt'}
          {compareIds.length === 2 && (
            <button
              onClick={() => setShowDiff(true)}
              style={{
                background: '#fff', color: '#1e3a8a',
                border: 'none', borderRadius: '4px',
                padding: '3px 10px', fontSize: '0.78rem',
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              Vergleichen
            </button>
          )}
          <button
            onClick={() => { setCompareIds([]); setShowDiff(false); }}
            style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', padding: '2px' }}
            title="Vergleich abbrechen"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
