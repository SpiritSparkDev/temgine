import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2, Edit2, Check, X, Mail, ChevronRight, Sparkles } from '../lib/muiIcons';
import { CONTACT_FORM_PRESETS } from '../lib/contactFormPresets';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

const BLANK_CODE = '<section class="kontakt-section">\n  <form id="kontakt-form">\n    <!-- Felder + Altcha-Widget -->\n  </form>\n</section>';

export default function ContactFormTemplatesView({ showToast }) {
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
  );
}
