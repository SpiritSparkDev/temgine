import React, { useState, useEffect } from 'react';
import { Type, FolderOpen, RefreshCw } from 'lucide-react';

export default function FontManagerView({ showToast }) {
  const [fonts, setFonts] = useState([]);
  const [disabledIds, setDisabledIds] = useState(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFonts();
  }, []);

  function loadFonts() {
    setLoading(true);
    fetch('/api/fonts')
      .then(r => r.json())
      .then(data => {
        const list = data.fonts || [];
        setFonts(list);
        setDisabledIds(new Set(list.filter(f => !f.enabled).map(f => f.id)));
      })
      .catch(() => showToast('Fehler beim Laden der Fonts', 'error'))
      .finally(() => setLoading(false));
  }

  function saveDisabled(nextSet) {
    fetch('/api/fonts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: [...nextSet] }),
    }).catch(err => showToast('Fehler beim Speichern: ' + err.message, 'error'));
  }

  function toggleEnabled(fontObj) {
    const next = new Set(disabledIds);
    if (next.has(fontObj.id)) {
      next.delete(fontObj.id);
    } else {
      next.add(fontObj.id);
    }
    setDisabledIds(next);
    setFonts(prev => prev.map(f => f.id === fontObj.id ? { ...f, enabled: !next.has(f.id) } : f));
    saveDisabled(next);
  }

  // Group fonts by directory (derived from href path)
  const grouped = {};
  for (const f of fonts) {
    const parts = f.href.replace('/uploads/', '').split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(f);
  }

  const extColor = {
    '.woff2': 'var(--accent-primary)',
    '.woff':  '#7c6fe0',
    '.ttf':   '#3a8fc4',
    '.otf':   '#3a9c60',
    '.eot':   '#9c6f3a',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Type size={18} />
          <strong style={{ fontSize: '15px' }}>Font Manager</strong>
        </div>
        <button
          className="icon-btn"
          onClick={loadFonts}
          title="Neu laden"
          disabled={loading}
          style={{ opacity: loading ? 0.5 : 1 }}
        >
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {fonts.length === 0 && !loading && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '200px', gap: 12, color: 'var(--text-tertiary)',
          }}>
            <Type size={48} strokeWidth={1} />
            <p style={{ margin: 0 }}>Keine Font-Dateien im Upload-Ordner gefunden</p>
            <p style={{ margin: 0, fontSize: '12px' }}>
              Unterstützte Formate: .woff2, .woff, .ttf, .otf, .eot
            </p>
          </div>
        )}

        {Object.keys(grouped).sort().map(dir => (
          <div key={dir} style={{ marginBottom: 24 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              marginBottom: 8, paddingBottom: 4,
              borderBottom: '1px solid var(--border-color)',
            }}>
              <FolderOpen size={12} />
              {dir === '/' ? 'uploads/' : `uploads/${dir}/`}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {grouped[dir].map(fontObj => {
                const enabled = !disabledIds.has(fontObj.id);
                const familyName = fontObj.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
                return (
                  <label
                    key={fontObj.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 6,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      opacity: enabled ? 1 : 0.45,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleEnabled(fontObj)}
                      style={{ flexShrink: 0, cursor: 'pointer', accentColor: 'var(--accent-primary)', width: 15, height: 15 }}
                      aria-label={`${fontObj.name} ${enabled ? 'deaktivieren' : 'aktivieren'}`}
                    />
                    {/* Ext badge */}
                    <span style={{
                      fontSize: '10px', fontWeight: 700,
                      background: extColor[fontObj.ext] || 'var(--bg-tertiary)',
                      color: '#fff', borderRadius: 3, padding: '1px 5px',
                      flexShrink: 0, letterSpacing: '0.03em',
                    }}>
                      {fontObj.ext.slice(1).toUpperCase()}
                    </span>
                    {/* File name + CSS family name */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{
                        fontSize: '13px', color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {fontObj.name}
                      </span>
                      <span
                        title={`font-family: "${familyName}"`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigator.clipboard?.writeText(`font-family: "${familyName}";`);
                        }}
                        style={{
                          fontSize: '11px', color: 'var(--text-tertiary)',
                          fontFamily: 'monospace',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          cursor: 'copy',
                        }}
                      >
                        font-family: &quot;{familyName}&quot;
                      </span>
                    </div>
                    {/* Enabled indicator */}
                    <span style={{
                      fontSize: '10px', fontWeight: 600,
                      color: enabled ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                      flexShrink: 0, minWidth: 52, textAlign: 'right',
                    }}>
                      {enabled ? 'aktiv' : 'inaktiv'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
