import React, { useState } from 'react';

export default function SettingsView({ showToast }) {
  const [dbConnectionString, setDbConnectionString] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState(null);

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

    if (!confirm('Möchten Sie wirklich alle Daten von JSON nach PostgreSQL migrieren? Dies kann nicht rückgängig gemacht werden.')) {
      return;
    }

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
          <h3 style={{ marginBottom: '1rem' }}>Weitere Einstellungen</h3>
          <p style={{ color: '#666' }}>Weitere Konfigurationsoptionen folgen...</p>
        </section>
      </div>
    </div>
  );
}
