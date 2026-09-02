import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2, Edit2, Check, X, Layers } from '../lib/muiIcons';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

const STARTER_CODE = `<footer class="site-footer">
  <div class="footer-brand">
    <img src="{{global.logoUrl}}" alt="{{global.companyName}}">
    <p>{{global.companyName}}</p>
  </div>
  <nav aria-label="Footer-Navigation">
    {{#each:global.footerLinks}}
      <a href="{{url}}">{{label}}</a>
    {{/each:global.footerLinks}}
  </nav>
  <p class="footer-copy">{{global.copyrightText}}</p>
</footer>`;

export default function FooterView({ showToast }) {
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null); // { id?, name, code, isNew }
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadList = useCallback(() => {
    setIsLoading(true);
    fetch('/api/footers')
      .then(r => r.json())
      .then(data => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  function handleNew() {
    setEditing({ isNew: true });
    setEditName('');
    setEditCode(STARTER_CODE);
  }

  function handleEdit(item) {
    setIsLoading(true);
    fetch(`/api/footers?id=${encodeURIComponent(item.id)}`)
      .then(r => r.json())
      .then(data => { setEditing(data); setEditName(data.name); setEditCode(data.code); })
      .catch(err => showToast('Fehler beim Laden: ' + err.message, 'error'))
      .finally(() => setIsLoading(false));
  }

  function handleCancel() {
    setEditing(null);
    setEditName('');
    setEditCode('');
  }

  async function handleSave() {
    if (!editName.trim()) {
      showToast('Bitte einen Namen eingeben', 'error');
      return;
    }
    if (!editCode.trim()) {
      showToast('Bitte Footer-Code eingeben', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const isNew = editing?.isNew;
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew
        ? { name: editName.trim(), code: editCode }
        : { id: editing.id, name: editName.trim(), code: editCode };

      const res = await fetch('/api/footers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Unbekannter Fehler');
      }
      showToast(`Footer "${editName.trim()}" gespeichert`, 'success');
      loadList();
      handleCancel();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActivate(item) {
    try {
      const res = await fetch('/api/footers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
      });
      if (!res.ok) throw new Error('Fehler beim Aktualisieren');
      showToast(item.isActive ? 'Deaktiviert' : `"${item.name}" aktiviert`, 'success');
      loadList();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Footer "${item.name}" wirklich löschen?`)) return;
    try {
      const res = await fetch('/api/footers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) throw new Error('Fehler beim Löschen');
      showToast(`"${item.name}" gelöscht`, 'success');
      if (editing && editing.id === item.id) handleCancel();
      loadList();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }

  return (
    <div className="nav-view">
      <div className="nav-body">
        {/* ── Left: Footer list ───────────────────────────────────────────── */}
        <div className="nav-list-panel">
          <div className="nav-list-header">
            <h3 className="nav-list-title">Footer</h3>
            <button className="btn-icon-label" onClick={handleNew} title="Neuen Footer erstellen">
              <Plus size={15} /> Neu
            </button>
          </div>

          {isLoading && !editing ? (
            <div className="nav-empty-hint">Lädt…</div>
          ) : list.length === 0 ? (
            <div className="nav-empty-hint">
              Noch kein Footer angelegt.<br />
              <button className="nav-empty-cta" onClick={handleNew}>Ersten Footer erstellen</button>
            </div>
          ) : (
            <ul className="nav-template-list">
              {list.map(item => (
                <li
                  key={item.id}
                  className={`nav-template-card ${editing?.id === item.id ? 'selected' : ''} ${item.isActive ? 'is-active' : ''}`}
                >
                  <div className="nav-card-info">
                    <span className="nav-card-name">{item.name}</span>
                    {item.isActive && (
                      <span className="nav-active-badge">
                        <Check size={11} /> Aktiv
                      </span>
                    )}
                  </div>
                  <div className="nav-card-actions">
                    <button
                      className={`nav-card-btn activate ${item.isActive ? 'deactivate' : ''}`}
                      onClick={() => handleActivate(item)}
                      title={item.isActive ? 'Deaktivieren' : 'Aktivieren'}
                    >
                      {item.isActive ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    <button className="nav-card-btn edit" onClick={() => handleEdit(item)} title="Bearbeiten">
                      <Edit2 size={13} />
                    </button>
                    <button className="nav-card-btn delete" onClick={() => handleDelete(item)} title="Löschen">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Right: Editor panel ─────────────────────────────────────────── */}
        {editing ? (
          <div className="nav-editor-panel">
            <div className="nav-editor-header">
              <input
                className="nav-name-input"
                type="text"
                placeholder="Name dieses Footers…"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
              <div className="nav-editor-actions">
                <button className="nav-card-btn" onClick={handleCancel} title="Abbrechen">
                  <X size={14} /> Abbrechen
                </button>
                <button className="nav-card-btn save" onClick={handleSave} disabled={isSaving} title="Speichern">
                  <Check size={14} /> {isSaving ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </div>

            <div className="nav-editor-code" style={{ height: '60vh' }}>
              <div className="nav-panel-label">Mustache-Template</div>
              <div className="nav-monaco-wrap">
                <CodeEditor value={editCode} onChange={setEditCode} language="html" height="100%" />
              </div>
            </div>

            <div className="nav-placeholder-ref">
              <strong>Platzhalter:</strong> <code>{`{{global.<key>}}`}</code> globale Variablen ·
              der Footer wird am Ende des Seiten-Layouts eingefügt, wenn er aktiv ist.
            </div>
          </div>
        ) : (
          <div className="nav-editor-panel nav-editor-empty">
            <Layers size={40} strokeWidth={1} />
            <p>Footer aus der Liste wählen oder einen neuen erstellen.</p>
            <p className="nav-editor-empty-hint">
              Nur ein aktiver Footer wird gerendert, am Ende des Seiteninhalts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
