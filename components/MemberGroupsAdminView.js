import React, { useEffect, useState, useCallback } from 'react';
import { Shield, Plus, Pencil, Trash2, RefreshCw, Check, X } from 'lucide-react';

export default function MemberGroupsAdminView({ showToast }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/member-groups');
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch {
      showToast?.('Laden fehlgeschlagen.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  async function createGroup() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/member-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Fehler');
      }
      const group = await res.json();
      setGroups(prev => [...prev, { ...group, memberCount: 0 }]);
      setNewName('');
      showToast?.('Gruppe erstellt.', 'success');
    } catch (e) {
      showToast?.(e.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit(id) {
    const name = editName.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/admin/member-groups?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Fehler');
      }
      const updated = await res.json();
      setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updated } : g));
      setEditingId(null);
      showToast?.('Gruppe umbenannt.', 'success');
    } catch (e) {
      showToast?.(e.message, 'error');
    }
  }

  async function deleteGroup(id, name) {
    if (!window.confirm(`Gruppe "${name}" wirklich löschen? Alle Mitglieder werden aus der Gruppe entfernt.`)) return;
    try {
      const res = await fetch(`/api/admin/member-groups?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setGroups(prev => prev.filter(g => g.id !== id));
      showToast?.('Gruppe gelöscht.', 'success');
    } catch {
      showToast?.('Fehler beim Löschen.', 'error');
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '640px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={20} /> Mitglieder-Gruppen
        </h2>
        <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}>
          <RefreshCw size={13} /> Aktualisieren
        </button>
      </div>

      {/* Create new group */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createGroup()}
          placeholder="Neuer Gruppenname…"
          style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
        />
        <button
          onClick={createGroup}
          disabled={creating || !newName.trim()}
          style={{ background: 'var(--accent-color, #3b82f6)', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', opacity: creating || !newName.trim() ? 0.5 : 1 }}
        >
          <Plus size={15} /> Erstellen
        </button>
      </div>

      {loading && <div style={{ color: 'var(--text-tertiary)', padding: '24px 0', textAlign: 'center' }}>Lade Gruppen…</div>}

      {!loading && groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
          Noch keine Gruppen vorhanden.
        </div>
      )}

      {!loading && groups.length > 0 && (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          {groups.map((g, i) => (
            <div
              key={g.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
                borderBottom: i < groups.length - 1 ? '1px solid var(--border-color)' : 'none',
                background: 'var(--bg-primary)',
              }}
            >
              <Shield size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />

              {editingId === g.id ? (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(g.id); if (e.key === 'Escape') setEditingId(null); }}
                    style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.875rem' }}
                  />
                  <button onClick={() => saveEdit(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#16a34a' }}><Check size={14} /></button>
                  <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-tertiary)' }}><X size={14} /></button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{g.name}</span>
                    <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>/{g.slug}</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginRight: '4px' }}>{g.memberCount ?? 0} Mitgl.</span>
                  <button onClick={() => { setEditingId(g.id); setEditName(g.name); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)', borderRadius: '4px' }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => deleteGroup(g.id, g.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#ef4444', borderRadius: '4px' }}>
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>
        <strong>Zugangskontrolle:</strong> Weise Seiten im Seiten-Editor einer oder mehreren Gruppen zu.
        Nur Mitglieder dieser Gruppen können die Seite sehen.
        Ein leeres Gruppen-Feld bedeutet: öffentlich zugänglich.
      </div>
    </div>
  );
}
