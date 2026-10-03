import React, { useState, useCallback } from 'react';
import Toast from './Toast';

const cardStyle = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '1rem 1.25rem',
  marginBottom: '1rem',
};

const occurrenceRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
  flexWrap: 'wrap',
  padding: '0.5rem 0',
  borderTop: '1px solid var(--border-color)',
};

const inputStyle = {
  padding: '0.4rem 0.6rem',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  fontSize: '0.85rem',
  minWidth: '160px',
};

function occKey(occ) {
  return `${occ.topLevelId}::${occ.path.join('.')}`;
}

export default function RepairView() {
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [slugInputs, setSlugInputs] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const runScan = useCallback(async () => {
    setScanning(true);
    setScanError('');
    try {
      const res = await fetch('/api/repair/scan');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan fehlgeschlagen');
      setScanResult(data);
    } catch (e) {
      setScanError(e.message || 'Scan fehlgeschlagen');
    } finally {
      setScanning(false);
    }
  }, []);

  const applyFix = async (payload, key) => {
    setBusyKey(key);
    try {
      const res = await fetch('/api/repair/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reparatur fehlgeschlagen');
      showToast(`Gespeichert: ${payload.type === 'slug' ? `neuer Slug "${data.newValue}"` : 'neue ID vergeben'}`, 'success');
      await runScan();
    } catch (e) {
      showToast(e.message || 'Reparatur fehlgeschlagen', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const fixSlug = (occ, group) => {
    const key = occKey(occ);
    const value = (slugInputs[key] || '').trim();
    if (!value) {
      showToast('Bitte einen neuen Slug eingeben', 'error');
      return;
    }
    applyFix({ type: 'slug', topLevelId: occ.topLevelId, path: occ.path, newValue: value }, key);
  };

  const fixId = (occ) => {
    const key = occKey(occ);
    applyFix({ type: 'id', topLevelId: occ.topLevelId, path: occ.path }, key);
  };

  const hasProblems = scanResult && (
    scanResult.duplicateSlugs.length > 0 ||
    scanResult.duplicateIds.length > 0 ||
    scanResult.missingIds.length > 0
  );

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>Reparatur-Werkzeug</h1>
        <a href="/admin" style={{ fontSize: '0.85rem' }}>← Zurück zum Admin-Bereich</a>
      </div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
        Prüft den Seitenbaum auf Datenintegritätsprobleme, die das normale Speichern blockieren können
        (z.&nbsp;B. <code>„Slug(s) mehrfach vergeben"</code>), und behebt sie gezielt — ohne dass dafür
        der gesamte Seitenbaum über den Editor neu gespeichert werden muss.
      </p>

      <button type="button" className="btn-modern" onClick={runScan} disabled={scanning}>
        {scanning ? 'Scanne…' : 'Seitenbaum scannen'}
      </button>

      {scanError && (
        <div style={{ marginTop: '1rem', color: '#ef4444' }}>{scanError}</div>
      )}

      {scanResult && (
        <div style={{ marginTop: '1.5rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Zuletzt gescannt: {new Date(scanResult.scannedAt).toLocaleString('de-DE')} ·{' '}
            {scanResult.totalTopLevelPages} Top-Level-Seiten geprüft
          </p>

          {!hasProblems && (
            <div style={{ ...cardStyle, borderColor: '#10b981', color: '#10b981' }}>
              ✓ Keine Probleme gefunden. Falls das Speichern trotzdem mit „Slug(s) mehrfach vergeben" fehlschlägt,
              liegt der Konflikt vermutlich bei zwei gleich benannten Seiten unter unterschiedlichen Elternseiten —
              das ist technisch kein Problem (unterschiedliche URLs) und muss nicht behoben werden.
            </div>
          )}

          {scanResult.missingIds.length > 0 && (
            <>
              <h3>Seiten ohne eigene ID ({scanResult.missingIds.length})</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Diese Seiten haben keine eigene id. Beim Speichern einer solchen Seite im Editor werden
                dadurch versehentlich ALLE anderen Geschwister-Seiten ohne eigene id mit demselben Inhalt
                überschrieben — das erzeugt frische Slug-Duplikate, selbst wenn der Baum direkt davor laut
                diesem Scan unauffällig war. Bitte jeder Seite hier eine eigene ID vergeben.
              </p>
              {scanResult.missingIds.map((occ) => {
                const key = occKey(occ);
                return (
                  <div key={key} style={{ ...cardStyle, ...occurrenceRowStyle, borderTop: 'none' }}>
                    <span style={{ flex: '1 1 320px', fontSize: '0.85rem' }}>
                      {occ.title || '(ohne Titel)'} (/{occ.slug}) — <span style={{ color: 'var(--text-secondary)' }}>{occ.breadcrumb}</span>
                    </span>
                    <button
                      type="button"
                      className="btn-modern-small"
                      disabled={busyKey === key}
                      onClick={() => fixId(occ)}
                    >
                      {busyKey === key ? 'Speichert…' : 'ID vergeben'}
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {scanResult.duplicateSlugs.length > 0 && (
            <>
              <h3>Doppelte Slugs unter derselben übergeordneten Seite ({scanResult.duplicateSlugs.length})</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Von jeder Gruppe ist nur die erste Seite über ihre URL erreichbar — die anderen sind für Besucher
                unsichtbar. Vergib für alle außer einer einen neuen, eindeutigen Slug.
              </p>
              {scanResult.duplicateSlugs.map((group) => (
                <div key={group.occurrences.map(occKey).join('|')} style={cardStyle}>
                  <strong>Slug „{group.slug}" — {group.occurrences.length}× vorhanden</strong>
                  {group.occurrences.map((occ) => {
                    const key = occKey(occ);
                    return (
                      <div key={key} style={occurrenceRowStyle}>
                        <span style={{ flex: '1 1 320px', fontSize: '0.85rem' }}>
                          {occ.title || '(ohne Titel)'} — <span style={{ color: 'var(--text-secondary)' }}>{occ.breadcrumb}</span>
                          {occ.isTopLevel && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>(Top-Level)</span>}
                        </span>
                        <input
                          type="text"
                          placeholder="neuer Slug"
                          style={inputStyle}
                          value={slugInputs[key] ?? ''}
                          onChange={(e) => setSlugInputs((s) => ({ ...s, [key]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn-modern-small"
                          disabled={busyKey === key}
                          onClick={() => fixSlug(occ, group)}
                        >
                          {busyKey === key ? 'Speichert…' : 'Umbenennen'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}

          {scanResult.duplicateIds.length > 0 && (
            <>
              <h3>Doppelte Seiten-IDs ({scanResult.duplicateIds.length})</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Dieselbe id taucht mehrfach im Baum auf — das ist immer ein Datenfehler, unabhängig davon, wo im Baum.
              </p>
              {scanResult.duplicateIds.map((group) => (
                <div key={group.id} style={cardStyle}>
                  <strong>id „{group.id}" — {group.occurrences.length}× vorhanden</strong>
                  {group.occurrences.map((occ) => {
                    const key = occKey(occ);
                    return (
                      <div key={key} style={occurrenceRowStyle}>
                        <span style={{ flex: '1 1 320px', fontSize: '0.85rem' }}>
                          {occ.title || '(ohne Titel)'} (/{occ.slug}) — <span style={{ color: 'var(--text-secondary)' }}>{occ.breadcrumb}</span>
                          {occ.isTopLevel && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>(Top-Level)</span>}
                        </span>
                        {occ.isTopLevel ? (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ID kann hier nicht geändert werden</span>
                        ) : (
                          <button
                            type="button"
                            className="btn-modern-small"
                            disabled={busyKey === key}
                            onClick={() => fixId(occ)}
                          >
                            {busyKey === key ? 'Speichert…' : 'Neue ID vergeben'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
