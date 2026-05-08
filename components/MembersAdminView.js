import React, { useEffect, useState, useCallback } from 'react';
import { Users, Trash2, Shield, ShieldOff, RefreshCw, UserX, UserPlus } from '../lib/muiIcons';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function MembersAdminView({ showToast }) {
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingGroups, setEditingGroups] = useState(null); // memberId

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, gRes] = await Promise.all([
        fetch('/api/admin/members'),
        fetch('/api/admin/member-groups'),
      ]);
      const [mData, gData] = await Promise.all([mRes.json(), gRes.json()]);
      setMembers(Array.isArray(mData) ? mData : []);
      setGroups(Array.isArray(gData) ? gData : []);
    } catch {
      showToast?.('Laden fehlgeschlagen.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  async function toggleBlock(member) {
    try {
      const res = await fetch(`/api/admin/members?id=${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked: !member.blocked }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setMembers(prev => prev.map(m => m.id === updated.id ? { ...updated, groups: updated.groups } : m));
      showToast?.(member.blocked ? 'Mitglied entsperrt.' : 'Mitglied gesperrt.', 'success');
    } catch {
      showToast?.('Fehler.', 'error');
    }
  }

  async function deleteMember(id) {
    if (!window.confirm('Mitglied wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/admin/members?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setMembers(prev => prev.filter(m => m.id !== id));
      showToast?.('Mitglied gelöscht.', 'success');
    } catch {
      showToast?.('Fehler beim Löschen.', 'error');
    }
  }

  async function saveGroups(memberId, groupIds) {
    try {
      const res = await fetch(`/api/admin/members?id=${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setMembers(prev => prev.map(m => m.id === updated.id ? { ...updated, groups: updated.groups } : m));
      setEditingGroups(null);
      showToast?.('Gruppen gespeichert.', 'success');
    } catch {
      showToast?.('Fehler beim Speichern.', 'error');
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '960px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={20} /> Mitglieder
        </h2>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>{members.length} gesamt</span>
        <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}>
          <RefreshCw size={13} /> Aktualisieren
        </button>
      </div>

      {loading && <div style={{ color: 'var(--text-tertiary)', padding: '32px 0', textAlign: 'center' }}>Lade Mitglieder…</div>}

      {!loading && members.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
          <Users size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p>Noch keine Mitglieder registriert.</p>
        </div>
      )}

      {!loading && members.length > 0 && (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>E-Mail</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Gruppen</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>Registriert</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: i < members.length - 1 ? '1px solid var(--border-color)' : 'none', background: m.blocked ? 'rgba(239,68,68,0.04)' : 'var(--bg-primary)' }}>
                  <td style={{ padding: '10px 12px', wordBreak: 'break-all' }}>{m.email}</td>
                  <td style={{ padding: '10px 12px' }}>{m.name || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {editingGroups === m.id ? (
                      <GroupSelector
                        allGroups={groups}
                        selected={m.groups.map(g => g.id)}
                        onSave={(ids) => saveGroups(m.id, ids)}
                        onCancel={() => setEditingGroups(null)}
                      />
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                        {m.groups.length === 0 ? (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Keine</span>
                        ) : (
                          m.groups.map(g => (
                            <span key={g.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '1px 6px', fontSize: '0.75rem' }}>{g.name}</span>
                          ))
                        )}
                        <button onClick={() => setEditingGroups(m.id)} style={{ fontSize: '0.72rem', color: 'var(--accent-color, #3b82f6)', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', textDecoration: 'underline' }}>
                          bearbeiten
                        </button>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      {m.verified ? (
                        <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#166534', borderRadius: '4px', padding: '1px 6px' }}>✓ Verifiziert</span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', background: '#fef9c3', color: '#854d0e', borderRadius: '4px', padding: '1px 6px' }}>Ausstehend</span>
                      )}
                      {m.blocked && (
                        <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', padding: '1px 6px' }}>Gesperrt</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>{formatDate(m.createdAt)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => toggleBlock(m)}
                        title={m.blocked ? 'Entsperren' : 'Sperren'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: m.blocked ? '#16a34a' : '#f59e0b', borderRadius: '4px' }}
                      >
                        {m.blocked ? <UserCheck size={15} /> : <UserX size={15} />}
                      </button>
                      <button
                        onClick={() => deleteMember(m.id)}
                        title="Löschen"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#ef4444', borderRadius: '4px' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GroupSelector({ allGroups, selected, onSave, onCancel }) {
  const [chosen, setChosen] = useState(new Set(selected));

  function toggle(id) {
    setChosen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
      {allGroups.map(g => (
        <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.78rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={chosen.has(g.id)} onChange={() => toggle(g.id)} />
          {g.name}
        </label>
      ))}
      <button onClick={() => onSave(Array.from(chosen))} style={{ fontSize: '0.75rem', background: 'var(--accent-color,#3b82f6)', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>OK</button>
      <button onClick={onCancel} style={{ fontSize: '0.75rem', background: 'none', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>Abbruch</button>
    </div>
  );
}
