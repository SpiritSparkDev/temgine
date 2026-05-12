import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Save, Trash2, Rss, Layout, ChevronLeft,
  CheckCircle2, Circle, FileCode, HelpCircle
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

const TEMPLATE_ROLES = [
  { value: 'master', label: 'Master-Template', hint: 'Definiert den vollständigen Inhalt und alle erlaubten Platzhalter' },
  { value: 'preview', label: 'Vorschau-Template', hint: 'Darf nur Platzhalter verwenden, die im Master vorhanden sind' },
];

function isMasterTemplate(tpl) {
  const role = String(tpl?.blogRole || '').toLowerCase();
  if (role === 'master') return true;
  const blogType = String(tpl?.blogType || '').toLowerCase();
  return blogType === 'master' || blogType === 'reading';
}

function getMasterTemplateName(tpl) {
  if (tpl?.masterTemplateName) return String(tpl.masterTemplateName);
  const blogType = String(tpl?.blogType || '');
  if (blogType.toLowerCase().startsWith('preview:')) {
    return blogType.slice(blogType.indexOf(':') + 1).trim() || '';
  }
  return '';
}

function getTemplateTypeForEditor(tpl) {
  if (!tpl) return 'reading';
  if (isMasterTemplate(tpl)) return 'reading';

  const blogType = String(tpl.blogType || '').toLowerCase();
  if (blogType === 'simple') return 'simple';
  if (blogType === 'archive') return 'archive';
  return 'detail';
}

function getTemplateRoleForEditor(tpl) {
  return isMasterTemplate(tpl) ? 'master' : 'preview';
}

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

  // Editor state
  const [templateRole, setTemplateRole] = useState('master');
  const [referenceId, setReferenceId] = useState('');
  // Create state
  const [newTemplateRole, setNewTemplateRole] = useState('master');
  const [newReferenceId, setNewReferenceId] = useState('');
  const [collapsedMasters, setCollapsedMasters] = useState({});

  const inserterRef = useRef(null);

  // Reload from API on mount to ensure fresh list
  useEffect(() => {
    fetch('/api/templates?scope=blog&type=BLOCK')
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setTemplates(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
  }, []);

  const selected = templates.find(t => t.id === selectedId) || null;

  const templateTree = useMemo(() => {
    const masters = templates
      .filter(isMasterTemplate)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' }));

    const masterByName = new Map(masters.map(m => [String(m.name || ''), m]));
    const previewsByMaster = new Map(masters.map(m => [m.id, []]));
    const orphans = [];

    templates
      .filter(t => !isMasterTemplate(t))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' }))
      .forEach((preview) => {
        const masterName = getMasterTemplateName(preview);
        const master = masterByName.get(masterName);
        if (!master) {
          orphans.push(preview);
          return;
        }
        previewsByMaster.get(master.id).push(preview);
      });

    return { masters, previewsByMaster, orphans };
  }, [templates]);

  useEffect(() => {
    setCollapsedMasters((prev) => {
      const next = { ...prev };
      let changed = false;
      templateTree.masters.forEach((master) => {
        if (typeof next[master.id] === 'undefined') {
          next[master.id] = false;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [templateTree.masters]);

  function selectTemplate(t) {
    if (dirty) {
      if (!window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    }
    setSelectedId(t.id);
    setCode(t.code || '');
    setName(t.name || '');
    setTemplateRole(getTemplateRoleForEditor(t));
    const masterName = getMasterTemplateName(t);
    if (masterName) {
      const master = templates.find(mt => mt.name === masterName);
      setReferenceId(master ? master.id : '');
    } else {
      setReferenceId('');
    }
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

    const isPreview = templateRole === 'preview';
    const referenceTpl = templates.find(t => t.id === referenceId);
    if (isPreview && !referenceTpl) {
      showToast('Vorschau-Templates benötigen eine Referenz-Leseseite', 'error');
      return;
    }

    // Validate: preview vars must be subset of master vars (+ standard vars)
    if (isPreview && referenceTpl) {
      const refVars = extractVarsFromCode(referenceTpl.code);
      const currentVars = extractVarsFromCode(code);
      const missing = [...currentVars].filter(v => !refVars.has(v) && !STANDARD_VAR_NAMES.has(v));
      if (missing.length > 0) {
        showToast(`Ungültige Variable(n): ${missing.join(', ')}`, 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: safeName,
          code,
          type: 'BLOCK',
          blogType: isPreview ? 'detail' : 'reading',
          blogRole: isPreview ? 'preview' : 'master',
          masterTemplateName: isPreview ? referenceTpl?.name : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        const invalid = Array.isArray(err?.details?.invalidPlaceholders) ? err.details.invalidPlaceholders.join(', ') : '';
        showToast(err.error ? `${err.error}${invalid ? `: ${invalid}` : ''}` : 'Fehler beim Speichern', 'error');
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
    const isPreview = newTemplateRole === 'preview';
    const referenceTpl = templates.find(t => t.id === newReferenceId);
    if (isPreview && !referenceTpl) {
      showToast('Vorschau-Templates benötigen eine Referenz-Leseseite', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          code: `<!-- ${newName.trim()} -->\n<article>\n  <h2>{{title}}</h2>\n  <p>{{excerpt}}</p>\n</article>`,
          type: 'BLOCK',
          blogType: isPreview ? 'detail' : 'reading',
          blogRole: isPreview ? 'preview' : 'master',
          masterTemplateName: isPreview ? referenceTpl?.name : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        const invalid = Array.isArray(err?.details?.invalidPlaceholders) ? err.details.invalidPlaceholders.join(', ') : '';
        showToast(err.error ? `${err.error}${invalid ? `: ${invalid}` : ''}` : 'Fehler beim Erstellen', 'error');
      } else {
        const created = await res.json();
        setTemplates(prev => [...prev, created]);
        setNewName('');
        setNewTemplateRole('master');
        setNewReferenceId('');
        setCreating(false);
        setSelectedId(created.id);
        setCode(created.code || '');
        setName(created.name || '');
        setTemplateRole(getTemplateRoleForEditor(created));
        const masterName = getMasterTemplateName(created);
        if (masterName) {
          const master = [...templates, created].find(mt => mt.name === masterName);
          setReferenceId(master ? master.id : '');
        } else {
          setReferenceId('');
        }
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

  // Build help panel vars list
  let helpVars = [];
  if (templateRole === 'master') {
    // Dokumentiere nur Variablen, die im Master tatsächlich vorkommen.
    helpVars = [...currentVars]
      .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }))
      .map(v => {
        const std = STANDARD_VARS.find(s => s.name === v);
        return { name: v, hint: std?.hint || 'Eigene Variable', used: true, custom: !std };
      });
  } else if (refTpl) {
    // Show only vars that are actually used by the selected master.
    const allRefVars = [...refVars].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    helpVars = allRefVars.map(v => {
      const std = STANDARD_VARS.find(s => s.name === v);
      return { name: v, hint: std?.hint || 'Variable aus Leseseite', used: currentVars.has(v) };
    });
  } else {
    helpVars = [];
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
              <div className="blog-te-panel__section" style={{ marginTop: 8 }}>
                <div className="blog-te-panel__label">Rolle</div>
                <div className="blog-te-type-grid">
                  {TEMPLATE_ROLES.map(role => (
                    <button
                      key={role.value}
                      className={`blog-te-type-btn${newTemplateRole === role.value ? ' blog-te-type-btn--active' : ''}`}
                      onClick={() => setNewTemplateRole(role.value)}
                      title={role.hint}
                    >
                      {role.label}
                    </button>
                  ))}
                </div>
              </div>
              {newTemplateRole === 'preview' && (
                <select
                  className="blog-te-panel__select"
                  style={{ marginTop: 8 }}
                  value={newReferenceId}
                  onChange={e => setNewReferenceId(e.target.value)}
                >
                  <option value="">-- Master wählen --</option>
                  {templates.filter(isMasterTemplate).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <button className="blog-te-new-btn" onClick={handleCreate} disabled={saving}>Erstellen</button>
            </div>
          )}

          <div className="blog-te-list__items">
            {templates.length === 0 && (
              <div className="blog-te-empty">Keine BLOCK-Templates vorhanden.</div>
            )}
            {templates.length > 0 && (
              <div className="blog-te-tree" role="tree" aria-label="Blog Template Baumansicht">
                {templateTree.masters.map((master) => {
                  const children = templateTree.previewsByMaster.get(master.id) || [];
                  const collapsed = !!collapsedMasters[master.id];

                  return (
                    <div key={master.id} className="blog-te-tree__group">
                      <div
                        className={`blog-te-item blog-te-tree__item blog-te-tree__item--master${selectedId === master.id ? ' blog-te-item--active' : ''}`}
                        onClick={() => selectTemplate(master)}
                        role="treeitem"
                        aria-expanded={children.length > 0 ? !collapsed : undefined}
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.key === 'Enter') selectTemplate(master);
                          if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && children.length > 0) {
                            setCollapsedMasters(prev => ({ ...prev, [master.id]: e.key === 'ArrowLeft' }));
                          }
                        }}
                      >
                        <button
                          className="blog-te-tree__expander"
                          type="button"
                          title={collapsed ? 'Aufklappen' : 'Zuklappen'}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (children.length === 0) return;
                            setCollapsedMasters(prev => ({ ...prev, [master.id]: !collapsed }));
                          }}
                        >
                          {children.length > 0 ? (collapsed ? '▸' : '▾') : '•'}
                        </button>
                        <FileCode size={12} style={{ opacity: 0.55, flexShrink: 0 }} />
                        <span className="blog-te-item__name">{master.name}</span>
                        <span className="blog-te-item__meta">Master</span>
                        <button
                          className="icon-btn-small blog-te-item__del"
                          title="Löschen"
                          style={{ color: 'var(--danger-primary)', marginLeft: 'auto', flexShrink: 0 }}
                          onClick={e => { e.stopPropagation(); setConfirmDelete(master); }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>

                      {!collapsed && children.map((preview, idx) => {
                        const isLast = idx === children.length - 1;
                        return (
                          <div
                            key={preview.id}
                            className={`blog-te-item blog-te-tree__item blog-te-tree__item--preview${selectedId === preview.id ? ' blog-te-item--active' : ''}`}
                            onClick={() => selectTemplate(preview)}
                            role="treeitem"
                            tabIndex={0}
                            onKeyDown={e => e.key === 'Enter' && selectTemplate(preview)}
                          >
                            <span className="blog-te-tree__branch">{isLast ? '└─' : '├─'}</span>
                            <FileCode size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
                            <span className="blog-te-item__name">{preview.name}</span>
                            <span className="blog-te-item__meta">Vorschau</span>
                            <button
                              className="icon-btn-small blog-te-item__del"
                              title="Löschen"
                              style={{ color: 'var(--danger-primary)', marginLeft: 'auto', flexShrink: 0 }}
                              onClick={e => { e.stopPropagation(); setConfirmDelete(preview); }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {templateTree.orphans.length > 0 && (
                  <div className="blog-te-tree__group">
                    <div className="blog-te-tree__orphan-head">Nicht zugeordnete Vorschauen</div>
                    {templateTree.orphans.map((preview) => (
                      <div
                        key={preview.id}
                        className={`blog-te-item blog-te-tree__item blog-te-tree__item--preview${selectedId === preview.id ? ' blog-te-item--active' : ''}`}
                        onClick={() => selectTemplate(preview)}
                        role="treeitem"
                        tabIndex={0}
                        onKeyDown={e => e.key === 'Enter' && selectTemplate(preview)}
                      >
                        <span className="blog-te-tree__branch">└─</span>
                        <FileCode size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
                        <span className="blog-te-item__name">{preview.name}</span>
                        <span className="blog-te-item__meta">Vorschau</span>
                        <button
                          className="icon-btn-small blog-te-item__del"
                          title="Löschen"
                          style={{ color: 'var(--danger-primary)', marginLeft: 'auto', flexShrink: 0 }}
                          onClick={e => { e.stopPropagation(); setConfirmDelete(preview); }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
            <div className="blog-te-panel__label">Rolle</div>
            <div className="blog-te-type-grid">
              {TEMPLATE_ROLES.map(tt => (
                <button
                  key={tt.value}
                  className={`blog-te-type-btn${templateRole === tt.value ? ' blog-te-type-btn--active' : ''}`}
                  onClick={() => {
                    setTemplateRole(tt.value);
                    setDirty(true);
                    if (tt.value === 'master') setReferenceId('');
                  }}
                  title={tt.hint}
                >
                  {tt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reference reading template */}
          {templateRole === 'preview' && (
            <div className="blog-te-panel__section">
              <div className="blog-te-panel__label">Referenz-Master</div>
              <select
                className="blog-te-panel__select"
                value={referenceId}
                onChange={e => {
                  setReferenceId(e.target.value);
                  setDirty(true);
                }}
              >
                <option value="">-- Master wählen --</option>
                {templates.filter(t => isMasterTemplate(t) && t.id !== selectedId).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {!referenceId && (
                <div className="blog-te-panel__hint">
                  Vorschau-Templates brauchen zwingend eine Leseseite als Referenz.
                </div>
              )}
            </div>
          )}

          {/* Variable list */}
          <div className="blog-te-panel__section blog-te-panel__section--vars">
            <div className="blog-te-panel__label">
              {templateRole === 'master' ? 'Verwendete Master-Variablen' : 'Verwendete Master-Variablen'}
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
                  {templateRole === 'preview' && !refTpl ? 'Bitte zuerst einen Master wählen.' : 'Keine verwendeten Variablen ermittelt.'}
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
