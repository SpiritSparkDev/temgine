import React, { useEffect, useState, useCallback } from 'react';
import { Mail, Trash2, Eye, EyeOff, RefreshCw, Inbox } from 'lucide-react';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ContactMessagesView({ showToast }) {
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/admin/contact-messages?limit=100${onlyUnread ? '&unread=true' : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Laden fehlgeschlagen');
      const data = await res.json();
      setMessages(data.messages || []);
      setTotal(data.total || 0);
    } catch (e) {
      showToast?.('Nachrichten konnten nicht geladen werden.', 'error');
    } finally {
      setLoading(false);
    }
  }, [onlyUnread, showToast]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id) {
    try {
      const res = await fetch(`/api/admin/contact-messages?id=${id}`, { method: 'PATCH' });
      if (!res.ok) throw new Error();
      setMessages(prev => prev.map(m => m.id === id ? { ...m, readAt: new Date().toISOString() } : m));
    } catch {
      showToast?.('Fehler beim Markieren.', 'error');
    }
  }

  async function deleteMessage(id) {
    if (!window.confirm('Nachricht wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/admin/contact-messages?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMessages(prev => prev.filter(m => m.id !== id));
      setTotal(t => t - 1);
      if (expanded === id) setExpanded(null);
      showToast?.('Nachricht gelöscht.', 'success');
    } catch {
      showToast?.('Fehler beim Löschen.', 'error');
    }
  }

  const unreadCount = messages.filter(m => !m.readAt).length;

  return (
    <div style={{ padding: '24px', maxWidth: '900px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Mail size={20} /> Kontaktformular-Nachrichten
        </h2>
        {unreadCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', borderRadius: '999px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
            {unreadCount} ungelesen
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyUnread} onChange={e => setOnlyUnread(e.target.checked)} />
            Nur ungelesene
          </label>
          <button onClick={load} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}>
            <RefreshCw size={13} /> Aktualisieren
          </button>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-tertiary)', padding: '32px 0', textAlign: 'center' }}>Lade Nachrichten…</div>}

      {!loading && messages.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
          <Inbox size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p>{onlyUnread ? 'Keine ungelesenen Nachrichten.' : 'Noch keine Nachrichten vorhanden.'}</p>
        </div>
      )}

      {!loading && messages.length > 0 && (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          {messages.map((msg, i) => {
            const isOpen = expanded === msg.id;
            const isRead = Boolean(msg.readAt);
            return (
              <div
                key={msg.id}
                style={{
                  borderBottom: i < messages.length - 1 ? '1px solid var(--border-color)' : 'none',
                  background: isRead ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                }}
              >
                {/* Header row */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', cursor: 'pointer' }}
                  onClick={() => {
                    setExpanded(isOpen ? null : msg.id);
                    if (!isRead) markRead(msg.id);
                  }}
                >
                  {!isRead && (
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: isRead ? 400 : 600, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {msg.name} &lt;{msg.email}&gt;
                    </div>
                    {msg.subject && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {msg.subject}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>{formatDate(msg.createdAt)}</div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button
                      title={isRead ? 'Als ungelesen markieren' : 'Als gelesen markieren'}
                      onClick={() => isRead ? setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, readAt: null } : m)) : markRead(msg.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-tertiary)', borderRadius: '4px' }}
                    >
                      {isRead ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      title="Löschen"
                      onClick={() => deleteMessage(msg.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#ef4444', borderRadius: '4px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Expanded message body */}
                {isOpen && (
                  <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: '6px', padding: '12px 14px', marginTop: '12px', fontSize: '0.875rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {msg.message}
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      Von: <a href={`mailto:${msg.email}`} style={{ color: 'var(--accent-color, #3b82f6)' }}>{msg.email}</a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && total > messages.length && (
        <p style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
          Zeige {messages.length} von {total} Nachrichten.
        </p>
      )}
    </div>
  );
}
