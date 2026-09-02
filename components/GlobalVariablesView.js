import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Edit2, Check, X, Tag, Copy } from '../lib/muiIcons';

const TYPES = ['STRING', 'NUMBER', 'URL', 'IMAGE', 'DATE', 'BOOLEAN', 'ARRAY', 'HTML'];
const EMPTY_FORM = { key: '', label: '', type: 'STRING', value: '', fallback: '', isActive: true, sortOrder: 0 };

export default function GlobalVariablesView({ showToast }) {
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { id?, isNew }
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const loadList = useCallback(() => {
    setIsLoading(true);
    fetch('/api/global-variables')
      .then(r => r.json())
      .then(data => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const filtered = useMemo(() => list.filter(v => {
    if (typeFilter && v.type !== typeFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q);
  }), [list, search, typeFilter]);

  function handleNew() {
    setEditing({ isNew: true });
    setForm(EMPTY_FORM);
  }

  function handleEdit(item) {
    setEditing(item);
    setForm({
      key: item.key,
      label: item.label,
      type: item.type,
      value: item.value,
      fallback: item.fallback || '',
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    });
  }

  function handleCancel() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.key.trim() || !form.label.trim()) {
      showToast('Schlüssel und Name sind erforderlich', 'error');
      return;
    }
    if (form.type === 'ARRAY') {
      try {
        JSON.parse(form.value || '[]');
      } catch (e) {
        showToast('Wert muss gültiges JSON-Array sein', 'error');
        return;
      }
    }
    setIsSaving(true);
    try {
      const isNew = editing?.isNew;
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew
        ? { ...form, key: form.key.trim(), label: form.label.trim() }
        : { id: editing.id, ...form, key: form.key.trim(), label: form.label.trim() };
      const res = await fetch('/api/global-variables', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Unbekannter Fehler');
      }
      showToast(`"${form.label.trim()}" gespeichert`, 'success');
      loadList();
      handleCancel();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(item) {
    try {
      const res = await fetch('/api/global-variables', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
      });
      if (!res.ok) throw new Error('Fehler beim Aktualisieren');
      loadList();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`"${item.label}" wirklich löschen?`)) return;
    try {
      const res = await fetch('/api/global-variables', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) throw new Error('Fehler beim Löschen');
      showToast(`"${item.label}" gelöscht`, 'success');
      if (editing && editing.id === item.id) handleCancel();
      loadList();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }

  function copyPlaceholder(key) {
    const text = `{{global.${key}}}`;
    navigator.clipboard?.writeText(text).then(
      () => showToast(`${text} kopiert`, 'success'),
      () => showToast('Kopieren fehlgeschlagen', 'error')
    );
  }

  return (
    <div className="nav-view">
      <div className="nav-body">
        {/* ── Left: List + search/filter ──────────────────────────────────── */}
        <div className="nav-list-panel gv-list-panel">
          <div className="nav-list-header">
            <h3 className="nav-list-title">Globale Variablen</h3>
            <button className="btn-icon-label" onClick={handleNew} title="Neue globale Variable erstellen">
              <Plus size={15} /> Neu
            </button>
          </div>
          <div className="gv-filter-row">
            <input
              type="text"
              className="blog-form-input"
              placeholder="Suche nach Key oder Name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select className="blog-form-select gv-type-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">Alle Typen</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {isLoading && !editing ? (
            <div className="nav-empty-hint">Lädt…</div>
          ) : filtered.length === 0 ? (
            <div className="nav-empty-hint">
              Keine globalen Variablen gefunden.<br />
              <button className="nav-empty-cta" onClick={handleNew}>Erste Variable erstellen</button>
            </div>
          ) : (
            <ul className="nav-template-list">
              {filtered.map(item => (
                <li
                  key={item.id}
                  className={`nav-template-card ${editing?.id === item.id ? 'selected' : ''} ${item.isActive ? 'is-active' : ''}`}
                >
                  <div className="nav-card-info">
                    <div className="gv-card-title-row">
                      <span className="nav-card-name">{item.label}</span>
                      {item.isActive && (
                        <span className="nav-active-badge">
                          <Check size={11} /> Aktiv
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="gv-key-chip"
                      onClick={() => copyPlaceholder(item.key)}
                      title="Platzhalter kopieren"
                    >
                      <Copy size={10} /> {`{{global.${item.key}}}`}
                    </button>
                  </div>
                  <div className="nav-card-actions">
                    <button
                      className={`nav-card-btn activate ${item.isActive ? 'deactivate' : ''}`}
                      onClick={() => handleToggleActive(item)}
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

        {/* ── Right: Form panel ───────────────────────────────────────────── */}
        {editing ? (
          <div className="nav-editor-panel">
            <div className="nav-editor-header">
              <div className="gv-form-heading">
                <strong>{editing.isNew ? 'Neue globale Variable' : (form.label || 'Variable bearbeiten')}</strong>
                {!editing.isNew && form.key && <code>{`{{global.${form.key}}}`}</code>}
              </div>
              <div className="nav-editor-actions">
                <button className="nav-card-btn" onClick={handleCancel} title="Abbrechen">
                  <X size={14} /> Abbrechen
                </button>
                <button className="nav-card-btn save" onClick={handleSave} disabled={isSaving} title="Speichern">
                  <Check size={14} /> {isSaving ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </div>

            <div className="gv-form-body">
              <div className="blog-form-row">
                <div className="blog-form-field">
                  <label className="blog-form-label">
                    Name / Label <span className="blog-form-label__required">*</span>
                  </label>
                  <input
                    className="blog-form-input"
                    type="text"
                    value={form.label}
                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="z. B. Seitentitel"
                    autoFocus
                  />
                </div>
                <div className="blog-form-field">
                  <label className="blog-form-label">
                    Schlüssel / Key <span className="blog-form-label__required">*</span>
                  </label>
                  <input
                    className="blog-form-input"
                    type="text"
                    value={form.key}
                    onChange={e => setForm(f => ({ ...f, key: e.target.value }))}
                    placeholder="z. B. pageTitle"
                    style={{ fontFamily: 'Fira Code, monospace', fontSize: 13 }}
                  />
                </div>
              </div>

              <div className="blog-form-row">
                <div className="blog-form-field">
                  <label className="blog-form-label">Typ</label>
                  <select className="blog-form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="blog-form-field">
                  <label className="blog-form-label">Sortierung</label>
                  <input
                    className="blog-form-input"
                    type="number"
                    value={form.sortOrder}
                    onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div className="blog-form-field">
                <label className="blog-form-label">
                  Wert
                  {form.type === 'ARRAY' && <span className="blog-form-label__hint">JSON-Array</span>}
                </label>
                <textarea
                  className="blog-form-textarea"
                  rows={form.type === 'HTML' || form.type === 'ARRAY' ? 6 : 2}
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                />
                {form.type === 'ARRAY' && (
                  <div className="blog-form-hint">z. B. [{'{'}"label":"Impressum","url":"/impressum"{'}'}]</div>
                )}
              </div>

              <div className="blog-form-field">
                <label className="blog-form-label">
                  Fallback
                  <span className="blog-form-label__hint">optional, greift wenn Wert leer ist</span>
                </label>
                <input
                  className="blog-form-input"
                  type="text"
                  value={form.fallback}
                  onChange={e => setForm(f => ({ ...f, fallback: e.target.value }))}
                />
              </div>

              <div className="blog-form-field">
                <label className="gv-checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  />
                  Aktiv — wird beim Rendern berücksichtigt
                </label>
              </div>

              {form.key && (
                <div className="nav-placeholder-ref">
                  <strong>Platzhalter:</strong> <code>{`{{global.${form.key}}}`}</code>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="nav-editor-panel nav-editor-empty">
            <Tag size={40} strokeWidth={1} />
            <p>Globale Variable aus der Liste wählen oder eine neue erstellen.</p>
            <p className="nav-editor-empty-hint">
              Verfügbar in Block-, Navigations- und Footer-Templates via <code>{`{{global.<key>}}`}</code>.
            </p>
          </div>
        )}
      </div>

      <style jsx>{`
        .gv-list-panel {
          width: 340px;
        }
        .gv-filter-row {
          display: flex;
          gap: 0.5rem;
          padding: 0 0.75rem 0.6rem;
        }
        .gv-filter-row .blog-form-input {
          flex: 1;
        }
        .gv-type-select {
          flex-shrink: 0;
          width: 118px;
        }
        .gv-card-title-row {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .gv-key-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          width: fit-content;
          max-width: 100%;
          padding: 0.1rem 0.4rem;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          background: var(--bg-tertiary);
          color: var(--text-tertiary);
          font-family: 'Fira Code', monospace;
          font-size: 0.7rem;
          cursor: pointer;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .gv-key-chip:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }
        .gv-form-heading {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          min-width: 0;
          overflow: hidden;
        }
        .gv-form-heading strong {
          font-size: 0.92rem;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .gv-form-heading code {
          font-size: 0.72rem;
          color: var(--text-tertiary);
        }
        .gv-form-body {
          padding: 1.1rem 1.25rem;
          max-width: 560px;
          overflow-y: auto;
        }
        .gv-checkbox-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: var(--text-primary);
          cursor: pointer;
        }
        .gv-checkbox-row input {
          width: 15px;
          height: 15px;
          accent-color: var(--accent-primary);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
