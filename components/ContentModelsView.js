import React, { useEffect, useState } from 'react'

export default function ContentModelsView() {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newFieldsJson, setNewFieldsJson] = useState('[]')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/content-types')
      const data = await res.json()
      // normalize to array
      if (Array.isArray(data)) setTypes(data)
      else if (data && typeof data === 'object') setTypes([data])
      else setTypes([])
    } catch (e) {
      console.error(e)
    } finally { setLoading(false) }
  }

  async function createType() {
    try {
      const fields = JSON.parse(newFieldsJson || '[]')
      await fetch('/api/content-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, slug: newSlug, fields }) })
      setNewName(''); setNewSlug(''); setNewFieldsJson('[]')
      load()
    } catch (e) { console.error('Create failed', e) }
  }

  async function del(id) {
    if (!confirm('Delete?')) return
    await fetch('/api/content-types', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Content Types</h2>
      {loading ? <div>Loading...</div> : (
        <ul>
          {(Array.isArray(types) ? types : []).map(t => (
            <li key={t.id}>
              <strong>{t.name}</strong> ({t.slug}) — fields: {t.fields?.length || 0}{' '}
              <button onClick={() => del(t.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}

      <h3>Create New</h3>
      <div>
        <input placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
        <input placeholder="Slug" value={newSlug} onChange={e => setNewSlug(e.target.value)} />
      </div>
      <div>
        <textarea rows={6} cols={60} value={newFieldsJson} onChange={e => setNewFieldsJson(e.target.value)} />
        <div style={{ fontSize: 12, color: '#666' }}>Fields JSON example: {'[{"name":"Title","key":"title","type":"text","required":true}]'}</div>
      </div>
      <button onClick={createType}>Create</button>
    </div>
  )
}
