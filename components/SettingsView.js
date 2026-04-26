import React, { useState, useEffect } from 'react';

const AUTOSAVE_KEY = 'temphelix_autosave_enabled';

export default function SettingsView({ showToast }) {
  const [revisionRetentionDays, setRevisionRetentionDays] = useState('7');
  const [isSavingRetention, setIsSavingRetention] = useState(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(AUTOSAVE_KEY);
    if (stored !== null) setAutosaveEnabled(stored !== 'false');
  }, []);

  const handleAutosaveToggle = (enabled) => {
    setAutosaveEnabled(enabled);
    localStorage.setItem(AUTOSAVE_KEY, String(enabled));
    showToast(enabled ? 'Autospeichern aktiviert' : 'Autospeichern deaktiviert', 'success');
  };

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.revisionRetentionDays !== undefined) {
          setRevisionRetentionDays(data.revisionRetentionDays);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveRetention = async () => {
    const val = parseInt(revisionRetentionDays, 10);
    if (isNaN(val) || val < 0) {
      showToast('Bitte eine gültige Anzahl Tage eingeben (≥ 0)', 'error');
      return;
    }
    setIsSavingRetention(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'revisionRetentionDays', value: String(val) }),
      });
      if (res.ok) {
        showToast('Einstellung gespeichert', 'success');
      } else {
        const d = await res.json();
        showToast(d.error || 'Fehler beim Speichern', 'error');
      }
    } catch (e) {
      showToast('Fehler beim Speichern', 'error');
    } finally {
      setIsSavingRetention(false);
    }
  };

  return (
    <div className="admin-editor-area">
      <div className="settings-content" style={{ padding: '2rem', maxWidth: '800px' }}>
        <h2 style={{ marginBottom: '2rem' }}>Einstellungen</h2>
        
        <section style={{ marginBottom: '3rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Editor</h3>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)', maxWidth: '520px' }}>
            <div>
              <strong style={{ display: 'block', fontSize: '0.95rem' }}>Autospeichern</strong>
              <small style={{ color: 'var(--text-secondary)' }}>Änderungen werden automatisch nach 1,2 Sekunden gespeichert.</small>
            </div>
            <button
              type="button"
              onClick={() => handleAutosaveToggle(!autosaveEnabled)}
              style={{
                position: 'relative',
                width: '44px',
                height: '24px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                background: autosaveEnabled ? 'var(--accent-primary)' : 'var(--border-color)',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
              aria-checked={autosaveEnabled}
              role="switch"
              aria-label="Autospeichern ein-/ausschalten"
            >
              <span style={{
                position: 'absolute',
                top: '3px',
                left: autosaveEnabled ? '23px' : '3px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </button>
          </div>
        </section>

        <section>
          <h3 style={{ marginBottom: '1rem' }}>Versionierung</h3>
          <p style={{ marginBottom: '1.5rem', color: '#666' }}>
            Legt fest, wie viele Tage alte Seitenversionen gespeichert bleiben. Nach Ablauf der Frist werden ältere Versionen beim nächsten Speichern automatisch gelöscht. Setze den Wert auf <strong>0</strong>, um alle alten Versionen sofort zu löschen.
          </p>

          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Aufbewahrungsdauer (Tage)
              </label>
              <input
                type="number"
                min="0"
                value={revisionRetentionDays}
                onChange={e => setRevisionRetentionDays(e.target.value)}
                style={{
                  width: '120px',
                  padding: '0.6rem 0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '1rem',
                }}
              />
            </div>

            <button
              onClick={handleSaveRetention}
              disabled={isSavingRetention}
              style={{
                marginTop: '1.4rem',
                padding: '0.6rem 1.5rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isSavingRetention ? 'not-allowed' : 'pointer',
                opacity: isSavingRetention ? 0.6 : 1,
              }}
            >
              {isSavingRetention ? 'Speichern…' : 'Speichern'}
            </button>
          </div>

          <small style={{ color: '#6b7280' }}>
            Standard: 7 Tage. Versionen, die durch eine automatische Wiederherstellung entstanden sind, unterliegen ebenfalls dieser Frist.
          </small>
        </section>
      </div>
    </div>
  );
}
