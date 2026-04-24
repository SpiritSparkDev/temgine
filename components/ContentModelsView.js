import React, { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Database, ChevronUp, ChevronDown, X, Save, Layers } from 'lucide-react'

const FIELD_TYPE_LABELS = {
  text: 'Text',
  textarea: 'Textarea',
  richtext: 'Richtext',
  number: 'Zahl',
  boolean: 'Ja/Nein',
  date: 'Datum',
  image: 'Bild',
  url: 'URL',
  email: 'E-Mail',
  slug: 'Slug',
  select: 'Auswahl',
  radio: 'Radio',
}

const FIELD_TYPE_COLORS = {
  text: '#6366f1',
  textarea: '#8b5cf6',
  richtext: '#a855f7',
  number: '#f59e0b',
  boolean: '#10b981',
  date: '#06b6d4',
  image: '#ec4899',
  url: '#3b82f6',
  email: '#14b8a6',
  slug: '#64748b',
  select: '#f97316',
  radio: '#ef4444',
}

export default function ContentModelsView({ showToast }) {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [fields, setFields] = useState([])
  const [isEditing, setIsEditing] = useState(false)

  // fallback showToast
  const _showToast = showToast || ((msg, type) => { console.log('Toast:', type, msg) })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/content-types')
      const data = await res.json()
      if (Array.isArray(data)) setTypes(data)
      else if (data && typeof data === 'object') setTypes([data])
      else setTypes([])
    } catch (e) {
      console.error(e)
      _showToast('Fehler beim Laden der Content-Modelle', 'error')
    } finally { setLoading(false) }
  }

  function handleNew() {
    setSelectedIndex(null)
    setName('')
    setSlug('')
    setFields([])
    setIsEditing(true)
  }

  const slugify = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')

  const createEmptyField = () => ({
    name: '',
    key: '',
    type: 'text',
    required: false,
    default: '',
    options: []
  })

  async function handleEdit(index) {
    try {
      const t = types[index]
      if (!t) return
      setSelectedIndex(index)
      setName(t.name || '')
      setSlug(t.slug || '')
      setFields(Array.isArray(t.fields) ? t.fields.map((f) => ({
        name: f?.name || '',
        key: f?.key || '',
        type: f?.type || 'text',
        required: Boolean(f?.required),
        default: f?.default ?? '',
        options: Array.isArray(f?.options) ? f.options : [],
      })) : [])
      setIsEditing(true)
    } catch (e) {
      console.error(e)
      _showToast('Fehler beim Laden des Modells', 'error')
    }
  }

  function updateField(index, patch) {
    setFields((prev) => prev.map((f, i) => i === index ? { ...f, ...patch } : f))
  }

  function addField() {
    setFields((prev) => [...prev, createEmptyField()])
  }

  function removeField(index) {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  function moveField(index, direction) {
    setFields((prev) => {
      const copy = [...prev]
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= copy.length) return prev
      const tmp = copy[index]
      copy[index] = copy[target]
      copy[target] = tmp
      return copy
    })
  }

  async function handleSave() {
    try {
      const trimmedName = name.trim()
      const trimmedSlug = slugify(slug)

      if (!trimmedName) {
        _showToast('Model-Name ist erforderlich', 'error')
        return
      }
      if (!trimmedSlug) {
        _showToast('Slug ist erforderlich', 'error')
        return
      }

      const normalizedFields = fields.map((f, idx) => {
        const fieldName = String(f.name || '').trim()
        const fieldKey = slugify(f.key || fieldName)
        const fieldType = String(f.type || 'text')

        if (!fieldName) throw new Error(`Feld ${idx + 1}: Name fehlt`)
        if (!fieldKey) throw new Error(`Feld ${idx + 1}: Key fehlt`)

        return {
          name: fieldName,
          key: fieldKey,
          type: fieldType,
          required: Boolean(f.required),
          default: f.default ?? '',
          options: fieldType === 'select' || fieldType === 'radio'
            ? (Array.isArray(f.options) ? f.options.filter(Boolean) : [])
            : [],
        }
      })

      const duplicateKeys = normalizedFields
        .map((f) => f.key)
        .filter((k, i, arr) => arr.indexOf(k) !== i)

      if (duplicateKeys.length > 0) {
        _showToast(`Doppelte Feld-Keys: ${Array.from(new Set(duplicateKeys)).join(', ')}`, 'error')
        return
      }

      const payload = { name: trimmedName, slug: trimmedSlug, fields: normalizedFields }
      // if editing, include id
      if (selectedIndex !== null && types[selectedIndex]) payload.id = types[selectedIndex].id
      const res = await fetch('/api/content-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        let message = 'Save failed'
        try {
          const err = await res.json()
          message = err?.error || err?.message || message
        } catch (_) {}
        throw new Error(message)
      }
      _showToast('Content Model gespeichert', 'success')
      setIsEditing(false)
      load()
    } catch (e) {
      console.error('Save failed', e)
      _showToast(`Fehler beim Speichern des Modells: ${e.message || 'Unbekannter Fehler'}`, 'error')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Modell wirklich löschen?')) return
    try {
      const res = await fetch('/api/content-types', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) throw new Error('Delete failed')
      _showToast('Content Model gelöscht', 'success')
      load()
      setIsEditing(false)
    } catch (e) {
      console.error(e)
      _showToast('Fehler beim Löschen', 'error')
    }
  }

  return (
    <div className="cm-layout">
      {/* ── Sidebar ─────────────────────────────────── */}
      <aside className="cm-sidebar">
        <div className="cm-sidebar-header">
          <div className="cm-sidebar-title">
            <Database size={16} />
            <span>Content Models</span>
          </div>
          <button className="cm-icon-btn" onClick={handleNew} title="Neues Modell">
            <Plus size={16} />
          </button>
        </div>

        <div className="cm-list">
          {loading ? (
            <div className="cm-list-empty">Lade…</div>
          ) : types.length === 0 ? (
            <div className="cm-list-empty">
              <Layers size={32} strokeWidth={1} />
              <p>Noch keine Modelle vorhanden</p>
              <button className="cm-btn-primary" onClick={handleNew}>
                <Plus size={14} /> Modell erstellen
              </button>
            </div>
          ) : (
            types.map((t, i) => (
              <button
                key={t.id || t.slug || i}
                className={`cm-list-item ${selectedIndex === i && isEditing ? 'active' : ''}`}
                onClick={() => handleEdit(i)}
              >
                <div className="cm-list-item-dot" style={{ background: '#6366f1' }} />
                <div className="cm-list-item-info">
                  <span className="cm-list-item-name">{t.name}</span>
                  <span className="cm-list-item-slug">{t.slug}</span>
                </div>
                <div className="cm-list-item-meta">
                  <span className="cm-field-count">{(t.fields || []).length} Felder</span>
                  <button
                    className="cm-icon-btn-sm danger"
                    onClick={e => { e.stopPropagation(); handleDelete(t.id) }}
                    title="Löschen"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────── */}
      <main className="cm-main">
        {isEditing ? (
          <div className="cm-editor">
            {/* Header */}
            <div className="cm-editor-header">
              <div className="cm-editor-title-row">
                <input
                  className="cm-name-input"
                  placeholder="Model Name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                <div className="cm-header-actions">
                  <button className="cm-btn-ghost" onClick={() => setIsEditing(false)}>
                    <X size={14} /> Abbrechen
                  </button>
                  <button className="cm-btn-primary" onClick={handleSave}>
                    <Save size={14} /> Speichern
                  </button>
                </div>
              </div>
              <div className="cm-slug-row">
                <label className="cm-label">Slug</label>
                <input
                  className="cm-slug-input"
                  value={slug}
                  onChange={e => setSlug(slugify(e.target.value))}
                  placeholder="model-slug"
                />
              </div>
            </div>

            {/* Fields */}
            <div className="cm-fields-section">
              <div className="cm-fields-header">
                <span className="cm-section-label">Felder <span className="cm-field-badge">{fields.length}</span></span>
                <button className="cm-btn-secondary" onClick={addField}>
                  <Plus size={14} /> Feld hinzufügen
                </button>
              </div>

              {fields.length === 0 ? (
                <div className="cm-fields-empty">
                  <p>Noch keine Felder. Füge das erste Feld hinzu.</p>
                  <button className="cm-btn-ghost" onClick={addField}>
                    <Plus size={14} /> Erstes Feld anlegen
                  </button>
                </div>
              ) : (
                <div className="cm-fields-list">
                  {fields.map((field, idx) => (
                    <div key={`${idx}-${field.key || 'field'}`} className="cm-field-card">
                      <div className="cm-field-card-top">
                        <div
                          className="cm-field-type-dot"
                          style={{ background: FIELD_TYPE_COLORS[field.type] || '#6b7280' }}
                          title={FIELD_TYPE_LABELS[field.type] || field.type}
                        />
                        <input
                          className="cm-field-input"
                          placeholder="Feldname"
                          value={field.name}
                          onChange={e => {
                            const nextName = e.target.value
                            const nextKey = field.key ? field.key : slugify(nextName)
                            updateField(idx, { name: nextName, key: nextKey })
                          }}
                        />
                        <input
                          className="cm-field-input mono"
                          placeholder="key"
                          value={field.key}
                          onChange={e => updateField(idx, { key: slugify(e.target.value) })}
                        />
                        <select
                          className="cm-field-select"
                          value={field.type}
                          onChange={e => updateField(idx, { type: e.target.value })}
                        >
                          {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                        <label className="cm-required-toggle" title="Pflichtfeld">
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={e => updateField(idx, { required: e.target.checked })}
                          />
                          <span>Pflicht</span>
                        </label>
                        <div className="cm-field-order-btns">
                          <button
                            className="cm-icon-btn-sm"
                            onClick={() => moveField(idx, 'up')}
                            disabled={idx === 0}
                            title="Nach oben"
                          >
                            <ChevronUp size={13} />
                          </button>
                          <button
                            className="cm-icon-btn-sm"
                            onClick={() => moveField(idx, 'down')}
                            disabled={idx === fields.length - 1}
                            title="Nach unten"
                          >
                            <ChevronDown size={13} />
                          </button>
                          <button
                            className="cm-icon-btn-sm danger"
                            onClick={() => removeField(idx)}
                            title="Feld entfernen"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="cm-field-card-bottom">
                        <label className="cm-label">Default</label>
                        <input
                          className="cm-field-input flex1"
                          placeholder="Standardwert (optional)"
                          value={field.default || ''}
                          onChange={e => updateField(idx, { default: e.target.value })}
                        />
                        {(field.type === 'select' || field.type === 'radio') && (
                          <>
                            <label className="cm-label">Optionen</label>
                            <input
                              className="cm-field-input flex2"
                              placeholder="option-a, option-b, option-c"
                              value={(field.options || []).join(', ')}
                              onChange={e => updateField(idx, {
                                options: e.target.value.split(',').map(v => v.trim()).filter(Boolean)
                              })}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="cm-empty-state">
            <Database size={52} strokeWidth={1} style={{ opacity: 0.25 }} />
            <h3>Content Model auswählen</h3>
            <p>Wähle ein Modell aus der Liste oder erstelle ein neues.</p>
            <button className="cm-btn-primary" onClick={handleNew}>
              <Plus size={14} /> Neues Modell
            </button>
          </div>
        )}
      </main>

      <style jsx>{`
        .cm-layout {
          display: flex;
          height: 100%;
          overflow: hidden;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        /* ── Sidebar ── */
        .cm-sidebar {
          width: 260px;
          min-width: 220px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--border-color);
          background: var(--bg-secondary);
          overflow: hidden;
        }

        .cm-sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid var(--border-color);
          flex-shrink: 0;
        }

        .cm-sidebar-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .cm-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .cm-list-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 32px 16px;
          text-align: center;
          font-size: 0.85rem;
          opacity: 0.6;
        }

        .cm-list-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 9px 12px;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
          color: var(--text-primary);
          font-family: inherit;
        }

        .cm-list-item:hover {
          background: var(--hover-bg, rgba(99,102,241,0.06));
          border-color: var(--border-color);
        }

        .cm-list-item.active {
          background: rgba(99, 102, 241, 0.1);
          border-color: rgba(99, 102, 241, 0.35);
        }

        .cm-list-item-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .cm-list-item-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }

        .cm-list-item-name {
          font-weight: 600;
          font-size: 0.875rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cm-list-item-slug {
          font-size: 0.75rem;
          opacity: 0.5;
          font-family: 'SF Mono', 'Fira Code', monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cm-list-item-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .cm-field-count {
          font-size: 0.72rem;
          padding: 2px 7px;
          border-radius: 10px;
          background: rgba(99,102,241,0.12);
          color: #6366f1;
          font-weight: 600;
        }

        /* ── Main ── */
        .cm-main {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .cm-empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          text-align: center;
          padding: 40px;
          color: var(--text-primary);
        }

        .cm-empty-state h3 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .cm-empty-state p {
          margin: 0;
          font-size: 0.875rem;
          opacity: 0.55;
          max-width: 280px;
        }

        .cm-editor {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .cm-editor-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex-shrink: 0;
        }

        .cm-editor-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cm-name-input {
          flex: 1;
          padding: 8px 12px;
          font-size: 1rem;
          font-weight: 600;
          border: 1px solid var(--border-color);
          border-radius: 7px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: inherit;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .cm-name-input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }

        .cm-slug-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .cm-slug-input {
          padding: 5px 10px;
          font-size: 0.82rem;
          font-family: 'SF Mono', 'Fira Code', monospace;
          border: 1px solid var(--border-color);
          border-radius: 5px;
          background: var(--bg-primary);
          color: var(--text-primary);
          transition: border-color 0.15s;
          width: 220px;
        }

        .cm-slug-input:focus {
          outline: none;
          border-color: #6366f1;
        }

        .cm-header-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        /* ── Fields ── */
        .cm-fields-section {
          flex: 1;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
        }

        .cm-fields-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .cm-section-label {
          font-weight: 600;
          font-size: 0.875rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .cm-field-badge {
          background: rgba(99,102,241,0.12);
          color: #6366f1;
          font-size: 0.72rem;
          padding: 1px 7px;
          border-radius: 10px;
          font-weight: 700;
        }

        .cm-fields-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 32px;
          border: 2px dashed var(--border-color);
          border-radius: 10px;
          text-align: center;
          opacity: 0.6;
          font-size: 0.875rem;
        }

        .cm-fields-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .cm-field-card {
          border: 1px solid var(--border-color);
          border-radius: 9px;
          overflow: hidden;
          background: var(--bg-secondary);
          transition: border-color 0.15s;
        }

        .cm-field-card:hover {
          border-color: rgba(99,102,241,0.3);
        }

        .cm-field-card-top {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          flex-wrap: wrap;
        }

        .cm-field-card-bottom {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-top: 1px solid var(--border-color);
          background: var(--bg-primary);
          flex-wrap: wrap;
        }

        .cm-field-type-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .cm-field-input {
          padding: 6px 10px;
          font-size: 0.875rem;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: inherit;
          transition: border-color 0.15s;
          min-width: 0;
        }

        .cm-field-input:focus {
          outline: none;
          border-color: #6366f1;
        }

        .cm-field-input.mono {
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 0.8rem;
        }

        .cm-field-input.flex1 { flex: 1; }
        .cm-field-input.flex2 { flex: 2; }

        .cm-field-select {
          padding: 6px 10px;
          font-size: 0.875rem;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: inherit;
          cursor: pointer;
          transition: border-color 0.15s;
        }

        .cm-field-select:focus {
          outline: none;
          border-color: #6366f1;
        }

        .cm-required-toggle {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.8rem;
          cursor: pointer;
          white-space: nowrap;
          user-select: none;
        }

        .cm-required-toggle input[type="checkbox"] {
          width: 14px;
          height: 14px;
          cursor: pointer;
          accent-color: #6366f1;
        }

        .cm-field-order-btns {
          display: flex;
          gap: 4px;
          margin-left: auto;
          flex-shrink: 0;
        }

        /* ── Buttons ── */
        .cm-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          background: #6366f1;
          color: #fff;
          border: none;
          border-radius: 7px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          font-family: inherit;
        }

        .cm-btn-primary:hover { background: #4f46e5; }

        .cm-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
          border-radius: 7px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
        }

        .cm-btn-secondary:hover {
          border-color: #6366f1;
          background: rgba(99,102,241,0.07);
        }

        .cm-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          background: transparent;
          color: var(--text-primary);
          border: 1px solid transparent;
          border-radius: 7px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
        }

        .cm-btn-ghost:hover {
          background: var(--hover-bg, rgba(0,0,0,0.05));
          border-color: var(--border-color);
        }

        .cm-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
          color: var(--text-primary);
          transition: all 0.15s;
          flex-shrink: 0;
        }

        .cm-icon-btn:hover {
          background: rgba(99,102,241,0.1);
          border-color: rgba(99,102,241,0.3);
          color: #6366f1;
        }

        .cm-icon-btn-sm {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border: 1px solid transparent;
          border-radius: 5px;
          background: transparent;
          cursor: pointer;
          color: var(--text-primary);
          transition: all 0.15s;
        }

        .cm-icon-btn-sm:hover {
          background: rgba(99,102,241,0.1);
          color: #6366f1;
        }

        .cm-icon-btn-sm:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .cm-icon-btn-sm.danger:hover {
          background: rgba(239,68,68,0.1);
          color: #ef4444;
        }

        .cm-label {
          font-size: 0.8rem;
          font-weight: 500;
          opacity: 0.6;
          white-space: nowrap;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}
