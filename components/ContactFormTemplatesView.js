import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2, Edit2, Check, X, Mail, ChevronRight, Sparkles } from '../lib/muiIcons';
import { CONTACT_FORM_PRESETS } from '../lib/contactFormPresets';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

const BLANK_CODE = '<section class="kontakt-section">\n  <form data-temgine-form="contact">\n    <!-- Felder + Altcha-Widget, kein eigenes Script nötig -->\n  </form>\n</section>';

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

const inputStyle = {
  width: '100%', padding: '0.55rem 0.75rem',
  border: '1px solid var(--border-color)',
  borderRadius: '6px', fontSize: '0.9rem',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
};

const Field = React.memo(({ label, children, style }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', ...style }}>
    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label}
    </label>
    {children}
  </div>
));

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

export default function ContactFormTemplatesView({ showToast }) {
  const [activeTab, setActiveTab] = useState('forms');

  // --- SMTP tab state ---
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
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.smtp_host)               setSmtpHost(data.smtp_host);
        if (data.smtp_port)               setSmtpPort(data.smtp_port);
        if (data.smtp_user)               setSmtpUser(data.smtp_user);
        if (data.smtp_pass)               setSmtpPass(data.smtp_pass);
        if (data.smtp_secure)             setSmtpSecure(data.smtp_secure === 'true');
        if (data.contact_recipient_email) setRecipientEmail(data.contact_recipient_email);
        if (data.contact_sender_name)     setSenderName(data.contact_sender_name);
        if (data.contact_sender_email)    setSenderEmail(data.contact_sender_email);
        if (data.contact_subject_prefix)  setSubjectPrefix(data.contact_subject_prefix);
      })
      .catch(() => {});
  }, []);

  async function handleSaveSmtp() {
    setIsSavingSmtp(true);
    const pairs = [
      ['smtp_host',               smtpHost],
      ['smtp_port',               smtpPort],
      ['smtp_user',               smtpUser],
      ['smtp_secure',             String(smtpSecure)],
      ['contact_recipient_email', recipientEmail],
      ['contact_sender_name',     senderName],
      ['contact_sender_email',    senderEmail],
      ['contact_subject_prefix',  subjectPrefix],
    ];
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
      showToast('SMTP-Einstellungen gespeichert', 'success');
    } catch (e) {
      showToast('Fehler beim Speichern: ' + e.message, 'error');
    } finally {
      setIsSavingSmtp(false);
    }
  }

  async function handleTestEmail() {
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
  }

  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null); // { name, isNew }
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showPresets, setShowPresets] = useState(false);
  const [pendingPresetCss, setPendingPresetCss] = useState(null);
  const [pendingPresetLabel, setPendingPresetLabel] = useState('');
  const [showCssDialog, setShowCssDialog] = useState(false);

  const loadList = useCallback(() => {
    setIsLoading(true);
    fetch('/api/templates?type=BLOCK&scope=contact')
      .then(r => r.json())
      .then(data => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  function handleNew() {
    setShowPresets(true);
  }

  function startBlank() {
    setEditing({ isNew: true });
    setEditName('');
    setEditCode(BLANK_CODE);
    setShowPresets(false);
  }

  function applyPreset(preset) {
    setEditing({ isNew: true });
    setEditName(preset.label);
    setEditCode(preset.code);
    setShowPresets(false);
    if (preset.css) {
      setPendingPresetCss(preset.css);
      setPendingPresetLabel(preset.label);
      setShowCssDialog(true);
    }
  }

  async function handleSaveCss() {
    try {
      let existingContent = '';
      const getRes = await fetch('/api/css?file=generic.css');
      if (getRes.ok) {
        const data = await getRes.json();
        existingContent = data.content || '';
      }
      const separator = existingContent.trim()
        ? `\n\n/* --- Kontaktformular: ${pendingPresetLabel} --- */\n`
        : `/* --- Kontaktformular: ${pendingPresetLabel} --- */\n`;
      const combined = existingContent.trim()
        ? existingContent + separator + pendingPresetCss
        : separator + pendingPresetCss;
      await fetch('/api/css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'generic.css', content: combined }),
      });
      showToast('CSS in generic.css gespeichert!', 'success');
    } catch (e) {
      showToast('CSS konnte nicht gespeichert werden: ' + e.message, 'error');
    } finally {
      setShowCssDialog(false);
      setPendingPresetCss(null);
      setPendingPresetLabel('');
    }
  }

  function handleEdit(item) {
    setIsLoading(true);
    fetch(`/api/templates?name=${encodeURIComponent(item.name)}`)
      .then(r => r.json())
      .then(data => {
        setEditing({ name: data.name });
        setEditName(data.name);
        setEditCode(data.code);
      })
      .catch(err => showToast('Fehler beim Laden: ' + err.message, 'error'))
      .finally(() => setIsLoading(false));
  }

  function handleCancel() {
    setEditing(null);
    setEditName('');
    setEditCode('');
  }

  async function handleSave() {
    if (!editName.trim()) {
      showToast('Bitte einen Namen eingeben', 'error');
      return;
    }
    if (!editCode.trim()) {
      showToast('Bitte Formular-Code eingeben', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const isNew = editing?.isNew;
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/templates' : `/api/templates/${encodeURIComponent(editing.name)}`;
      const body = { name: editName.trim(), code: editCode, type: 'BLOCK', category: 'contact' };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Unbekannter Fehler');
      }
      showToast(`Kontaktformular "${editName.trim()}" gespeichert`, 'success');
      loadList();
      handleCancel();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Kontaktformular "${item.name}" wirklich löschen?`)) return;
    try {
      const res = await fetch('/api/templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: item.name }),
      });
      if (!res.ok) throw new Error('Fehler beim Löschen');
      showToast(`"${item.name}" gelöscht`, 'success');
      if (editing && editing.name === item.name) handleCancel();
      loadList();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }

  return (
    <>
    <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '2px solid var(--border-color)', padding: '0 1.5rem' }}>
      <button style={activeTab === 'forms' ? tabActive : tabBase} onClick={() => setActiveTab('forms')}>Formulare</button>
      <button style={activeTab === 'smtp'  ? tabActive : tabBase} onClick={() => setActiveTab('smtp')}>SMTP-Einstellungen</button>
    </div>

    {activeTab === 'forms' && (
    <div className="nav-view">
      <div className="nav-body">
        {/* ── Left: Kontaktformular-Liste ─────────────────────────────────── */}
        <div className="nav-list-panel">
          <div className="nav-list-header">
            <h3 className="nav-list-title">Kontaktformulare</h3>
            <button className="btn-icon-label" onClick={handleNew} title="Neues Kontaktformular erstellen">
              <Plus size={15} /> Neu
            </button>
          </div>

          {isLoading && !editing ? (
            <div className="nav-empty-hint">Lädt…</div>
          ) : list.length === 0 ? (
            <div className="nav-empty-hint">
              Noch kein Kontaktformular angelegt.<br />
              <button className="nav-empty-cta" onClick={handleNew}>Erstes Kontaktformular erstellen</button>
            </div>
          ) : (
            <ul className="nav-template-list">
              {list.map(item => (
                <li key={item.name} className={`nav-template-card ${editing?.name === item.name ? 'selected' : ''}`}>
                  <div className="nav-card-info">
                    <span className="nav-card-name">{item.name}</span>
                  </div>
                  <div className="nav-card-actions">
                    <button className="nav-card-btn edit" onClick={() => handleEdit(item)} title="Bearbeiten">
                      <Edit2 size={13} />
                    </button>
                    <button className="nav-card-btn delete" onClick={() => handleDelete(item)} title="Löschen">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Right: Editor panel ─────────────────────────────────────────── */}
        {editing ? (
          <div className="nav-editor-panel">
            <div className="nav-editor-header">
              <input
                className="nav-name-input"
                type="text"
                placeholder="Name dieses Kontaktformulars…"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
              <div className="nav-editor-actions">
                <button className="nav-card-btn" onClick={handleCancel} title="Abbrechen">
                  <X size={14} /> Abbrechen
                </button>
                <button className="nav-card-btn save" onClick={handleSave} disabled={isSaving} title="Speichern">
                  <Check size={14} /> {isSaving ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </div>

            <div className="nav-editor-code" style={{ height: '60vh' }}>
              <div className="nav-panel-label">HTML / Mustache-Template</div>
              <div className="nav-monaco-wrap">
                <CodeEditor value={editCode} onChange={setEditCode} language="html" height="100%" />
              </div>
            </div>

            <div className="nav-placeholder-ref">
              Sendet an <code>/api/contact</code>, per <code>/api/contact/challenge</code> gegen Spam per ALTCHA geschützt ·
              wird über den Block-Template-Dropdown im Seiten-Editor auf einer Seite eingesetzt.
            </div>
          </div>
        ) : (
          <div className="nav-editor-panel nav-editor-empty">
            <Mail size={40} strokeWidth={1} />
            <p>Kontaktformular aus der Liste wählen oder ein neues erstellen.</p>
            <p className="nav-editor-empty-hint">
              „Neu" bietet drei fertige Varianten mit ALTCHA-Spamschutz, oder starte leer.
            </p>
          </div>
        )}
      </div>

      {/* Preset-Auswahl */}
      {showPresets && (
        <div className="tce-preset-overlay" role="dialog" aria-modal="true" aria-label="Kontaktformular-Vorlagen">
          <div className="tce-preset-panel">
            <div className="tce-preset-header">
              <div className="tce-preset-title">
                <Mail size={16} aria-hidden="true" /> Kontaktformular-Vorlagen
              </div>
              <button className="tce-preset-close" onClick={() => setShowPresets(false)} aria-label="Schließen">
                <X size={16} />
              </button>
            </div>
            <div className="tce-preset-grid">
              {CONTACT_FORM_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  className="tce-preset-card"
                  onClick={() => applyPreset(preset)}
                  title={`Vorlage "${preset.label}" anwenden`}
                >
                  <div className="tce-preset-card__label">{preset.label}</div>
                  <div className="tce-preset-card__desc">{preset.description}</div>
                  <ChevronRight size={14} className="tce-preset-card__arrow" aria-hidden="true" />
                </button>
              ))}
              <button type="button" className="tce-preset-card" onClick={startBlank} title="Leer starten">
                <div className="tce-preset-card__label">Leer starten</div>
                <div className="tce-preset-card__desc">Eigenes Formular ohne Vorlage schreiben</div>
                <ChevronRight size={14} className="tce-preset-card__arrow" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS-Übernahme-Dialog */}
      {showCssDialog && (
        <div className="tce-css-dialog-overlay" role="dialog" aria-modal="true">
          <div className="tce-css-dialog">
            <div className="tce-css-dialog__icon"><Sparkles size={22} /></div>
            <h3 className="tce-css-dialog__title">CSS generieren?</h3>
            <p className="tce-css-dialog__text">
              Soll passendes CSS für <strong>{pendingPresetLabel}</strong> an{' '}
              <code>generic.css</code> angehängt werden?
            </p>
            <div className="tce-css-dialog__actions">
              <button className="tce-btn tce-btn-primary" onClick={handleSaveCss}>
                Ja, generieren
              </button>
              <button
                className="tce-btn tce-btn-ghost"
                onClick={() => { setShowCssDialog(false); setPendingPresetCss(null); setPendingPresetLabel(''); }}
              >
                Nein, danke
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    )}

    {activeTab === 'smtp' && (
      <div className="admin-editor-area">
        <div className="settings-content" style={{ padding: '2rem', maxWidth: '800px' }}>
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
        </div>
      </div>
    )}
    </>
  );
}
