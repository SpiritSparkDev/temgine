import React, { useState, useEffect } from 'react';
import { Shield, User, Edit2, Trash2 } from '../lib/muiIcons';

const ROLE_LABELS = {
  ADMIN: 'Administrator',
  MODERATOR: 'Moderator',
  EDITOR: 'Redakteur'
};

const ROLE_DESCRIPTIONS = {
  ADMIN: 'Volle Rechte: Alle Funktionen verfügbar',
  MODERATOR: 'Erweiterte Rechte: Seiten, Templates, CSS, Navigation',
  EDITOR: 'Basis-Rechte: Nur Seiten bearbeiten'
};

const ROLE_COLORS = {
  ADMIN: '#dc2626',
  MODERATOR: '#2563eb',
  EDITOR: '#16a34a'
};

export default function UsersViewModern({ showToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  function loadUsers() {
    setLoading(true);
    fetch('/api/users/roles')
      .then(r => r.json())
      .then(data => {
        setUsers(data.users || []);
        setLoading(false);
      })
      .catch(err => {
        showToast('Fehler beim Laden: ' + err.message, 'error');
        setLoading(false);
      });
  }

  async function handleRoleChange(userId, newRole) {
    try {
      const res = await fetch('/api/users/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole })
      });

      const data = await res.json();

      if (data.success) {
        showToast('Rolle erfolgreich geändert!', 'success');
        loadUsers();
        setEditingUser(null);
      } else {
        showToast(data.error || 'Fehler beim Ändern', 'error');
      }
    } catch (error) {
      showToast('Fehler: ' + error.message, 'error');
    }
  }

  return (
    <div className="users-container">
      <div className="users-header">
        <h2><Shield size={24} /> Benutzerverwaltung</h2>
        <p className="users-subtitle">Verwalte Benutzerrollen und Berechtigungen</p>
      </div>

      {loading ? (
        <div className="loading-state">Lade Benutzer...</div>
      ) : (
        <div className="users-grid">
          {users.map(user => (
            <div key={user.id} className="user-card">
              <div className="user-avatar">
                {user.image ? (
                  <img src={user.image} alt={user.name} />
                ) : (
                  <User size={32} />
                )}
              </div>

              <div className="user-info">
                <div className="user-name">{user.name || 'Unbenannt'}</div>
                <div className="user-email">{user.email}</div>
              </div>

              <div className="user-role-section">
                {editingUser === user.id ? (
                  <div className="role-edit">
                    <select
                      className="role-select"
                      defaultValue={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    >
                      {Object.entries(ROLE_LABELS).map(([role, label]) => (
                        <option key={role} value={role}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button 
                      className="btn-secondary"
                      onClick={() => setEditingUser(null)}
                    >
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <div className="role-display">
                    <span 
                      className="role-badge"
                      style={{ backgroundColor: ROLE_COLORS[user.role] }}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                    <button
                      className="icon-btn-small"
                      onClick={() => setEditingUser(user.id)}
                      title="Rolle ändern"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                )}
                
                <div className="role-description">
                  {ROLE_DESCRIPTIONS[user.role]}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="permissions-info">
        <h3>Berechtigungsübersicht</h3>
        <div className="permissions-grid">
          <div className="permission-item">
            <div className="permission-role" style={{color: ROLE_COLORS.ADMIN}}>
              <Shield size={16} /> Administrator
            </div>
            <ul>
              <li>Alle Funktionen</li>
              <li>User-Management</li>
              <li>Settings & Datenbank</li>
              <li>Templates & CSS löschen</li>
            </ul>
          </div>

          <div className="permission-item">
            <div className="permission-role" style={{color: ROLE_COLORS.MODERATOR}}>
              <Shield size={16} /> Moderator
            </div>
            <ul>
              <li>Seiten verwalten</li>
              <li>Templates bearbeiten</li>
              <li>CSS & Navigation</li>
              <li>Snippets verwalten</li>
            </ul>
          </div>

          <div className="permission-item">
            <div className="permission-role" style={{color: ROLE_COLORS.EDITOR}}>
              <Shield size={16} /> Redakteur
            </div>
            <ul>
              <li>Seiten bearbeiten</li>
              <li>Dateien hochladen</li>
              <li>Snippets ansehen</li>
              <li>Nur Inhalte</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
