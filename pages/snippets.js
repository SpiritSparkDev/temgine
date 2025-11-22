import React, { useState, useEffect } from 'react';


export default function SnippetEditor() {
  const [snippets, setSnippets] = useState([]);
  const [open, setOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editSnippet, setEditSnippet] = useState('');

  useEffect(() => {
    fetch('/api/snippets')
      .then(r => r.json())
      .then(setSnippets)
      .catch(() => setSnippets([]));
  }, []);

  function handleEdit(idx) {
    setEditIndex(idx);
    setEditLabel(snippets[idx]?.label || '');
    setEditSnippet(snippets[idx]?.snippet || '');
    setOpen(true);
  }

  function persist(newSnippets) {
    fetch('/api/snippets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSnippets)
    }).catch(() => {/* ignore network errors for now */});
  }

  function handleSave() {
    const newSnippets = [...snippets];
    newSnippets[editIndex] = { label: editLabel, snippet: editSnippet };
    setSnippets(newSnippets);
    setOpen(false);
    setEditIndex(null);
    persist(newSnippets);
  }

  function handleDelete(idx) {
    const newSnippets = snippets.filter((_, i) => i !== idx);
    setSnippets(newSnippets);
    persist(newSnippets);
  }

  function handleAdd() {
    setEditIndex(snippets.length);
    setEditLabel('');
    setEditSnippet('');
    setOpen(true);
  }

  return (
    <div className="snippets-page">
      <h1>Code Snippet Editor</h1>
      <div className="toolbar">
        <button className="primary" onClick={handleAdd}>Neues Snippet hinzufügen</button>
      </div>

      <ul className="snippet-list">
        {snippets.map((s, idx) => (
          <li key={idx} className="snippet-item">
            <div className="snippet-meta">
              <strong>{s.label}</strong>
              <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13 }}>{s.snippet}</div>
            </div>
            <div className="snippet-actions">
              <button className="icon-btn edit" onClick={() => handleEdit(idx)}>Bearbeiten</button>
              <button className="icon-btn delete" onClick={() => handleDelete(idx)}>Löschen</button>
            </div>
          </li>
        ))}
      </ul>

      {open && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h3>Snippet bearbeiten</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <input type="text" placeholder="Label" value={editLabel} onChange={e => setEditLabel(e.target.value)} />
              <textarea rows={6} placeholder="Snippet" value={editSnippet} onChange={e => setEditSnippet(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button onClick={() => setOpen(false)}>Abbrechen</button>
              <button className="primary" onClick={handleSave}>Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
