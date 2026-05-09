import React, { useState, useEffect, useMemo } from 'react';

const AUTOSAVE_KEY = 'temphelix_autosave_enabled';

// SMTP setting keys persisted in the DB
// Memoized field component to prevent re-renders
const Field = React.memo(({ label, children, style }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', ...style }}>
    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
    </label>
    {children}
  </div>
));

const SMTP_KEYS = [
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure',
  'contact_recipient_email', 'contact_sender_name',
  'contact_sender_email', 'contact_subject_prefix',
];

export default function SettingsView({ showToast }) {
  const [activeTab, setActiveTab] = useState('general');

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

  // --- Email & Forms tab state ---
  const [smtpHost, setSmtpHost]               = useState('');
  const [smtpPort, setSmtpPort]               = useState('587');
  const [smtpUser, setSmtpUser]               = useState('');
  const [smtpPass, setSmtpPass]               = useState('');
  const [smtpSecure, setSmtpSecure]           = useState(false);
  const [recipientEmail, setRecipientEmail]   = useState('');
  const [senderName, setSenderName]           = useState('');
  const [senderEmail, setSenderEmail]         = useState('');
  const [subjectPrefix, setSubjectPrefix]     = useState('[Kontakt]');
  const [isSavingSmtp, setIsSavingSmtp]       = useState(false);
  const [isSendingTest, setIsSendingTest]     = useState(false);
  const [smtpPassChanged, setSmtpPassChanged] = useState(false);

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
        // SMTP / email settings
        if (data.smtp_host)                 setSmtpHost(data.smtp_host);
        if (data.smtp_port)                 setSmtpPort(data.smtp_port);
        if (data.smtp_user)                 setSmtpUser(data.smtp_user);
        if (data.smtp_pass)                 setSmtpPass(data.smtp_pass);
        if (data.smtp_secure)               setSmtpSecure(data.smtp_secure === 'true');
        if (data.contact_recipient_email)   setRecipientEmail(data.contact_recipient_email);
        if (data.contact_sender_name)       setSenderName(data.contact_sender_name);
        if (data.contact_sender_email)      setSenderEmail(data.contact_sender_email);
        if (data.contact_subject_prefix)    setSubjectPrefix(data.contact_subject_prefix);
        if (data.liveRenderMode)            setLiveRenderMode(data.liveRenderMode);
        if (data.liveRenderLastStatus)      setLiveRenderStatus(data.liveRenderLastStatus);
        if (data.liveRenderLastAt)          setLiveRenderLastAt(data.liveRenderLastAt);
        if (data.liveRenderLastDurationMs)  setLiveRenderLastDurationMs(data.liveRenderLastDurationMs);
        if (data.liveRenderLastRoutes)      setLiveRenderLastRoutes(data.liveRenderLastRoutes);
        if (data.liveRenderLastError)       setLiveRenderLastError(data.liveRenderLastError);
      })
      .catch(() => {});
  }, []);

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

  const handleSaveSmtp = async () => {
    setIsSavingSmtp(true);
    const pairs = [
      ['smtp_host',                smtpHost],
      ['smtp_port',                smtpPort],
      ['smtp_user',                smtpUser],
      ['smtp_secure',              String(smtpSecure)],
      ['contact_recipient_email',  recipientEmail],
      ['contact_sender_name',      senderName],
      ['contact_sender_email',     senderEmail],
      ['contact_subject_prefix',   subjectPrefix],
    ];
    // Only update password when explicitly changed
    if (smtpPassChanged) pairs.push(['smtp_pass', smtpPass]);
    try {
      for (const [key, value] of pairs) {
        const r = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
        if (!r.ok) throw new Error((await r.json()).error || 'Fehler');
      }
      setSmtpPassChanged(false);
      showToast('E-Mail-Einstellungen gespeichert', 'success');
    } catch (e) {
      showToast('Fehler beim Speichern: ' + e.message, 'error');
    } finally {
      setIsSavingSmtp(false);
    }
  };

  const handleTestEmail = async () => {
    setIsSendingTest(true);
    try {
      const r = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtp_host: smtpHost, smtp_port: smtpPort,
          smtp_user: smtpUser, smtp_pass: smtpPass,
          smtp_secure: String(smtpSecure),
          contact_recipient_email: recipientEmail,
          contact_sender_name: senderName,
          contact_sender_email: senderEmail,
        }),
      });
      const d = await r.json();
      if (r.ok) showToast(d.message || 'Test-E-Mail gesendet', 'success');
      else showToast(d.error || 'Fehler', 'error');
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setIsSendingTest(false);
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


  // Memoize styles to prevent re-renders on input changes
  const inputStyle = useMemo(() => ({
    width: '100%', padding: '0.55rem 0.75rem',
    border: '1px solid var(--border-color)',
    borderRadius: '6px', fontSize: '0.9rem',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
  }), []);

  const tabBase = {
    padding: '0.5rem 1.25rem',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
    marginBottom: '-2px',
    transition: 'color 0.15s, border-color 0.15s',
  };
  const tabActive = { ...tabBase, color: 'var(--accent-primary)', borderBottomColor: 'var(--accent-primary)' };

  return (
    <div className="admin-editor-area">
      <div className="settings-content" style={{ padding: '2rem', maxWidth: '800px' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>Einstellungen</h2>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '2px solid var(--border-color)', marginBottom: '2rem' }}>
          <button style={activeTab === 'general' ? tabActive : tabBase} onClick={() => setActiveTab('general')}>Allgemein</button>
          <button style={activeTab === 'email'   ? tabActive : tabBase} onClick={() => setActiveTab('email')}>E-Mail &amp; Formulare</button>
        </div>

        {/* ── General tab ── */}
        {activeTab === 'general' && (
          <>
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
          </>
        )}

        {/* ── E-Mail & Formulare tab ── */}
        {activeTab === 'email' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* SMTP */}
            <section>
              <h3 style={{ marginBottom: '0.35rem' }}>SMTP-Server</h3>
              <p style={{ marginBottom: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Zugangsdaten für den ausgehenden E-Mail-Versand. Das Passwort wird verschlüsselt in der Datenbank gespeichert.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Field label="SMTP-Host">
                  <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                    placeholder="smtp.example.com" style={inputStyle} />
                </Field>
                <Field label="Port">
                  <input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                    placeholder="587" style={{ ...inputStyle, width: '100%' }} />
                </Field>
                <Field label="Benutzername / E-Mail">
                  <input type="text" value={smtpUser} onChange={e => setSmtpUser(e.target.value)}
                    placeholder="user@example.com" autoComplete="username" style={inputStyle} />
                </Field>
                <Field label="Passwort">
                  <input type="password" value={smtpPass}
                    onChange={e => { setSmtpPass(e.target.value); setSmtpPassChanged(true); }}
                    placeholder={smtpPass ? '••••••••' : 'Passwort eingeben'}
                    autoComplete="current-password" style={inputStyle} />
                </Field>
                <Field label="TLS / SSL (Port 465)" style={{ gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                    <Toggle checked={smtpSecure} onChange={setSmtpSecure} label="TLS/SSL aktivieren" />
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {smtpSecure ? 'SSL/TLS aktiv (Port 465)' : 'STARTTLS / unverschlüsselt (Port 587 / 25)'}
                    </span>
                  </div>
                </Field>
              </div>
            </section>

            {/* Contact form settings */}
            <section>
              <h3 style={{ marginBottom: '0.35rem' }}>Kontaktformular</h3>
              <p style={{ marginBottom: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Wer soll Formular-Einsendungen erhalten, und wie sollen die E-Mails aussehen?
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Field label="Empfänger-E-Mail" style={{ gridColumn: '1 / -1' }}>
                  <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)}
                    placeholder="kontakt@meinefirma.de" style={inputStyle} />
                </Field>
                <Field label="Absender-Name">
                  <input type="text" value={senderName} onChange={e => setSenderName(e.target.value)}
                    placeholder="Meine Website" style={inputStyle} />
                </Field>
                <Field label="Absender-E-Mail">
                  <input type="email" value={senderEmail} onChange={e => setSenderEmail(e.target.value)}
                    placeholder="noreply@meinefirma.de" style={inputStyle} />
                </Field>
                <Field label="Betreff-Präfix" style={{ gridColumn: '1 / -1' }}>
                  <input type="text" value={subjectPrefix} onChange={e => setSubjectPrefix(e.target.value)}
                    placeholder="[Kontakt]" style={{ ...inputStyle, maxWidth: '280px' }} />
                </Field>
              </div>
            </section>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleSaveSmtp} disabled={isSavingSmtp} style={{
                padding: '0.6rem 1.5rem', background: '#10b981', color: '#fff',
                border: 'none', borderRadius: '6px', fontWeight: 600,
                cursor: isSavingSmtp ? 'not-allowed' : 'pointer', opacity: isSavingSmtp ? 0.6 : 1,
              }}>
                {isSavingSmtp ? 'Speichern…' : 'Speichern'}
              </button>
              <button onClick={handleTestEmail} disabled={isSendingTest} style={{
                padding: '0.6rem 1.5rem', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                border: '1px solid var(--border-color)', borderRadius: '6px', fontWeight: 600,
                cursor: isSendingTest ? 'not-allowed' : 'pointer', opacity: isSendingTest ? 0.6 : 1,
              }}>
                {isSendingTest ? 'Senden…' : 'Test-E-Mail senden'}
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                Test-E-Mail geht an die konfigurierte Empfänger-Adresse.
              </span>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '-0.5rem' }}>
              Einsendungen werden zusätzlich unter <strong>Inhalte → Kontakt-Einsendungen</strong> gespeichert.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
