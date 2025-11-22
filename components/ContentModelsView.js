import React, { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Code } from 'lucide-react'

export default function ContentModelsView({ showToast }) {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [fieldsJson, setFieldsJson] = useState('[]')
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
    setFieldsJson('[]')
    setIsEditing(true)
  }

  async function handleEdit(index) {
    try {
      const t = types[index]
      if (!t) return
      setSelectedIndex(index)
      setName(t.name || '')
      setSlug(t.slug || '')
      setFieldsJson(JSON.stringify(t.fields || [], null, 2))
      setIsEditing(true)
    } catch (e) {
      console.error(e)
      _showToast('Fehler beim Laden des Modells', 'error')
    }
  }

  async function handleSave() {
    try {
      const parsed = JSON.parse(fieldsJson || '[]')
      const payload = { name: name.trim(), slug: slug.trim(), fields: parsed }
      // if editing, include id
      if (selectedIndex !== null && types[selectedIndex]) payload.id = types[selectedIndex].id
      const res = await fetch('/api/content-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error('Save failed')
      _showToast('Content Model gespeichert', 'success')
      setIsEditing(false)
      load()
    } catch (e) {
      console.error('Save failed', e)
      _showToast('Fehler beim Speichern des Modells', 'error')
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
                <input type="text" value={slug} onChange={e => setSlug(e.target.value)} className="input-field" placeholder="slug" />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 4 }}>Fields (JSON)</label>
                <textarea rows={10} className="textarea-field" value={fieldsJson} onChange={e => setFieldsJson(e.target.value)} />
                <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Beispiel: [{`{"name":"Title","key":"title","type":"text","required":true}`}]</div>
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
