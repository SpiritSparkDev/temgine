import React, { useState, useEffect } from 'react';
import { UserPlus, Mail, Copy, Trash2, CheckCircle2, XCircle, Clock, Shield } from '../lib/muiIcons';

const ROLE_LABELS = {
  ADMIN: 'Administrator',
  MODERATOR: 'Moderator',
  EDITOR: 'Redakteur'
};

export default function UserInvitationsView({ showToast }) {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    role: 'EDITOR'
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadInvitations();
  }, []);

  function loadInvitations() {
    setLoading(true);
    fetch('/api/users/invitations')
      .then(r => r.json())
      .then(data => {
        console.log('Load invitations response:', data);
        setInvitations(data.invitations || []);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Load invitations exception:', error);
        showToast('Fehler beim Laden: ' + error.message, 'error');
        setLoading(false);
      });
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);

    try {
      const res = await fetch('/api/users/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (data.success) {
        console.log('Invitation created successfully:', data);
        showToast('Einladung erstellt! Link kopiert.', 'success');
        copyToClipboard(data.invitation.inviteUrl);
        setFormData({ name: '', role: 'EDITOR' });
        setShowForm(false);
        loadInvitations();
      } else {
        console.error('Create invitation failed:', data);
        showToast(data.error || 'Fehler beim Erstellen', 'error');
        if (data.details) console.error('Details:', data.details);
      }
    } catch (error) {
      console.error('Create invitation exception:', error);
      showToast('Fehler: ' + error.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id) {
    try {
      const res = await fetch('/api/users/invitations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });

      const data = await res.json();

      if (data.success) {
        console.log('Invitation deleted successfully');
        showToast('Einladung gelöscht', 'success');
        loadInvitations();
      } else {
        console.error('Delete invitation failed:', data);
        showToast(data.error || 'Fehler beim Löschen', 'error');
      }
    } catch (error) {
      showToast('Fehler: ' + error.message, 'error');
    }
  }

  function copyToClipboard(url) {
    navigator.clipboard.writeText(url);
    showToast('Einladungslink kopiert!', 'success');
  }

  function formatDate(date) {
    return new Date(date).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function isExpired(date) {
    return new Date(date) < new Date();
  }

  return (
    <div className="invitations-container">
      <div className="invitations-header">
        <div>
          <h2>Benutzer einladen</h2>
          <p className="invitations-subtitle">Erstellen Sie Einladungslinks für neue Benutzer</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          <UserPlus size={16} />
          Neue Einladung
        </button>
      </div>

      {showForm && (
        <div className="invitation-form-card">
          <h3>Neue Einladung erstellen</h3>
          <form onSubmit={handleCreate} className="invitation-form">
            <div className="form-group">
              <label>Name / Beschreibung (optional)</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="z.B. 'Neuer Redakteur' oder 'Max Mustermann'"
              />
            </div>

            <div className="form-group">
              <label>Rolle</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({...formData, role: e.target.value})}
              >
                <option value="EDITOR">Redakteur</option>
                <option value="MODERATOR">Moderator</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </div>

            <div className="form-actions">
              <button 
                type="button" 
                className="btn-secondary"
                onClick={() => setShowForm(false)}
                disabled={creating}
              >
                Abbrechen
              </button>
              <button 
                type="submit" 
                className="btn-primary"
                disabled={creating}
              >
                {creating ? 'Erstelle...' : 'Einladung erstellen'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="invitations-list">
        {loading ? (
          <div className="loading-state">Lade Einladungen...</div>
        ) : invitations.length === 0 ? (
          <div className="empty-state">
            <Mail size={48} color="#9ca3af" />
            <p>Keine Einladungen vorhanden</p>
          </div>
        ) : (
          <div className="invitations-grid">
            {invitations.map(inv => (
              <div key={inv.id} className={`invitation-card ${inv.used ? 'used' : ''} ${isExpired(inv.expiresAt) ? 'expired' : ''}`}>
                <div className="invitation-header">
                  <div className="invitation-status">
                    {inv.used ? (
                      <CheckCircle size={20} color="#16a34a" />
                    ) : isExpired(inv.expiresAt) ? (
                      <XCircle size={20} color="#dc2626" />
                    ) : (
                      <Clock size={20} color="#f59e0b" />
                    )}
                    <span className="status-text">
                      {inv.used ? 'Verwendet' : isExpired(inv.expiresAt) ? 'Abgelaufen' : 'Aktiv'}
                    </span>
                  </div>
                  {!inv.used && !isExpired(inv.expiresAt) && (
                    <button
                      className="icon-btn-small delete"
                      onClick={() => handleDelete(inv.id)}
                      title="Einladung widerrufen"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div className="invitation-info">
                  {inv.name && (
                    <div className="info-row">
                      <span className="info-label">Name:</span>
                      <span>{inv.name}</span>
                    </div>
                  )}
                  <div className="info-row">
                    <Shield size={16} />
                    <span>{ROLE_LABELS[inv.role]}</span>
                  </div>
                  {inv.usedBy && (
                    <div className="info-row">
                      <Mail size={16} />
                      <span>{inv.usedBy}</span>
                    </div>
                  )}
                </div>

                <div className="invitation-meta">
                  <div className="meta-item">
                    <span className="meta-label">Erstellt:</span>
                    <span>{formatDate(inv.createdAt)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Gültig bis:</span>
                    <span>{formatDate(inv.expiresAt)}</span>
                  </div>
                  {inv.used && inv.usedAt && (
                    <div className="meta-item">
                      <span className="meta-label">Verwendet am:</span>
                      <span>{formatDate(inv.usedAt)}</span>
                    </div>
                  )}
                  <div className="meta-item">
                    <span className="meta-label">Von:</span>
                    <span>{inv.creator.name || inv.creator.email}</span>
                  </div>
                </div>

                {!inv.used && !isExpired(inv.expiresAt) && (
                  <button
                    className="copy-link-btn"
                    onClick={() => copyToClipboard(`${window.location.origin}/invite/${inv.token}`)}
                  >
                    <Copy size={16} />
                    Link kopieren
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .invitations-container {
          max-width: 1400px;
          padding: 2rem;
        }

        .invitations-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2rem;
        }

        .invitations-header h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.75rem;
          color: var(--text-primary);
        }

        .invitations-subtitle {
          color: var(--text-secondary);
          margin: 0;
        }

        .invitation-form-card {
          background: var(--background-secondary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 2rem;
          margin-bottom: 2rem;
        }

        .invitation-form-card h3 {
          margin: 0 0 1.5rem 0;
          color: var(--text-primary);
        }

        .invitation-form {
          display: grid;
          gap: 1.5rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group label {
          font-weight: 600;
          color: var(--text-primary);
        }

        .form-group input,
        .form-group select {
          padding: 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--background-primary);
          color: var(--text-primary);
          font-size: 1rem;
        }

        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #667eea;
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
        }

        .invitations-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 1.5rem;
        }

        .invitation-card {
          background: var(--background-secondary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .invitation-card.used {
          opacity: 0.7;
        }

        .invitation-card.expired {
          opacity: 0.6;
          border-color: #fca5a5;
        }

        .invitation-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .invitation-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .status-text {
          font-weight: 600;
          font-size: 0.875rem;
        }

        .invitation-info {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1rem 0;
          border-top: 1px solid var(--border-color);
          border-bottom: 1px solid var(--border-color);
        }

        .info-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: var(--text-primary);
        }

        .info-label {
          color: var(--text-secondary);
          font-size: 0.875rem;
        }

        .invitation-meta {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .meta-item {
          display: flex;
          justify-content: space-between;
          font-size: 0.875rem;
        }

        .meta-label {
          color: var(--text-secondary);
        }

        .copy-link-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .copy-link-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .loading-state,
        .empty-state {
          text-align: center;
          padding: 3rem;
          color: var(--text-secondary);
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }
      `}</style>
    </div>
  );
}
