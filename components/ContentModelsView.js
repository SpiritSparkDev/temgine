import React, { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Code } from 'lucide-react'

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
    <div className="editor-container">
      <div className="editor-sidebar">
        <div className="editor-header">
          <h2><Code size={18} /> Content Models</h2>
          <button className="icon-btn" onClick={handleNew} title="Neues Modell">
            <Plus size={18} />
          </button>
        </div>

        <div className="editor-list">
          {loading ? (
            <div className="empty-list-state">Lade...</div>
          ) : types.length === 0 ? (
            <div className="empty-list-state">Keine Content Models vorhanden</div>
          ) : (
            types.map((t, i) => (
              <div key={t.id || t.slug || i} className={`editor-list-item ${selectedIndex === i ? 'active' : ''}`}>
                <div className="editor-item-info" onClick={() => handleEdit(i)}>
                  <div className="editor-item-label">{t.name}</div>
                  <div className="editor-item-sub">{t.slug}</div>
                </div>
                <div className="editor-item-actions">
                  <button className="icon-btn-small" onClick={(e) => { e.stopPropagation(); handleEdit(i) }} title="Bearbeiten"><Edit2 size={14} /></button>
                  <button className="icon-btn-small delete" onClick={(e) => { e.stopPropagation(); handleDelete(t.id) }} title="Löschen"><Trash2 size={14} /></button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="editor-main">
        {isEditing ? (
          <>
            <div className="editor-toolbar">
              <input type="text" className="editor-name-input" placeholder="Model Name" value={name} onChange={e => setName(e.target.value)} />
              <div className="editor-toolbar-actions">
                <button className="btn-secondary" onClick={() => setIsEditing(false)}>Abbrechen</button>
                <button className="btn-primary" onClick={handleSave}>Speichern</button>
              </div>
            </div>

            <div style={{ padding: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 4 }}>Slug</label>
                <input type="text" value={slug} onChange={e => setSlug(slugify(e.target.value))} className="input-field" placeholder="slug" />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 0 }}>Felder</label>
                  <button type="button" className="btn-secondary" onClick={addField}>+ Feld</button>
                </div>

                {fields.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#666', border: '1px dashed #d0d4da', borderRadius: 8, padding: 12 }}>
                    Noch keine Felder. Mit "Feld" ein neues Feld anlegen.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {fields.map((field, idx) => (
                      <div key={`${idx}-${field.key || 'field'}`} style={{ border: '1px solid #e1e4ea', borderRadius: 8, padding: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px 90px', gap: 8, marginBottom: 8 }}>
                          <input
                            type="text"
                            className="input-field"
                            placeholder="Feldname"
                            value={field.name}
                            onChange={(e) => {
                              const nextName = e.target.value
                              const nextKey = field.key ? field.key : slugify(nextName)
                              updateField(idx, { name: nextName, key: nextKey })
                            }}
                          />
                          <input
                            type="text"
                            className="input-field"
                            placeholder="key"
                            value={field.key}
                            onChange={(e) => updateField(idx, { key: slugify(e.target.value) })}
                          />
                          <select
                            className="input-field"
                            value={field.type}
                            onChange={(e) => updateField(idx, { type: e.target.value })}
                          >
                            <option value="text">Text</option>
                            <option value="textarea">Textarea</option>
                            <option value="richtext">Richtext</option>
                            <option value="number">Number</option>
                            <option value="boolean">Boolean</option>
                            <option value="date">Date</option>
                            <option value="image">Image</option>
                            <option value="url">URL</option>
                            <option value="select">Select</option>
                            <option value="radio">Radio</option>
                          </select>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={Boolean(field.required)}
                              onChange={(e) => updateField(idx, { required: e.target.checked })}
                            />
                            Pflicht
                          </label>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
                          <input
                            type="text"
                            className="input-field"
                            placeholder="Default-Wert"
                            value={field.default || ''}
                            onChange={(e) => updateField(idx, { default: e.target.value })}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" className="icon-btn-small" onClick={() => moveField(idx, 'up')} disabled={idx === 0} title="Nach oben">↑</button>
                            <button type="button" className="icon-btn-small" onClick={() => moveField(idx, 'down')} disabled={idx === fields.length - 1} title="Nach unten">↓</button>
                            <button type="button" className="icon-btn-small delete" onClick={() => removeField(idx)} title="Feld entfernen">×</button>
                          </div>
                        </div>

                        {(field.type === 'select' || field.type === 'radio') && (
                          <div>
                            <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 4 }}>Optionen (Komma-getrennt)</label>
                            <input
                              type="text"
                              className="input-field"
                              value={(field.options || []).join(', ')}
                              onChange={(e) => updateField(idx, { options: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
                              placeholder="option-a, option-b"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12, color: '#444' }}>JSON-Vorschau</summary>
                  <textarea
                    rows={8}
                    className="textarea-field"
                    value={JSON.stringify(fields, null, 2)}
                    readOnly
                    style={{ marginTop: 8 }}
                  />
                </details>
              </div>
            </div>
          </>
        ) : (
          <div className="editor-empty-state">
            <Code size={48} strokeWidth={1} />
            <h3>Wähle ein Content Model</h3>
            <p>oder erstelle ein neues mit dem <Plus size={16} style={{ verticalAlign: 'middle' }} /> Button</p>
          </div>
        )}
      </div>
    </div>
  )
}
