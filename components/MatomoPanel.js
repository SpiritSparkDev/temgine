import React, { useState, useEffect } from 'react';
import { isValidMatomoConfig } from '../lib/matomo';
import { COOKIE_CATALOG } from '../lib/cookieCatalog';

const labelStyle = { display: 'block', marginBottom: '0.4rem', fontWeight: 600 };
const inputStyle = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  boxSizing: 'border-box',
};

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        position: 'relative',
        width: '44px', height: '24px',
        borderRadius: '999px', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--accent-primary)' : 'var(--border-color)',
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: '3px',
        left: checked ? '23px' : '3px',
        width: '18px', height: '18px',
        borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

/**
 * Matomo als eigenständige, mit einem Schalter komplett an-/abkoppelbare
 * Integration — bewusst getrennt vom generischen Custom-JS-Manager, damit
 * "Matomo ausschalten" keine Code-Suche im JS-Manager erfordert, sondern
 * ein einziger Klick ist. Das Tracking-Script wird nur injiziert, wenn
 * sowohl dieser Schalter aktiv ist als auch die Kategorie "Statistik" im
 * Cookie-Consent zugestimmt wurde (siehe pages/_app.js::loadMatomoTracking).
 */
export default function MatomoPanel({ showToast }) {
  const [enabled, setEnabled] = useState(false);
  const [matomoUrl, setMatomoUrl] = useState('');
  const [siteId, setSiteId] = useState('');
  const [trackWithoutCookies, setTrackWithoutCookies] = useState(false);
  const [respectDnt, setRespectDnt] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setEnabled(data.matomo_enabled === 'true');
        setMatomoUrl(data.matomo_url || '');
        setSiteId(data.matomo_site_id || '');
        setTrackWithoutCookies(data.matomo_track_without_cookies === 'true');
        setRespectDnt(data.matomo_respect_dnt === 'true');
      })
      .catch(() => {});
  }, []);

  const configValid = isValidMatomoConfig({ matomoUrl, siteId });

  // Matomo läuft jetzt nativ, nicht mehr über den vom Cookie-Scanner
  // durchsuchten Custom-JS-Manager — ohne diesen Eintrag würde es aus dem
  // Cookie-Banner verschwinden, sobald jemand von "Matomo-Code selbst
  // eingefügt" auf diesen Schalter umstellt. Ein Fehler hier darf das
  // eigentliche Aktivieren aber nicht verhindern (siehe catch unten).
  const ensureMatomoListedInConsentBanner = async () => {
    try {
      const res = await fetch('/api/cookies');
      if (!res.ok) return;
      const data = await res.json();
      const services = Array.isArray(data.services) ? data.services : [];
      if (services.some((s) => s.id === 'matomo')) return;

      const catalogEntry = COOKIE_CATALOG.find((s) => s.id === 'matomo');
      if (!catalogEntry) return;

      const nonNecessary = services.filter((s) => s.category !== 'necessary');
      const nextServices = [...nonNecessary, {
        id: catalogEntry.id,
        name: catalogEntry.name,
        provider: catalogEntry.provider,
        category: catalogEntry.category,
        cookies: catalogEntry.cookies,
        privacyUrl: catalogEntry.privacyUrl || '',
        source: 'native',
      }];

      await fetch('/api/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services: nextServices }),
      });
    } catch (_e) {
      // Bester Versuch — siehe Kommentar oben.
    }
  };

  const handleSave = async (overrides = {}) => {
    const next = {
      enabled,
      matomoUrl,
      siteId,
      trackWithoutCookies,
      respectDnt,
      ...overrides,
    };
    if (next.enabled && !isValidMatomoConfig({ matomoUrl: next.matomoUrl, siteId: next.siteId })) {
      showToast('Bitte eine gültige Matomo-URL und numerische Site-ID angeben, bevor Matomo aktiviert wird.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const entries = [
        ['matomo_enabled', String(next.enabled)],
        ['matomo_url', next.matomoUrl],
        ['matomo_site_id', next.siteId],
        ['matomo_track_without_cookies', String(next.trackWithoutCookies)],
        ['matomo_respect_dnt', String(next.respectDnt)],
      ];
      for (const [key, value] of entries) {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: String(value || '') }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || 'Fehler beim Speichern');
        }
      }
      if (next.enabled) await ensureMatomoListedInConsentBanner();
      showToast(next.enabled ? 'Matomo aktiviert' : 'Matomo deaktiviert', 'success');
    } catch (e) {
      showToast(e.message || 'Fehler beim Speichern', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = (checked) => {
    setEnabled(checked);
    handleSave({ enabled: checked });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test-matomo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matomoUrl }),
      });
      const data = await res.json();
      setTestResult(data.ok
        ? { ok: true, message: `Server erreichbar (HTTP ${data.status})` }
        : { ok: false, message: data.error || 'Server nicht erreichbar' });
    } catch (e) {
      setTestResult({ ok: false, message: e.message || 'Test fehlgeschlagen' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section style={{ marginTop: '2.5rem' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>Matomo (Web-Analytics)</h3>
      <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
        Eigenständige Integration, getrennt vom Custom-JS-Manager — der Schalter unten schaltet das
        Tracking-Script sofort komplett an oder ab, ohne dass Code gesucht oder gelöscht werden muss.
        Wird zusätzlich durch die Cookie-Einwilligung (Kategorie „Statistik") gesteuert.
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
        border: '1px solid var(--border-color)', borderRadius: '6px', marginBottom: '1rem',
        background: enabled ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
      }}>
        <Toggle checked={enabled} onChange={handleToggleEnabled} disabled={isSaving} label="Matomo aktivieren/deaktivieren" />
        <div>
          <div style={{ fontWeight: 600 }}>{enabled ? 'Matomo ist aktiv' : 'Matomo ist deaktiviert'}</div>
          {enabled && !configValid && (
            <div style={{ fontSize: '0.8rem', color: '#b91c1c' }}>
              URL und Site-ID unten prüfen — Tracking läuft erst mit gültiger Konfiguration.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1rem', maxWidth: '520px' }}>
        <div>
          <label style={labelStyle}>Matomo-URL</label>
          <input
            type="url"
            value={matomoUrl}
            onChange={(e) => setMatomoUrl(e.target.value)}
            placeholder="https://analytics.example.com/"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Site-ID</label>
          <input
            type="text"
            inputMode="numeric"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            placeholder="1"
            style={{ ...inputStyle, maxWidth: '160px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Toggle checked={trackWithoutCookies} onChange={setTrackWithoutCookies} label="Cookieloses Tracking" />
          <div>
            <div style={{ fontWeight: 600 }}>Cookieloses Tracking</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Reduziert Consent-Pflicht, aber weniger präzise Wiedererkennung.</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Toggle checked={respectDnt} onChange={setRespectDnt} label="Do-Not-Track respektieren" />
          <div>
            <div style={{ fontWeight: 600 }}>„Do Not Track"-Browsereinstellung respektieren</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleSave()}
            disabled={isSaving}
            style={{
              padding: '0.6rem 1.5rem',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            {isSaving ? 'Speichern…' : 'Speichern'}
          </button>

          <button
            onClick={handleTestConnection}
            disabled={isTesting || !matomoUrl}
            style={{
              padding: '0.6rem 1.5rem',
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              cursor: (isTesting || !matomoUrl) ? 'not-allowed' : 'pointer',
              opacity: (isTesting || !matomoUrl) ? 0.6 : 1,
            }}
          >
            {isTesting ? 'Teste…' : 'Verbindung testen'}
          </button>

          {testResult && (
            <span style={{ fontSize: '0.85rem', color: testResult.ok ? '#15803d' : '#b91c1c' }}>
              {testResult.ok ? '✓' : '⚠'} {testResult.message}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
