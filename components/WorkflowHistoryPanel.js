import React, { useEffect, useState } from 'react';
import { STATUS_LABELS, STATUS_COLORS } from '../lib/workflow';
import { History, X, ChevronRight } from '../lib/muiIcons';

const BADGE_STYLES = {
  'badge-gray':   { background: '#f5f5f5', color: '#616161', border: '1px solid #e0e0e0' },
  'badge-yellow': { background: '#fff8e1', color: '#f57f17', border: '1px solid #ffe082' },
  'badge-blue':   { background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9' },
  'badge-green':  { background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' },
  'badge-purple': { background: '#f3e5f5', color: '#6a1b9a', border: '1px solid #ce93d8' },
};

function StatusBadge({ status }) {
  const colorKey = STATUS_COLORS[status] || 'badge-gray';
  const style = BADGE_STYLES[colorKey] || BADGE_STYLES['badge-gray'];
  return (
    <span style={{
      ...style,
      padding: '1px 8px',
      borderRadius: 999,
      fontSize: '0.68rem',
      fontWeight: 700,
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

/**
 * WorkflowHistoryPanel
 * Zeigt den kompletten Freigabeverlauf einer Seite als modale Panel-Einblendung.
 *
 * Props:
 *  - pageId: string
 *  - onClose: () => void
 */
export default function WorkflowHistoryPanel({ pageId, onClose }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/pages/${pageId}/workflow-history`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.events) {
          setEvents(data.events);
        } else {
          setError(data.error || 'Fehler beim Laden.');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Netzwerkfehler.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [pageId]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.35)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--bg-primary, #fff)',
          borderLeft: '1px solid var(--border-color, #e0e0e0)',
          width: 420,
          maxWidth: '95vw',
          height: '100vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color, #e0e0e0)',
          background: 'var(--bg-secondary, #fafafa)',
        }}>
          <History size={16} />
          <strong style={{ flex: 1 }}>Freigabeverlauf</strong>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            aria-label="Panel schließen"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '16px 20px' }}>
          {loading && (
            <p style={{ color: 'var(--text-secondary, #757575)', fontSize: '0.85rem' }}>
              Lade Verlauf…
            </p>
          )}
          {error && (
            <p style={{ color: '#c62828', fontSize: '0.85rem' }}>{error}</p>
          )}
          {!loading && !error && events.length === 0 && (
            <p style={{ color: 'var(--text-secondary, #757575)', fontSize: '0.85rem' }}>
              Noch keine Workflow-Ereignisse vorhanden.
            </p>
          )}
          {!loading && events.length > 0 && (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {events.map((ev, idx) => (
                <li key={ev.id || idx} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '12px 0',
                  borderBottom: idx < events.length - 1
                    ? '1px solid var(--border-color, #e0e0e0)'
                    : 'none',
                }}>
                  {/* Transition row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <StatusBadge status={ev.fromStatus} />
                    <ChevronRight size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                    <StatusBadge status={ev.toStatus} />
                  </div>

                  {/* Comment */}
                  {ev.comment && (
                    <p style={{
                      margin: 0,
                      fontSize: '0.8rem',
                      color: 'var(--text-primary, #212121)',
                      background: 'var(--bg-secondary, #f5f5f5)',
                      borderRadius: 6,
                      padding: '6px 10px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {ev.comment}
                    </p>
                  )}

                  {/* Meta */}
                  <div style={{ display: 'flex', gap: 8, fontSize: '0.72rem', color: 'var(--text-secondary, #757575)' }}>
                    {ev.createdBy && <span>{ev.createdBy}</span>}
                    {ev.createdAt && (
                      <span>{new Date(ev.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
