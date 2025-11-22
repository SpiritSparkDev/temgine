import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

export default function UsersView({ showToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      showToast?.('Fehler beim Laden der Benutzer: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Möchten Sie diesen Benutzer wirklich löschen?')) {
      return;
    }

    try {
      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        showToast?.('Benutzer gelöscht', 'success');
        loadUsers();
      } else {
        const data = await res.json();
        showToast?.('Fehler: ' + data.error, 'error');
      }
    } catch (error) {
      showToast?.('Fehler beim Löschen: ' + error.message, 'error');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="admin-editor-area">
        <div className="users-view" style={{ textAlign: 'center' }}>
          Lade Benutzer...
        </div>
      </div>
    );
  }

  return (
    <div className="admin-editor-area">
      <div className="users-view">
        <div className="users-header">
          <h2>Benutzer ({users.length})</h2>
        </div>

        {users.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Noch keine Benutzer registriert.</p>
          </div>
        ) : (
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>E-Mail</th>
                  <th>Registriert</th>
                  <th>Letztes Update</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-avatar-cell">
                        {user.image ? (
                          <img 
                            src={user.image} 
                            alt={user.name} 
                            className="user-avatar"
                          />
                        ) : (
                          <div className="user-avatar-placeholder">
                            {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                          </div>
                        )}
                        <span className="user-name">{user.name || 'Unbekannt'}</span>
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td className="user-date">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="user-date">
                      {formatDate(user.updatedAt)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="user-delete-btn"
                      >
                        <Trash2 size={14} />
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
