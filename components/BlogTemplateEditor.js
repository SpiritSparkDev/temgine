import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Save, Trash2, Rss, Layout, ChevronLeft, AlertTriangle,
  CheckCircle2, Circle, MousePointerClick, Code, HelpCircle
} from '../lib/muiIcons';
import CodeEditor from './CodeEditor';
import ConfirmDialog from './ConfirmDialog';

// Standard Blog-Variables always available in every blog template
const STANDARD_VARS = [
  { name: 'title',       hint: 'Beitragstitel' },
  { name: 'slug',        hint: 'URL-Slug des Beitrags' },
  { name: 'excerpt',     hint: 'Kurzbeschreibung' },
  { name: 'body',        hint: 'Vollständiger Inhalt (HTML)' },
  { name: 'coverImage',  hint: 'Cover-Bild URL/Pfad' },
  { name: 'author',      hint: 'Autorenname' },
  { name: 'publishedAt', hint: 'Veröffentlichungsdatum' },
  { name: 'channelSlug', hint: 'Slug des Kanals' },
  { name: 'channelUrl',  hint: 'URL des Kanals (/slug)' },
  { name: 'postUrl',     hint: 'URL des Beitrags (/channel/post)' },
];

const STANDARD_VAR_NAMES = new Set(STANDARD_VARS.map(v => v.name));

const TEMPLATE_TYPES = [
  { value: 'reading',  label: 'Leseseite',       hint: 'Vollständige Beitragsseite — muss alle Variablen enthalten' },
  { value: 'detail',   label: 'Detail-Vorschau',  hint: 'Karte mit Bild, Titel, Excerpt' },
  { value: 'simple',   label: 'Einfache Vorschau',hint: 'Kompakte Karte, nur Text' },
  { value: 'archive',  label: 'Archiv-Eintrag',   hint: 'Listenzeile mit Datum + Titel' },
];

// Extract {{varName}} placeholders from HTML code
function extractVarsFromCode(code) {
  if (!code) return new Set();
  const found = new Set();
  const re = /\{\{([^{}#^/!>]+?)\}\}/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const raw = m[1].trim();
    // Strip :type annotation
    const colon = raw.indexOf(':');
    const name = colon !== -1 ? raw.slice(0, colon).trim() : raw;
    if (name && !name.startsWith('nav:') && !name.startsWith('each:') && !name.startsWith('navigation:')) {
      found.add(name);
    }
  }
  return found;
}

const slugify = (v) =>
  String(v || '').toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');

export default function BlogTemplateEditor({ templates: initialTemplates = [], showToast, onTabChange }) {
  const [templates, setTemplates] = useState(initialTemplates.filter(t => t.type === 'BLOCK'));
  const [selectedId, setSelectedId] = useState(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // Help panel state
  const [referenceId, setReferenceId] = useState('');
  const [templateType, setTemplateType] = useState('reading');

  const inserterRef = useRef(null);

  // Reload from API on mount to ensure fresh list
  useEffect(() => {
    fetch('/api/templates?type=BLOCK')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setTemplates(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
  }, []);

  const selected = templates.find(t => t.id === selectedId) || null;

  function selectTemplate(t) {
    if (dirty) {
      if (!window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    }
    setSelectedId(t.id);
    setCode(t.code || '');
    setName(t.name || '');
    setTemplateType(t.blogType || 'reading');
    setDirty(false);
  }

  function handleCodeChange(v) {
    setCode(v);
    setDirty(true);
  }

  function handleNameChange(v) {
    setName(v);
    setDirty(true);
  }

  async function handleSave() {
    if (!selected) return;
    const safeName = (name ?? '').trim();
    if (!safeName) { showToast('Name ist erforderlich', 'error'); return; }

    // Validate: if type is detail/simple/archive, warn about vars not in reference
    if (templateType !== 'reading' && referenceId) {
      const refTpl = templates.find(t => t.id === referenceId);
      if (refTpl) {
        const refVars = extractVarsFromCode(refTpl.code);
        const currentVars = extractVarsFromCode(code);
        const missing = [...currentVars].filter(v => !refVars.has(v) && !STANDARD_VAR_NAMES.has(v));
        if (missing.length > 0) {
          showToast(`Warnung: Variable(n) nicht in Leseseite: ${missing.join(', ')}`, 'warning');
        }
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: safeName, code, type: 'BLOCK', blogType: templateType }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Fehler beim Speichern', 'error');
      } else {
        const updated = await res.json();
        setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
        setDirty(false);
        showToast('Template gespeichert', 'success');
      }
    } catch {
      showToast('Netzwerkfehler', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) { showToast('Name erforderlich', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), code: `<!-- ${newName.trim()} -->\n<article>\n  <h2>{{title}}</h2>\n  <p>{{excerpt}}</p>\n</article>`, type: 'BLOCK' }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Fehler beim Erstellen', 'error');
      } else {
        const created = await res.json();
        setTemplates(prev => [...prev, created]);
        setNewName('');
        setCreating(false);
        setSelectedId(created.id);
        setCode(created.code || '');
        setName(created.name || '');
        setTemplateType(created.blogType || 'reading');
        setDirty(false);
        showToast('Template erstellt', 'success');
      }
    } catch {
      showToast('Netzwerkfehler', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tpl) {
    const res = await fetch(`/api/templates/${tpl.id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setTemplates(prev => prev.filter(t => t.id !== tpl.id));
      if (selectedId === tpl.id) { setSelectedId(null); setCode(''); setName(''); setDirty(false); }
      showToast('Template gelöscht', 'success');
    } else {
      showToast('Fehler beim Löschen', 'error');
    }
    setConfirmDelete(null);
  }

  function handleInsertVar(varName) {
    if (inserterRef.current && typeof inserterRef.current.insert === 'function') {
      inserterRef.current.insert(`{{${varName}}}`);
    }
  }

  // Compute which vars are "missing" in current code for the help panel
  const currentVars = extractVarsFromCode(code);
  const refTpl = templates.find(t => t.id === referenceId);
  const refVars = refTpl ? extractVarsFromCode(refTpl.code) : new Set();

  function getVarStatus(varName) {
    // Is this var used in the current editor?
    return currentVars.has(varName);
  }

  // Build help panel vars list
  let helpVars = [];
  if (templateType === 'reading') {
    // Show standard vars, mark unused as missing
    helpVars = STANDARD_VARS.map(v => ({
      ...v,
      used: currentVars.has(v.name),
    }));
    // Also show custom vars from current code that are non-standard
    for (const v of currentVars) {
      if (!STANDARD_VAR_NAMES.has(v)) {
        helpVars.push({ name: v, hint: 'Eigene Variable', used: true, custom: true });
      }
    }
  } else if (refTpl) {
    // Show all vars from reference reading template
    const allRefVars = [...refVars];
    helpVars = allRefVars.map(v => {
      const std = STANDARD_VARS.find(s => s.name === v);
      return { name: v, hint: std?.hint || 'Variable aus Leseseite', used: currentVars.has(v) };
    });
    // standard vars not in refVars
    for (const sv of STANDARD_VARS) {
      if (!refVars.has(sv.name)) {
        helpVars.push({ ...sv, used: currentVars.has(sv.name), notInRef: true });
      }
    }
  } else {
    // No reference: show standard vars
    helpVars = STANDARD_VARS.map(v => ({ ...v, used: currentVars.has(v.name) }));
  }

  return (
    <div className="blog-te-root">
      {confirmDelete && (
        <ConfirmDialog
          message={`Template „${confirmDelete.name}" löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Topbar */}
      <div className="blog-topbar">
        <button className="blog-topbar__back" onClick={() => onTabChange('channels')} title="Zurück zu Kanälen">
          <ChevronLeft size={16} />
        </button>
        <div className="blog-topbar__breadcrumb">
          <Rss size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span className="blog-topbar__channel">Blog / News</span>
          <span className="blog-topbar__sep">/</span>
          <span className="blog-topbar__sub">Templates</span>
          {selected && (
            <>
              <span className="blog-topbar__sep">/</span>
              <span className="blog-topbar__sub">{name || selected.name}</span>
            </>
          )}
        </div>
        <div className="blog-topbar__actions">
          {selected && (
            <button className="btn-modern" onClick={handleSave} disabled={saving || !dirty}>
              <Save size={14} /> {saving ? 'Speichern…' : 'Speichern'}
            </button>
          )}
        </div>
      </div>

      {/* 3-column layout */}
      <div className="blog-te-layout">

        {/* ── Left: Template List ── */}
        <div className="blog-te-list">
          <div className="blog-te-list__head">
            <span>BLOCK-Templates</span>
            <button
              className="icon-btn-small"
              title="Neues Template"
              onClick={() => setCreating(v => !v)}
              style={{ color: 'var(--accent-primary)' }}
            >
              <Plus size={13} />
            </button>
          </div>

          {creating && (
            <div className="blog-te-new-form">
              <input
                className="blog-te-new-input"
                placeholder="Template-Name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                autoFocus
              />
              <button className="blog-te-new-btn" onClick={handleCreate} disabled={saving}>Erstellen</button>
            </div>
          )}

          <div className="blog-te-list__items">
            {templates.length === 0 && (
              <div className="blog-te-empty">Keine BLOCK-Templates vorhanden.</div>
            )}
            {templates.map(t => (
              <div
                key={t.id}
                className={`blog-te-item${selectedId === t.id ? ' blog-te-item--active' : ''}`}
                onClick={() => selectTemplate(t)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && selectTemplate(t)}
              >
                <FileCode size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                <span className="blog-te-item__name">{t.name}</span>
                <button
                  className="icon-btn-small blog-te-item__del"
                  title="Löschen"
                  style={{ color: 'var(--danger-primary)', marginLeft: 'auto', flexShrink: 0 }}
                  onClick={e => { e.stopPropagation(); setConfirmDelete(t); }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Middle: Code Editor ── */}
        <div className="blog-te-editor">
          {!selected ? (
            <div className="blog-te-placeholder">
              <Layout size={48} />
              <strong>Kein Template gewählt</strong>
              <p>Wähle ein Template aus der Liste oder erstelle ein neues.</p>
            </div>
          ) : (
            <>
              <div className="blog-te-editor__titlebar">
                <input
                  className="blog-te-editor__name-input"
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Template-Name"
                />
                {dirty && <span className="blog-te-dirty-dot" title="Ungespeichert" />}
              </div>
              <div className="blog-te-editor__code">
                <CodeEditor
                  value={code}
                  onChange={handleCodeChange}
                  language="html"
                  height="100%"
                  registerInserter={fn => { inserterRef.current = fn; }}
                />
              </div>
            </>
          )}
        </div>

        {/* ── Right: Help Panel ── */}
        <div className="blog-te-panel">
          <div className="blog-te-panel__head">
            <HelpCircle size={13} /> Variablen-Hilfe
          </div>

          {/* Type selector */}
          <div className="blog-te-panel__section">
            <div className="blog-te-panel__label">Template-Typ</div>
            <div className="blog-te-type-grid">
              {TEMPLATE_TYPES.map(tt => (
                <button
                  key={tt.value}
                  className={`blog-te-type-btn${templateType === tt.value ? ' blog-te-type-btn--active' : ''}`}
                  onClick={() => setTemplateType(tt.value)}
                  title={tt.hint}
                >
                  {tt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reference reading template */}
          {templateType !== 'reading' && (
            <div className="blog-te-panel__section">
              <div className="blog-te-panel__label">Referenz-Leseseite</div>
              <select
                className="blog-te-panel__select"
                value={referenceId}
                onChange={e => setReferenceId(e.target.value)}
              >
                <option value="">-- keine --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {!referenceId && (
                <div className="blog-te-panel__hint">
                  Wähle eine Leseseite als Referenz, um fehlende Variablen rot zu markieren.
                </div>
              )}
            </div>
          )}

          {/* Variable list */}
          <div className="blog-te-panel__section blog-te-panel__section--vars">
            <div className="blog-te-panel__label">
              {templateType === 'reading' ? 'Standard-Variablen' : 'Leseseite-Variablen'}
              <span className="blog-te-panel__label-hint">Klick zum Einfügen</span>
            </div>
            <div className="blog-te-var-list">
              {helpVars.map(v => (
                <button
                  key={v.name}
                  className={`blog-te-var-item${!v.used ? ' blog-te-var-item--missing' : ''}${v.custom ? ' blog-te-var-item--custom' : ''}${v.notInRef ? ' blog-te-var-item--dim' : ''}`}
                  onClick={() => handleInsertVar(v.name)}
                  title={v.used ? `✓ Verwendet — ${v.hint}` : `✗ Fehlt — ${v.hint} — Klick zum Einfügen`}
                >
                  <span className="blog-te-var-item__icon">
                    {v.used ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                  </span>
                  <code className="blog-te-var-item__name">{`{{${v.name}}}`}</code>
                </button>
              ))}
              {helpVars.length === 0 && (
                <div className="blog-te-empty" style={{ fontSize: 12, padding: '8px 0' }}>
                  Keine Variablen ermittelt.
                </div>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="blog-te-panel__legend">
            <span className="blog-te-legend-item"><CheckCircle2 size={11} style={{ color: 'var(--accent-primary)' }} /> Im Template verwendet</span>
            <span className="blog-te-legend-item blog-te-legend-item--missing"><Circle size={11} /> Fehlt / nicht verwendet</span>
          </div>
        </div>

      </div>
    </div>
  );
}
