import React, { useState, useEffect } from 'react';

async function api(body) {
  const res = await fetch('/api/external-sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

/** Browser für eine externe Quelle; ausgewählte Dateien/Ordner werden nach targetFolder importiert. */
export default function ExternalImportModal({ sources, targetFolder, onClose, onDone, showToast }) {
  const [sourceId, setSourceId] = useState(sources[0]?.id);
  const [cwd, setCwd] = useState('');
  const [entries, setEntries] = useState([]);
  const [sel, setSel] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setBusy(true); setError(''); setSel({});
    api({ action: 'list', sourceId, path: cwd }).then((d) => {
      if (d.ok) setEntries(d.entries); else { setEntries([]); setError(d.error || 'Fehler'); }
    }).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, [sourceId, cwd]);

  const rel = (e) => (cwd ? `${cwd}/${e.name}` : e.name);
  const chosen = entries.filter((e) => sel[e.name]);
  const crumbs = cwd ? cwd.split('/') : [];

  const doImport = async () => {
    setBusy(true);
    const d = await api({
      action: 'import', sourceId, targetFolder,
      items: chosen.map((e) => ({ path: rel(e), isDir: e.isDir, size: e.size })),
    }).catch((e) => ({ error: e.message }));
    setBusy(false);
    if (d.error || d.ok === false) return setError(d.error);
    const problems = [...d.skipped, ...d.errors];
    showToast(`${d.imported} Datei(en) importiert${problems.length ? `, ${problems.length} Problem(e): ${problems.slice(0, 3).join('; ')}` : ''}`, problems.length ? 'warning' : 'success');
    onDone();
    if (!problems.length) onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'grid', placeItems: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: 20, width: 'min(640px, 94vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 10 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Von externer Quelle importieren</h3>
        <small>Ziel: uploads/{targetFolder || ''}</small>
        <select className="st-input" value={sourceId} onChange={(e) => { setSourceId(e.target.value); setCwd(''); }}>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div>
          <button type="button" className="st-btn" onClick={() => setCwd('')}>/</button>
          {crumbs.map((c, i) => <button key={i} type="button" className="st-btn" onClick={() => setCwd(crumbs.slice(0, i + 1).join('/'))}>{c}</button>)}
        </div>
        <div style={{ overflow: 'auto', flex: 1, border: '1px solid var(--border-color)', borderRadius: 6, minHeight: 160 }}>
          {busy && <p style={{ padding: 8 }}>Lade…</p>}
          {error && <p style={{ padding: 8, color: '#b91c1c' }}>⚠ {error}</p>}
          {!busy && !error && !entries.length && <p style={{ padding: 8 }}>Leer</p>}
          {entries.map((e) => (
            <div key={e.name} style={{ display: 'flex', gap: 8, padding: '4px 8px', alignItems: 'center' }}>
              <input type="checkbox" checked={!!sel[e.name]} onChange={(ev) => setSel({ ...sel, [e.name]: ev.target.checked })} />
              {e.isDir
                ? <button type="button" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit' }} onClick={() => setCwd(rel(e))}>📁 {e.name}</button>
                : <span>{e.name} <small>({Math.round(e.size / 1024)} KB)</small></span>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Schließen</button>
          <button type="button" className="btn-primary" disabled={busy || !chosen.length} onClick={doImport}>{chosen.length} importieren</button>
        </div>
      </div>
    </div>
  );
}
