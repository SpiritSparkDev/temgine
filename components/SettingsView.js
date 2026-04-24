import React, { useState, useEffect } from 'react';

export default function SettingsView({ showToast }) {
  const [dbConnectionString, setDbConnectionString] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [revisionRetentionDays, setRevisionRetentionDays] = useState('7');
  const [isSavingRetention, setIsSavingRetention] = useState(false);

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

  const handleTestConnection = async () => {
    if (!dbConnectionString.trim()) {
      showToast('Bitte geben Sie einen Connection String ein', 'error');
      return;
    }

    setIsTesting(true);
    try {
      const res = await fetch('/api/database/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: dbConnectionString }),
      });

      const data = await res.json();
      
      if (res.ok) {
        showToast('Datenbankverbindung erfolgreich!', 'success');
      } else {
        showToast(`Fehler: ${data.error}`, 'error');
      }
    } catch (error) {
      showToast('Verbindungsfehler: ' + error.message, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleMigrate = async () => {
    if (!dbConnectionString.trim()) {
      showToast('Bitte geben Sie einen Connection String ein', 'error');
      return;
    }

    // Bestätigung wird durch UI-Interaktion impliziert

    setIsMigrating(true);
    setMigrationStatus({ status: 'running', log: [] });

    try {
      const res = await fetch('/api/database/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: dbConnectionString }),
      });

      const data = await res.json();
      
      if (res.ok) {
        setMigrationStatus({ status: 'success', log: data.log });
        showToast('Migration erfolgreich abgeschlossen!', 'success');
      } else {
        setMigrationStatus({ status: 'error', log: data.log || [data.error] });
        showToast(`Migrationsfehler: ${data.error}`, 'error');
      }
    } catch (error) {
      setMigrationStatus({ status: 'error', log: [error.message] });
      showToast('Migrationsfehler: ' + error.message, 'error');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="admin-editor-area">
      <div className="settings-content" style={{ padding: '2rem', maxWidth: '800px' }}>
        <h2 style={{ marginBottom: '2rem' }}>Einstellungen</h2>
        
        <section style={{ marginBottom: '3rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Datenbank Migration</h3>
          <p style={{ marginBottom: '1.5rem', color: '#666' }}>
            Migrieren Sie Ihre Daten von JSON-Dateien zu PostgreSQL. Stellen Sie sicher, dass 
            Sie eine PostgreSQL-Datenbank eingerichtet haben.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              PostgreSQL Connection String
            </label>
            <input
              type="text"
              value={dbConnectionString}
              onChange={(e) => setDbConnectionString(e.target.value)}
              placeholder="postgresql://user:password@localhost:5432/database"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
              }}
            />
            <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
              Format: postgresql://username:password@host:port/database
            </small>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isTesting ? 'not-allowed' : 'pointer',
                opacity: isTesting ? 0.6 : 1,
              }}
            >
              {isTesting ? 'Teste...' : 'Verbindung testen'}
            </button>

            <button
              onClick={handleMigrate}
              disabled={isMigrating}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isMigrating ? 'not-allowed' : 'pointer',
                opacity: isMigrating ? 0.6 : 1,
              }}
            >
              {isMigrating ? 'Migriere...' : 'Migration starten'}
            </button>
          </div>

          {migrationStatus && (
            <div style={{
              padding: '1rem',
              background: migrationStatus.status === 'success' ? '#d1fae5' : '#fee2e2',
              border: `1px solid ${migrationStatus.status === 'success' ? '#10b981' : '#ef4444'}`,
              borderRadius: '4px',
            }}>
              <h4 style={{ marginBottom: '0.5rem' }}>
                {migrationStatus.status === 'success' ? '✓ Migration erfolgreich' : '✗ Migration fehlgeschlagen'}
              </h4>
              <div style={{ 
                fontFamily: 'monospace', 
                fontSize: '0.85rem',
                maxHeight: '300px',
                overflow: 'auto',
              }}>
                {migrationStatus.log.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          )}
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
