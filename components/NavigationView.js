import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2, Edit2, Check, X, Navigation, Anchor, Globe, Layout, ChevronRight } from 'lucide-react';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

const NAVIGATION_CSS_FILENAME = 'navigation.css';
const DEFAULT_NAVIGATION_CSS = `/* Automatisch erstellt durch Navigation-Editor */
.desktop_nav { display: block; }
.mobile_nav { display: none; }

.mobile_nav__list { display: none; list-style: none; padding: 0; margin: .75rem 0 0; }
.mobile_nav.open .mobile_nav__list { display: block; }

@media (max-width: 960px) {
  .desktop_nav { display: none; }
  .mobile_nav { display: block; }
}`;

// ── Presets ──────────────────────────────────────────────────────────────────
const PRESETS = {
  MAIN: [
    {
      label: 'Responsive Combo (Desktop + Mobile)',
      description: 'Ein Template mit .desktop_nav und .mobile_nav; Umschaltung per CSS-Media-Query',
      code: `<style>
.desktop_nav { display: block; }
.mobile_nav { display: none; }
.mobile_nav__list { display: none; list-style: none; padding: 0; margin: .75rem 0 0; }
.mobile_nav.open .mobile_nav__list { display: block; }

@media (max-width: 960px) {
  .desktop_nav { display: none; }
  .mobile_nav { display: block; }
}
</style>

<div class="site-nav-combo">
  <nav class="desktop_nav" aria-label="Hauptnavigation Desktop">
    <ul class="desktop_nav__list">
      {{#pages}}
      <li class="desktop_nav__item{{#hasChildren}} has-children{{/hasChildren}}">
        <a class="desktop_nav__link" href="/{{slug}}">{{title}}</a>
        {{#hasChildren}}
        <ul class="desktop_nav__sub">
          {{#children}}<li><a href="/{{slug}}">{{title}}</a></li>{{/children}}
        </ul>
        {{/hasChildren}}
      </li>
      {{/pages}}
    </ul>
  </nav>

  <nav class="mobile_nav" aria-label="Hauptnavigation Mobile">
    <button class="mobile_nav__toggle" type="button" onclick="this.closest('.mobile_nav').classList.toggle('open')">
      Menü
    </button>
    <ul class="mobile_nav__list">
      {{#pages}}
      <li class="mobile_nav__item{{#hasChildren}} has-children{{/hasChildren}}">
        <a class="mobile_nav__link" href="/{{slug}}">{{title}}</a>
        {{#hasChildren}}
        <ul class="mobile_nav__sub">
          {{#children}}<li><a href="/{{slug}}">{{title}}</a></li>{{/children}}
        </ul>
        {{/hasChildren}}
      </li>
      {{/pages}}
    </ul>
  </nav>
</div>`
    },
    {
      label: 'Horizontal Bar',
      description: 'Klassische horizontale Navigation mit Untermenü',
      code: `<nav class="main-nav horizontal-nav">
  <ul class="nav-list">
    {{#pages}}
    <li class="nav-item{{#hasChildren}} has-children{{/hasChildren}}">
      <a class="nav-link" href="/{{slug}}">{{title}}</a>
      {{#hasChildren}}
      <ul class="nav-sub">
        {{#children}}<li class="nav-sub-item"><a class="nav-sub-link" href="/{{slug}}">{{title}}</a></li>{{/children}}
      </ul>
      {{/hasChildren}}
    </li>
    {{/pages}}
  </ul>
</nav>`,
    },
    {
      label: 'Dropdown Menu',
      description: 'Navigation mit Dropdown-Untermenü',
      code: `<nav class="main-nav dropdown-nav">
  <ul class="nav-list">
    {{#pages}}
    <li class="nav-item{{#hasChildren}} has-dropdown{{/hasChildren}}">
      <a class="nav-link" href="/{{slug}}">{{title}}</a>
      {{#hasChildren}}
      <ul class="dropdown-menu">
        {{#children}}<li><a href="/{{slug}}">{{title}}</a></li>{{/children}}
      </ul>
      {{/hasChildren}}
    </li>
    {{/pages}}
  </ul>
</nav>`,
    },
    {
      label: 'Centered Split',
      description: 'Logo in der Mitte, Links links und rechts',
      code: `<nav class="main-nav centered-nav">
  <ul class="nav-left">
    {{#pages}}
    <li class="nav-item{{#hasChildren}} has-children{{/hasChildren}}">
      <a class="nav-link" href="/{{slug}}">{{title}}</a>
      {{#hasChildren}}
      <ul class="nav-sub">
        {{#children}}<li><a href="/{{slug}}">{{title}}</a></li>{{/children}}
      </ul>
      {{/hasChildren}}
    </li>
    {{/pages}}
  </ul>
  <a class="nav-logo" href="/">
    <span class="logo-text">Logo</span>
  </a>
  <ul class="nav-right">
    {{#pages}}
    <li class="nav-item{{#hasChildren}} has-children{{/hasChildren}}">
      <a class="nav-link" href="/{{slug}}">{{title}}</a>
      {{#hasChildren}}
      <ul class="nav-sub">
        {{#children}}<li><a href="/{{slug}}">{{title}}</a></li>{{/children}}
      </ul>
      {{/hasChildren}}
    </li>
    {{/pages}}
  </ul>
</nav>`,
    },
    {
      label: 'Sidebar Vertical',
      description: 'Vertikale Sidebar-Navigation mit Unterebenen',
      code: `<nav class="main-nav sidebar-nav">
  <div class="sidebar-brand">
    <a href="/" class="brand-link">Marke</a>
  </div>
  <ul class="sidebar-list">
    {{#pages}}
    <li class="sidebar-item{{#hasChildren}} has-children{{/hasChildren}}">
      <a class="sidebar-link" href="/{{slug}}">
        <span class="link-text">{{title}}</span>
      </a>
      {{#hasChildren}}
      <ul class="sidebar-sub">
        {{#children}}<li class="sidebar-sub-item"><a class="sidebar-sub-link" href="/{{slug}}">{{title}}</a></li>{{/children}}
      </ul>
      {{/hasChildren}}
    </li>
    {{/pages}}
  </ul>
</nav>`,
    },
    {
      label: 'Mega Menu',
      description: 'Breites Dropdown mit Unterseiten als Spalten',
      code: `<nav class="main-nav mega-menu-nav">
  <ul class="mega-top-list">
    {{#pages}}
    <li class="mega-top-item{{#hasChildren}} has-mega{{/hasChildren}}">
      <a class="mega-top-link" href="/{{slug}}">{{title}}</a>
      {{#hasChildren}}
      <div class="mega-panel">
        <div class="mega-panel-inner">
          <div class="mega-col">
            <ul class="mega-col-list">
              {{#children}}<li><a href="/{{slug}}">{{title}}</a></li>{{/children}}
            </ul>
          </div>
        </div>
      </div>
      {{/hasChildren}}
    </li>
    {{/pages}}
  </ul>
</nav>`,
    },
    {
      label: 'Footer-Navigation',
      description: 'Mehrspaltiger Footer mit Link-Gruppen',
      code: `<footer class="site-footer">
  <div class="footer-nav-inner">
    <div class="footer-brand">
      <a href="/" class="footer-logo">Logo</a>
      <p class="footer-tagline">Kurze Beschreibung des Unternehmens.</p>
    </div>
    <nav class="footer-links" aria-label="Footer-Navigation">
      {{#pages}}
      {{#hasChildren}}
      <div class="footer-col">
        <p class="footer-col-heading">{{title}}</p>
        <ul class="footer-col-list">
          {{#children}}<li><a class="footer-link" href="/{{slug}}">{{title}}</a></li>{{/children}}
        </ul>
      </div>
      {{/hasChildren}}
      {{/pages}}
      <div class="footer-col">
        <p class="footer-col-heading">Navigation</p>
        <ul class="footer-col-list">
          {{#pages}}<li><a class="footer-link" href="/{{slug}}">{{title}}</a></li>{{/pages}}
        </ul>
      </div>
    </nav>
  </div>
  <div class="footer-bottom">
    <p class="footer-copy">&copy; 2026 Meine Website · <a href="/datenschutz">Datenschutz</a> · <a href="/impressum">Impressum</a></p>
  </div>
</footer>`,
    },
  ],
  PAGE: [
    {
      label: 'Anchor Sidebar',
      description: 'Seitliche Anker-Navigation für lange Seiten',
      code: `<nav class="page-nav anchor-sidebar">
  <p class="page-nav-heading">Inhalt</p>
  <ul class="anchor-list">
    {{#anchors}}
    <li class="anchor-item">
      <a class="anchor-link" href="#{{anchorId}}">{{title}}</a>
    </li>
    {{/anchors}}
  </ul>
</nav>`,
    },
    {
      label: 'Sticky TOC',
      description: 'Sticky Inhaltsverzeichnis',
      code: `<aside class="page-nav sticky-toc">
  <nav aria-label="Inhaltsverzeichnis">
    <h2 class="toc-title">Auf dieser Seite</h2>
    <ol class="toc-list">
      {{#anchors}}
      <li class="toc-item">
        <a class="toc-link" href="#{{anchorId}}">{{title}}</a>
      </li>
      {{/anchors}}
    </ol>
  </nav>
</aside>`,
    },
    {
      label: 'Breadcrumb',
      description: 'Breadcrumb-Navigation',
      code: `<nav class="page-nav breadcrumb" aria-label="Brotkrümel">
  <ol class="breadcrumb-list">
    <li class="breadcrumb-item">
      <a href="/" class="breadcrumb-link">Start</a>
    </li>
    {{#anchors}}
    <li class="breadcrumb-item">
      <span class="breadcrumb-sep" aria-hidden="true">›</span>
      <a class="breadcrumb-link" href="#{{anchorId}}">{{title}}</a>
    </li>
    {{/anchors}}
  </ol>
</nav>`,
    },
    {
      label: 'Step Progress',
      description: 'Nummerierte Schritt-Navigation',
      code: `<nav class="page-nav step-progress" aria-label="Schritte">
  <ol class="step-list">
    {{#anchors}}
    <li class="step-item">
      <a class="step-link" href="#{{anchorId}}">
        <span class="step-number">{{@index}}</span>
        <span class="step-label">{{title}}</span>
      </a>
    </li>
    {{/anchors}}
  </ol>
</nav>`,
    },
    {
      label: 'Vertikale Sidebar',
      description: 'Seitennavigation in der Sidebar mit Abschnitts-Links',
      code: `<aside class="page-nav vertical-sidebar" aria-label="Seitennavigation">
  <nav>
    <p class="sidebar-nav-heading">Auf dieser Seite</p>
    <ul class="sidebar-nav-list">
      {{#anchors}}
      <li class="sidebar-nav-item">
        <a class="sidebar-nav-link" href="#{{anchorId}}">{{title}}</a>
      </li>
      {{/anchors}}
    </ul>
  </nav>
</aside>`,
    },
    {
      label: 'Pagination',
      description: 'Seitenzahlen-Navigation (Vorherige / Seiten / Nächste)',
      code: `<nav class="page-nav pagination" aria-label="Seitennavigation">
  <ul class="pagination-list">
    <li class="pagination-item prev">
      <a class="pagination-link" href="#" aria-label="Vorherige Seite">‹ Zurück</a>
    </li>
    {{#anchors}}
    <li class="pagination-item">
      <a class="pagination-link" href="#{{anchorId}}" aria-label="{{title}}">{{title}}</a>
    </li>
    {{/anchors}}
    <li class="pagination-item next">
      <a class="pagination-link" href="#" aria-label="Nächste Seite">Weiter ›</a>
    </li>
  </ul>
</nav>`,
    },
  ],
};

const TYPE_TABS = [
  { id: 'MAIN', label: 'Hauptnavigation', Icon: Globe },
  { id: 'PAGE', label: 'Seitennavigation', Icon: Anchor },
];

export default function NavigationView({ showToast }) {
  const [navType, setNavType] = useState('MAIN');
  const [navList, setNavList] = useState([]);
  const [editing, setEditing] = useState(null); // { id?, name, type, code, isNew }
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [navigationCssCode, setNavigationCssCode] = useState('');
  const [isSavingNavigationCss, setIsSavingNavigationCss] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadNavList = useCallback(() => {
    setIsLoading(true);
    fetch('/api/navigations')
      .then(r => r.json())
      .then(data => {
        setNavList(Array.isArray(data) ? data : []);
      })
      .catch(() => setNavList([]))
      .finally(() => setIsLoading(false));
  }, []);

  const loadOrCreateNavigationCss = useCallback(async () => {
    try {
      const listRes = await fetch('/api/css');
      const listData = await listRes.json();
      const files = Array.isArray(listData?.files) ? listData.files : [];
      const hasNavigationCss = files.some((f) => f?.source === 'extern_css' && f?.name === NAVIGATION_CSS_FILENAME);

      if (!hasNavigationCss) {
        const createRes = await fetch('/api/css', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: NAVIGATION_CSS_FILENAME, content: DEFAULT_NAVIGATION_CSS }),
        });
        const createData = await createRes.json().catch(() => ({}));
        if (!createRes.ok || !createData.success) {
          throw new Error(createData.error || 'navigation.css konnte nicht erstellt werden');
        }
        showToast('navigation.css wurde erstellt und ist im CSS-Menü verfügbar', 'success');
      }

      const fileRes = await fetch(`/api/css?file=${encodeURIComponent(NAVIGATION_CSS_FILENAME)}`);
      const fileData = await fileRes.json().catch(() => ({}));
      if (!fileRes.ok) {
        throw new Error(fileData.error || 'navigation.css konnte nicht geladen werden');
      }
      setNavigationCssCode(String(fileData.content || ''));
    } catch (e) {
      showToast(`Fehler bei navigation.css: ${e.message}`, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadNavList();
    loadOrCreateNavigationCss();
  }, [loadNavList, loadOrCreateNavigationCss]);

  async function handleSaveNavigationCss() {
    setIsSavingNavigationCss(true);
    try {
      const res = await fetch('/api/css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: NAVIGATION_CSS_FILENAME, content: navigationCssCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'navigation.css konnte nicht gespeichert werden');
      }
      showToast('navigation.css gespeichert', 'success');
    } catch (e) {
      showToast(`Fehler: ${e.message}`, 'error');
    } finally {
      setIsSavingNavigationCss(false);
    }
  }

  const filteredNav = navList.filter(n => n.type === navType);

  function handleNew() {
    const nav = { isNew: true, type: navType };
    setEditing(nav);
    setEditName('');
    setEditCode('');
    setShowPresets(true);
  }

  function handleEdit(navItem) {
    setIsLoading(true);
    fetch(`/api/navigations?id=${encodeURIComponent(navItem.id)}`)
      .then(r => r.json())
      .then(data => {
        setEditing(data);
        setEditName(data.name);
        setEditCode(data.code);
        setShowPresets(false);
      })
      .catch(err => showToast('Fehler beim Laden: ' + err.message, 'error'))
      .finally(() => setIsLoading(false));
  }

  function handleCancel() {
    setEditing(null);
    setEditName('');
    setEditCode('');
    setShowPresets(false);
  }

  async function handleSave() {
    if (!editName.trim()) {
      showToast('Bitte einen Namen eingeben', 'error');
      return;
    }
    if (!editCode.trim()) {
      showToast('Bitte Navigations-Code eingeben', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const isNew = editing?.isNew;
      const url = '/api/navigations';
      const method = isNew ? 'POST' : 'PUT';
      const body = isNew
        ? { name: editName.trim(), type: navType, code: editCode }
        : { id: editing.id, name: editName.trim(), code: editCode };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Unbekannter Fehler');
      }
      showToast(`Navigation "${editName.trim()}" gespeichert`, 'success');
      loadNavList();
      handleCancel();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActivate(navItem) {
    try {
      const res = await fetch('/api/navigations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: navItem.id, isActive: !navItem.isActive }),
      });
      if (!res.ok) throw new Error('Fehler beim Aktualisieren');
      showToast(navItem.isActive ? 'Deaktiviert' : `"${navItem.name}" aktiviert`, 'success');
      loadNavList();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }

  async function handleDelete(navItem) {
    if (!window.confirm(`Navigation "${navItem.name}" wirklich löschen?`)) return;
    try {
      const res = await fetch('/api/navigations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: navItem.id }),
      });
      if (!res.ok) throw new Error('Fehler beim Löschen');
      showToast(`"${navItem.name}" gelöscht`, 'success');
      if (editing && editing.id === navItem.id) handleCancel();
      loadNavList();
    } catch (e) {
      showToast('Fehler: ' + e.message, 'error');
    }
  }

  function applyPreset(preset) {
    setEditCode(preset.code);
    if (!editName) setEditName(preset.label);
    setShowPresets(false);
  }

  const currentPresets = PRESETS[navType] || [];

  return (
    <div className="nav-view">
      {/* ── Type Tabs ─────────────────────────────────────────────────────── */}
      <div className="nav-type-tabs">
        {TYPE_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`nav-type-tab ${navType === id ? 'active' : ''}`}
            onClick={() => { setNavType(id); handleCancel(); }}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="nav-body">
        {/* ── Left: Nav list ──────────────────────────────────────────────── */}
        <div className="nav-list-panel">
          <div className="nav-list-header">
            <h3 className="nav-list-title">
              {TYPE_TABS.find(t => t.id === navType)?.label}
            </h3>
            <button className="btn-icon-label" onClick={handleNew} title="Neue Navigation erstellen">
              <Plus size={15} /> Neu
            </button>
          </div>

          {isLoading && !editing ? (
            <div className="nav-empty-hint">Lädt…</div>
          ) : filteredNav.length === 0 ? (
            <div className="nav-empty-hint">
              Noch keine Navigationen dieses Typs.<br />
              <button className="nav-empty-cta" onClick={handleNew}>Erste Navigation erstellen</button>
            </div>
          ) : (
            <ul className="nav-template-list">
              {filteredNav.map(nav => (
                <li
                  key={nav.id}
                  className={`nav-template-card ${editing?.id === nav.id ? 'selected' : ''} ${nav.isActive ? 'is-active' : ''}`}
                >
                  <div className="nav-card-info">
                    <span className="nav-card-name">{nav.name}</span>
                    {nav.isResponsiveCombined && (
                      <span className="nav-responsive-badge" title="Kombiniertes Desktop/Mobile-Template erkannt">
                        Responsive Combo
                      </span>
                    )}
                    {nav.isActive && (
                      <span className="nav-active-badge">
                        <Check size={11} /> Aktiv
                      </span>
                    )}
                  </div>
                  <div className="nav-card-actions">
                    <button
                      className={`nav-card-btn activate ${nav.isActive ? 'deactivate' : ''}`}
                      onClick={() => handleActivate(nav)}
                      title={nav.isActive ? 'Deaktivieren' : 'Aktivieren'}
                    >
                      {nav.isActive ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    <button
                      className="nav-card-btn edit"
                      onClick={() => handleEdit(nav)}
                      title="Bearbeiten"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      className="nav-card-btn delete"
                      onClick={() => handleDelete(nav)}
                      title="Löschen"
                    >
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
            {/* Name input */}
            <div className="nav-editor-header">
              <input
                className="nav-name-input"
                type="text"
                placeholder="Name dieser Navigation…"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
              <div className="nav-editor-actions">
                <button
                  className="nav-card-btn"
                  onClick={() => setShowPresets(v => !v)}
                  title="Preset-Galerie"
                >
                  <Layout size={14} /> Presets
                </button>
                <button
                  className="nav-card-btn"
                  onClick={handleCancel}
                  title="Abbrechen"
                >
                  <X size={14} /> Abbrechen
                </button>
                <button
                  className="nav-card-btn save"
                  onClick={handleSave}
                  disabled={isSaving}
                  title="Speichern"
                >
                  <Check size={14} /> {isSaving ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </div>

            {/* Preset Gallery */}
            {showPresets && (
              <div className="nav-preset-gallery">
                <div className="nav-preset-gallery-head">
                  <span>Preset wählen</span>
                  <button className="preset-close" onClick={() => setShowPresets(false)}><X size={13} /></button>
                </div>
                <div className="nav-preset-grid">
                  {currentPresets.map(preset => (
                    <button
                      key={preset.label}
                      className="nav-preset-card"
                      onClick={() => applyPreset(preset)}
                    >
                      <span className="preset-name">{preset.label}</span>
                      <span className="preset-desc">{preset.description}</span>
                      <span className="preset-use">
                        Verwenden <ChevronRight size={12} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Editor + navigation.css split */}
            <div className="nav-editor-split">
              <div className="nav-editor-code">
                <div className="nav-panel-label">Mustache-Template</div>
                <div className="nav-monaco-wrap">
                  <CodeEditor
                    value={editCode}
                    onChange={setEditCode}
                    language="html"
                    height="100%"
                  />
                </div>
              </div>
              <div className="nav-editor-preview">
                <div className="nav-panel-label">navigation.css</div>
                <div className="nav-monaco-wrap">
                  <CodeEditor
                    value={navigationCssCode}
                    onChange={value => setNavigationCssCode(value || '')}
                    language="css"
                    height="100%"
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    className="nav-card-btn save"
                    onClick={handleSaveNavigationCss}
                    disabled={isSavingNavigationCss}
                    title="navigation.css speichern"
                  >
                    <Check size={14} /> {isSavingNavigationCss ? 'Speichert…' : 'navigation.css speichern'}
                  </button>
                </div>
                <div className="nav-preview-hint">
                  Diese Datei liegt in <code>public/extern_css/navigation.css</code> und erscheint automatisch im CSS-Menü.
                </div>
                <div className="nav-preview-hint">
                  Responsive-Workflow: Mobile Navigation wird im MAIN-Template über <code>.desktop_nav</code> und <code>.mobile_nav</code> per CSS abgebildet.
                </div>
              </div>
            </div>

            {/* Placeholder reference */}
            <div className="nav-placeholder-ref">
              <strong>Platzhalter:</strong>
              <code>{`{{{nav:main}}}`}</code> Hauptnavigation ·
              <code>{`{{{nav:page}}}`}</code> Seitennavigation
            </div>
          </div>
        ) : (
          <div className="nav-editor-panel nav-editor-empty">
            <Navigation size={40} strokeWidth={1} />
            <p>Navigation aus der Liste wählen oder eine neue erstellen.</p>
            <p className="nav-editor-empty-hint">
              Aktive Navigationen werden via <code>{`{{{nav:main}}}`}</code>,
              <code>{`{{{nav:page}}}`}</code> in
              Site-Templates eingebunden.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
