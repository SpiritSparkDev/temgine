import React, { useState, useEffect } from 'react';

const AUTOSAVE_KEY = 'temphelix_autosave_enabled';

const labelStyle = { display: 'block', marginBottom: '0.4rem', fontWeight: 600 };
const inputStyleSettings = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  boxSizing: 'border-box',
};

export default function SettingsView({ showToast }) {
  // --- General tab state ---
  const [revisionRetentionDays, setRevisionRetentionDays] = useState('7');
  const [isSavingRetention, setIsSavingRetention] = useState(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [folderDragDropEnabled, setFolderDragDropEnabled] = useState(false);
  const [isSavingFolderDragDrop, setIsSavingFolderDragDrop] = useState(false);
  const [liveRenderMode, setLiveRenderMode] = useState('dynamic');
  const [isSavingLiveMode, setIsSavingLiveMode] = useState(false);
  const [isRenderingLive, setIsRenderingLive] = useState(false);
  const [liveRenderStatus, setLiveRenderStatus] = useState('');
  const [liveRenderLastAt, setLiveRenderLastAt] = useState('');
  const [liveRenderLastDurationMs, setLiveRenderLastDurationMs] = useState('');
  const [liveRenderLastRoutes, setLiveRenderLastRoutes] = useState('');
  const [liveRenderLastError, setLiveRenderLastError] = useState('');

  // --- SEO / Link-Vorschau defaults ---
  const [seoSiteName, setSeoSiteName] = useState('');
  const [seoDefaultDescription, setSeoDefaultDescription] = useState('');
  const [seoDefaultOgImage, setSeoDefaultOgImage] = useState('');
  const [seoTwitterHandle, setSeoTwitterHandle] = useState('');
  const [isSavingSeoDefaults, setIsSavingSeoDefaults] = useState(false);

  // --- SEO / Suchmaschinen & Struktur ---
  const [seoTitleTemplate, setSeoTitleTemplate] = useState('');
  const [seoOrganizationName, setSeoOrganizationName] = useState('');
  const [seoOrganizationLogo, setSeoOrganizationLogo] = useState('');
  const [seoGoogleVerification, setSeoGoogleVerification] = useState('');
  const [seoBingVerification, setSeoBingVerification] = useState('');
  const [seoIndexingEnabled, setSeoIndexingEnabled] = useState(true);
  const [seoRobotsExtraDisallow, setSeoRobotsExtraDisallow] = useState('');
  const [isSavingSeoAdvanced, setIsSavingSeoAdvanced] = useState(false);

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
        if (!data) return;
        if (data.revisionRetentionDays !== undefined) setRevisionRetentionDays(data.revisionRetentionDays);
        if (data.folderDragDropEnabled  !== undefined) setFolderDragDropEnabled(data.folderDragDropEnabled === 'true');
        if (data.liveRenderMode)            setLiveRenderMode(data.liveRenderMode);
        if (data.liveRenderLastStatus)      setLiveRenderStatus(data.liveRenderLastStatus);
        if (data.liveRenderLastAt)          setLiveRenderLastAt(data.liveRenderLastAt);
        if (data.liveRenderLastDurationMs)  setLiveRenderLastDurationMs(data.liveRenderLastDurationMs);
        if (data.liveRenderLastRoutes)      setLiveRenderLastRoutes(data.liveRenderLastRoutes);
        if (data.liveRenderLastError)       setLiveRenderLastError(data.liveRenderLastError);
        if (data.seo_site_name !== undefined)           setSeoSiteName(data.seo_site_name);
        if (data.seo_default_description !== undefined) setSeoDefaultDescription(data.seo_default_description);
        if (data.seo_default_og_image !== undefined)    setSeoDefaultOgImage(data.seo_default_og_image);
        if (data.seo_twitter_handle !== undefined)      setSeoTwitterHandle(data.seo_twitter_handle);
        if (data.seo_title_template !== undefined)             setSeoTitleTemplate(data.seo_title_template);
        if (data.seo_organization_name !== undefined)          setSeoOrganizationName(data.seo_organization_name);
        if (data.seo_organization_logo !== undefined)          setSeoOrganizationLogo(data.seo_organization_logo);
        if (data.seo_google_site_verification !== undefined)   setSeoGoogleVerification(data.seo_google_site_verification);
        if (data.seo_bing_site_verification !== undefined)     setSeoBingVerification(data.seo_bing_site_verification);
        if (data.seo_indexing_enabled !== undefined)            setSeoIndexingEnabled(data.seo_indexing_enabled !== 'false');
        if (data.seo_robots_txt_extra_disallow !== undefined)   setSeoRobotsExtraDisallow(data.seo_robots_txt_extra_disallow);
      })
      .catch(() => {});
  }, []);

  const handleSaveSeoAdvanced = async () => {
    setIsSavingSeoAdvanced(true);
    try {
      const entries = [
        ['seo_title_template', seoTitleTemplate],
        ['seo_organization_name', seoOrganizationName],
        ['seo_organization_logo', seoOrganizationLogo],
        ['seo_google_site_verification', seoGoogleVerification],
        ['seo_bing_site_verification', seoBingVerification],
        ['seo_indexing_enabled', String(seoIndexingEnabled)],
        ['seo_robots_txt_extra_disallow', seoRobotsExtraDisallow],
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
      showToast('SEO-Struktureinstellungen gespeichert', 'success');
    } catch (e) {
      showToast(e.message || 'Fehler beim Speichern', 'error');
    } finally {
      setIsSavingSeoAdvanced(false);
    }
  };

  const handleSaveSeoDefaults = async () => {
    setIsSavingSeoDefaults(true);
    try {
      const entries = [
        ['seo_site_name', seoSiteName],
        ['seo_default_description', seoDefaultDescription],
        ['seo_default_og_image', seoDefaultOgImage],
        ['seo_twitter_handle', seoTwitterHandle],
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
      showToast('SEO-Standardwerte gespeichert', 'success');
    } catch (e) {
      showToast(e.message || 'Fehler beim Speichern', 'error');
    } finally {
      setIsSavingSeoDefaults(false);
    }
  };

  const reloadLiveRenderSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const data = await res.json();
      if (data.liveRenderMode)            setLiveRenderMode(data.liveRenderMode);
      if (data.liveRenderLastStatus)      setLiveRenderStatus(data.liveRenderLastStatus);
      if (data.liveRenderLastAt)          setLiveRenderLastAt(data.liveRenderLastAt);
      if (data.liveRenderLastDurationMs)  setLiveRenderLastDurationMs(data.liveRenderLastDurationMs);
      if (data.liveRenderLastRoutes)      setLiveRenderLastRoutes(data.liveRenderLastRoutes);
      if (data.liveRenderLastError !== undefined) setLiveRenderLastError(data.liveRenderLastError || '');
    } catch (_e) {}
  };

  const handleSaveLiveMode = async (nextMode) => {
    console.log('[settings] save live mode requested', { nextMode });
    setIsSavingLiveMode(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'liveRenderMode', value: nextMode }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Fehler beim Speichern');
      }
      console.log('[settings] live mode saved', { nextMode, status: res.status });
      setLiveRenderMode(nextMode);
      showToast(`Live-Modus gespeichert: ${nextMode === 'static' ? 'Statisch' : 'Dynamisch'}`, 'success');
    } catch (e) {
      console.error('[settings] save live mode failed', e);
      showToast(e.message || 'Fehler beim Speichern', 'error');
    } finally {
      setIsSavingLiveMode(false);
    }
  };

  const handleRenderLiveNow = async () => {
    console.log('[settings] render live requested', {
      liveRenderMode,
      liveRenderStatus,
    });
    setIsRenderingLive(true);
    setLiveRenderStatus('running');
    setLiveRenderLastError('');
    try {
      const res = await fetch('/api/admin/render-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      console.log('[settings] render live response received', {
        ok: res.ok,
        status: res.status,
      });
      const data = await res.json();
      console.log('[settings] render live payload', {
        ok: data.ok,
        activatedMode: data.activatedMode,
        renderedRoutes: data.renderedRoutes,
        totalRoutes: data.totalRoutes,
        durationMs: data.durationMs,
        errorCount: Array.isArray(data.errors) ? data.errors.length : null,
      });
      if (!res.ok) {
        throw new Error(data.error || 'Render fehlgeschlagen');
      }
      showToast(`Live erfolgreich gerendert (${data.renderedRoutes || 0} Seiten)`, 'success');
      await reloadLiveRenderSettings();
    } catch (e) {
      console.error('[settings] render live failed', e);
      setLiveRenderStatus('error');
      setLiveRenderLastError(e.message || 'Render fehlgeschlagen');
      showToast(e.message || 'Render fehlgeschlagen', 'error');
    } finally {
      setIsRenderingLive(false);
    }
  };

  const handleSaveFolderDragDrop = async (enabled) => {
    setIsSavingFolderDragDrop(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'folderDragDropEnabled', value: String(enabled) }),
      });
      if (res.ok) {
        setFolderDragDropEnabled(enabled);
        showToast(enabled ? 'Drag-and-Drop für Ordner aktiviert' : 'Drag-and-Drop für Ordner deaktiviert', 'success');
      } else {
        const d = await res.json();
        showToast(d.error || 'Fehler beim Speichern', 'error');
      }
    } catch (_e) {
      showToast('Fehler beim Speichern', 'error');
    } finally {
      setIsSavingFolderDragDrop(false);
    }
  };

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

  // Reusable toggle button
  const Toggle = ({ checked, onChange, disabled, label }) => (
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


  return (
    <div className="admin-editor-area">
      <div className="settings-content" style={{ padding: '2rem', maxWidth: '800px' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Einstellungen</h2>

        <table style={{
              width: '100%', borderCollapse: 'collapse',
              marginBottom: '3rem',
              border: '1px solid var(--border-color)',
              borderRadius: '8px', overflow: 'hidden',
              fontSize: '0.9rem',
            }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', width: '140px' }}>Bereich</th>
                  <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Einstellung</th>
                  <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Beschreibung</th>
                  <th style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', width: '80px' }}>Aktiv</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-tertiary)', fontWeight: 500, verticalAlign: 'middle' }}>Editor</td>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 600, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>Autospeichern</td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Änderungen werden automatisch nach 1,2&nbsp;Sekunden gespeichert.
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'center', verticalAlign: 'middle' }}>
                    <Toggle
                      checked={autosaveEnabled}
                      onChange={handleAutosaveToggle}
                      label="Autospeichern ein-/ausschalten"
                    />
                  </td>
                </tr>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-tertiary)', fontWeight: 500, verticalAlign: 'middle' }}>Dateiupload</td>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 600, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>Ordner per Drag-and-Drop</td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Standardmäßig deaktiviert. Fehleranfällig, kann je nach Browser oder Dateistruktur unzuverlässig sein.
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'center', verticalAlign: 'middle' }}>
                    <Toggle
                      checked={folderDragDropEnabled}
                      onChange={handleSaveFolderDragDrop}
                      disabled={isSavingFolderDragDrop}
                      label="Ordner per Drag-and-Drop ein-/ausschalten"
                    />
                  </td>
                </tr>
              </tbody>
            </table>

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

            <section style={{ marginTop: '2.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>SEO — Standardwerte für die Link-Vorschau</h3>
              <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                Greift für jede Seite, die im SEO-Panel kein eigenes Meta-Bild/-Beschreibung hinterlegt hat —
                etwa die Startseite, 404-Seite oder vergessene Einzelseiten. So sieht jeder geteilte Link
                plausibel aus, auch ohne seitenspezifische Pflege.
              </p>

              <div style={{ display: 'grid', gap: '1rem', maxWidth: '520px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                    Website-Name
                  </label>
                  <input
                    type="text"
                    value={seoSiteName}
                    onChange={(e) => setSeoSiteName(e.target.value)}
                    placeholder="z. B. Meine Firma GmbH"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '4px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                    Standard Meta-Beschreibung
                  </label>
                  <textarea
                    value={seoDefaultDescription}
                    onChange={(e) => setSeoDefaultDescription(e.target.value)}
                    placeholder="Kurzbeschreibung, die verwendet wird, wenn eine Seite keine eigene hat"
                    rows={2}
                    style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                    Standard-Vorschaubild (Open Graph)
                  </label>
                  <input
                    type="url"
                    value={seoDefaultOgImage}
                    onChange={(e) => setSeoDefaultOgImage(e.target.value)}
                    placeholder="https://example.com/vorschaubild.jpg"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '4px', boxSizing: 'border-box' }}
                  />
                  <small style={{ color: 'var(--text-tertiary)' }}>
                    Empfohlen: 1200×630px (Seitenverhältnis 1.91:1) — so wird es auf Facebook, LinkedIn &amp; Co. nicht zugeschnitten.
                  </small>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                    X (Twitter) Handle
                  </label>
                  <input
                    type="text"
                    value={seoTwitterHandle}
                    onChange={(e) => setSeoTwitterHandle(e.target.value)}
                    placeholder="@firmenname"
                    style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '4px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <button
                    onClick={handleSaveSeoDefaults}
                    disabled={isSavingSeoDefaults}
                    style={{
                      padding: '0.6rem 1.5rem',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isSavingSeoDefaults ? 'not-allowed' : 'pointer',
                      opacity: isSavingSeoDefaults ? 0.6 : 1,
                    }}
                  >
                    {isSavingSeoDefaults ? 'Speichern…' : 'Speichern'}
                  </button>
                </div>
              </div>
            </section>

            <section style={{ marginTop: '2.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>SEO — Suchmaschinen &amp; Struktur</h3>
              <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                Wirkt sich auf <strong>alle</strong> Seiten aus: Titel-Vorlage, strukturierte Daten
                (Organization-Schema für Google) und die Sichtbarkeit für Suchmaschinen insgesamt.
              </p>

              <div style={{ display: 'grid', gap: '1rem', maxWidth: '520px' }}>
                <div>
                  <label style={labelStyle}>Titel-Vorlage</label>
                  <input
                    type="text"
                    value={seoTitleTemplate}
                    onChange={(e) => setSeoTitleTemplate(e.target.value)}
                    placeholder="%s – Meine Firma GmbH"
                    style={inputStyleSettings}
                  />
                  <small style={{ color: 'var(--text-tertiary)' }}>
                    <code>%s</code> wird durch den jeweiligen Seitentitel ersetzt. Leer lassen für
                    „Seitentitel – Website-Name".
                  </small>
                </div>

                <div>
                  <label style={labelStyle}>Organisationsname (für strukturierte Daten)</label>
                  <input
                    type="text"
                    value={seoOrganizationName}
                    onChange={(e) => setSeoOrganizationName(e.target.value)}
                    placeholder="z. B. Meine Firma GmbH"
                    style={inputStyleSettings}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Organisations-Logo (URL)</label>
                  <input
                    type="url"
                    value={seoOrganizationLogo}
                    onChange={(e) => setSeoOrganizationLogo(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    style={inputStyleSettings}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Google Search Console — Verifizierungscode</label>
                  <input
                    type="text"
                    value={seoGoogleVerification}
                    onChange={(e) => setSeoGoogleVerification(e.target.value)}
                    placeholder="Inhalt des content-Attributs, ohne <meta>-Tag"
                    style={inputStyleSettings}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Bing Webmaster Tools — Verifizierungscode</label>
                  <input
                    type="text"
                    value={seoBingVerification}
                    onChange={(e) => setSeoBingVerification(e.target.value)}
                    placeholder="Inhalt des content-Attributs, ohne <meta>-Tag"
                    style={inputStyleSettings}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Zusätzliche robots.txt Disallow-Pfade</label>
                  <textarea
                    value={seoRobotsExtraDisallow}
                    onChange={(e) => setSeoRobotsExtraDisallow(e.target.value)}
                    placeholder={'/intern\n/entwuerfe'}
                    rows={3}
                    style={{ ...inputStyleSettings, resize: 'vertical' }}
                  />
                  <small style={{ color: 'var(--text-tertiary)' }}>
                    Ein Pfad pro Zeile, ergänzt die Standard-Sperrliste (/admin, /api).
                  </small>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: seoIndexingEnabled ? 'transparent' : 'rgba(220, 38, 38, 0.08)' }}>
                  <Toggle
                    checked={!seoIndexingEnabled}
                    onChange={(checked) => setSeoIndexingEnabled(!checked)}
                    label="Indexierung durch Suchmaschinen global deaktivieren"
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>Indexierung global deaktivieren</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Für Staging/Test-Umgebungen: erzwingt <code>noindex, nofollow</code> auf allen Seiten
                      und <code>Disallow: /</code> in der robots.txt — unabhängig von den Einstellungen
                      einzelner Seiten.
                    </div>
                  </div>
                </div>

                <div>
                  <button
                    onClick={handleSaveSeoAdvanced}
                    disabled={isSavingSeoAdvanced}
                    style={{
                      padding: '0.6rem 1.5rem',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isSavingSeoAdvanced ? 'not-allowed' : 'pointer',
                      opacity: isSavingSeoAdvanced ? 0.6 : 1,
                    }}
                  >
                    {isSavingSeoAdvanced ? 'Speichern…' : 'Speichern'}
                  </button>
                </div>
              </div>
            </section>

            <section style={{ marginTop: '2.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Staging / Live-Auslieferung</h3>
              <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                Vorschau bleibt dynamisch über die Datenbank. Für eine ausfallsichere Live-Seite kannst du hier einen statischen Snapshot rendern.
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <label style={{ fontWeight: 600 }}>Live-Modus</label>
                <select
                  value={liveRenderMode}
                  onChange={(e) => handleSaveLiveMode(e.target.value)}
                  disabled={isSavingLiveMode}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="dynamic">Dynamisch (DB/API)</option>
                  <option value="static">Statisch (Snapshot)</option>
                </select>

                <button
                  onClick={handleRenderLiveNow}
                  disabled={isRenderingLive}
                  style={{
                    padding: '0.6rem 1.5rem',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: isRenderingLive ? 'not-allowed' : 'pointer',
                    opacity: isRenderingLive ? 0.6 : 1,
                  }}
                >
                  {isRenderingLive ? 'Rendere Live…' : 'Live jetzt rendern'}
                </button>
              </div>

              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <div>Status: <strong>{liveRenderStatus || 'n/a'}</strong></div>
                <div>Letzter Render: <strong>{liveRenderLastAt || 'n/a'}</strong></div>
                <div>Dauer: <strong>{liveRenderLastDurationMs ? `${liveRenderLastDurationMs} ms` : 'n/a'}</strong></div>
                <div>Gerenderte Seiten: <strong>{liveRenderLastRoutes || 'n/a'}</strong></div>
                {liveRenderLastError && (
                  <div style={{ color: '#b91c1c' }}>
                    Letzter Fehler: {liveRenderLastError}
                  </div>
                )}
              </div>

              <small style={{ color: 'var(--text-tertiary)', display: 'block', marginTop: '0.75rem' }}>
                Tipp: Mit <strong>?preview=1</strong> am Seiten-URL kannst du die dynamische Vorschau erzwingen.
              </small>
            </section>

      </div>
    </div>
  );
}
