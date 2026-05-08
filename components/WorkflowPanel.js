import React, { useState } from 'react';
import { availableTransitions, STATUS_LABELS, STATUS_COLORS } from '../lib/workflow';
import WorkflowHistoryPanel from './WorkflowHistoryPanel';
import { History } from '../lib/muiIcons';

const TRANSITION_LABELS = {
  DRAFT:     'Zurück zu Entwurf',
  REVIEW:    'Zur Prüfung einreichen',
  APPROVED:  'Freigeben',
  PUBLISHED: 'Veröffentlichen',
  SCHEDULED: 'Zeitgesteuert planen',
};

const BADGE_STYLES = {
  'badge-gray':   { background: '#f5f5f5', color: '#616161', border: '1px solid #e0e0e0' },
  'badge-yellow': { background: '#fff8e1', color: '#f57f17', border: '1px solid #ffe082' },
  'badge-blue':   { background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9' },
  'badge-green':  { background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' },
  'badge-purple': { background: '#f3e5f5', color: '#6a1b9a', border: '1px solid #ce93d8' },
};

/**
 * WorkflowPanel — zeigt den aktuellen Seitenstatus und verfügbare Statusübergänge.
 *
 * Props:
 *  - pageId:    string  — ID der Seite
 *  - status:    string  — aktueller PageStatus (z.B. 'DRAFT')
 *  - userRole:  string  — Rolle des eingeloggten Benutzers ('ADMIN'|'MODERATOR'|'EDITOR')
 *  - onTransition: (newStatus: string) => void — callback nach erfolgreichem Übergang
 */
export default function WorkflowPanel({ pageId, status, userRole, onTransition }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [comment, setComment] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const currentStatus = (status || 'DRAFT').toUpperCase();
  const role = (userRole || 'EDITOR').toUpperCase();
  const available = availableTransitions(currentStatus, role);

  const badgeStyle = BADGE_STYLES[STATUS_COLORS[currentStatus] || 'badge-gray'] || BADGE_STYLES['badge-gray'];

  const handleTransition = async (toStatus) => {
    if (!pageId) {
      setError('Seite muss zuerst gespeichert werden.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pages/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, toStatus, note: comment.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Fehler beim Statuswechsel.');
      } else {
        setComment('');
        onTransition && onTransition(toStatus);
      }
    } catch (_e) {
      setError('Netzwerkfehler beim Statuswechsel.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      {showHistory && pageId && (
        <WorkflowHistoryPanel pageId={pageId} onClose={() => setShowHistory(false)} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <label className="field-label-xs" style={{ margin: 0, flex: 1 }}>Workflow-Status</label>
        {pageId && (
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: 'var(--text-secondary, #757575)' }}
            title="Freigabeverlauf anzeigen"
          >
            <History size={12} /> Verlauf
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            ...badgeStyle,
            padding: '2px 10px',
            borderRadius: 999,
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.03em',
          }}
        >
          {STATUS_LABELS[currentStatus] || currentStatus}
        </span>
      </div>

      {available.length > 0 && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Kommentar (optional)"
            rows={2}
            maxLength={2000}
            style={{
              width: '100%',
              fontSize: '0.78rem',
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--border-color, #e0e0e0)',
              resize: 'vertical',
              marginBottom: 6,
              background: 'var(--bg-primary, #fff)',
              color: 'var(--text-primary, #212121)',
              boxSizing: 'border-box',
            }}
            aria-label="Kommentar zum Statuswechsel"
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {available.map((toStatus) => (
              <button
                key={toStatus}
                type="button"
                className={`btn-modern-small${toStatus === 'PUBLISHED' ? ' green' : toStatus === 'DRAFT' ? '' : ' hollow'}`}
                disabled={loading}
                onClick={() => handleTransition(toStatus)}
                title={`Status ändern zu: ${STATUS_LABELS[toStatus] || toStatus}`}
              >
                {loading ? '...' : (TRANSITION_LABELS[toStatus] || toStatus)}
              </button>
            ))}
          </div>
        </>
      )}

      {error && (
        <p style={{ color: '#c62828', fontSize: '0.75rem', marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
}
