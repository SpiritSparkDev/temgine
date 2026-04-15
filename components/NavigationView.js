import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2, Edit2, Check, X, Navigation, Anchor, Smartphone, Globe, Layout, ChevronRight } from 'lucide-react';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

// ── Sample data for live preview ────────────────────────────────────────────
const SAMPLE_DATA = {
  main: {
    pages: [
      { slug: 'startseite', title: 'Startseite', hasChildren: false, children: [] },
      { slug: 'ueber-uns', title: 'Über uns', hasChildren: true, children: [
        { slug: 'ueber-uns/team', title: 'Team', hasChildren: false, children: [] },
        { slug: 'ueber-uns/geschichte', title: 'Geschichte', hasChildren: false, children: [] },
      ]},
      { slug: 'leistungen', title: 'Leistungen', hasChildren: true, children: [
        { slug: 'leistungen/webdesign', title: 'Webdesign', hasChildren: false, children: [] },
        { slug: 'leistungen/seo', title: 'SEO', hasChildren: false, children: [] },
        { slug: 'leistungen/beratung', title: 'Beratung', hasChildren: false, children: [] },
      ]},
      { slug: 'blog', title: 'Blog', hasChildren: false, children: [] },
      { slug: 'kontakt', title: 'Kontakt', hasChildren: false, children: [] },
    ],
  },
  page: {
    anchors: [
      { anchorId: 'einleitung', title: 'Einleitung' },
      { anchorId: 'hauptteil', title: 'Hauptteil' },
      { anchorId: 'ergebnisse', title: 'Ergebnisse' },
      { anchorId: 'fazit', title: 'Fazit' },
    ],
  },
  mobile: {
    pages: [
      { slug: 'startseite', title: 'Startseite', hasChildren: false, children: [] },
      { slug: 'ueber-uns', title: 'Über uns', hasChildren: true, children: [
        { slug: 'ueber-uns/team', title: 'Team', hasChildren: false, children: [] },
        { slug: 'ueber-uns/geschichte', title: 'Geschichte', hasChildren: false, children: [] },
      ]},
      { slug: 'leistungen', title: 'Leistungen', hasChildren: true, children: [
        { slug: 'leistungen/webdesign', title: 'Webdesign', hasChildren: false, children: [] },
        { slug: 'leistungen/seo', title: 'SEO', hasChildren: false, children: [] },
      ]},
      { slug: 'kontakt', title: 'Kontakt', hasChildren: false, children: [] },
    ],
  },
};

// ── Presets ──────────────────────────────────────────────────────────────────
const PRESETS = {
  MAIN: [
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
  MOBILE: [
    {
      label: 'Hamburger Full-Screen',
      description: 'Vollbild-Overlay mit Hamburger-Button',
      code: `<div class="mobile-nav fullscreen-nav">
  <button class="hamburger-btn" aria-label="Menü öffnen" onclick="this.closest('.mobile-nav').classList.toggle('open')">
    <span></span><span></span><span></span>
  </button>
  <div class="fullscreen-overlay">
    <button class="overlay-close" aria-label="Menü schließen" onclick="this.closest('.mobile-nav').classList.remove('open')">✕</button>
    <ul class="fullscreen-list">
      {{#pages}}
      <li class="{{#hasChildren}}has-children{{/hasChildren}}">
        <a class="fullscreen-link" href="/{{slug}}">{{title}}</a>
        {{#hasChildren}}
        <ul class="fullscreen-sub">
          {{#children}}<li><a href="/{{slug}}">{{title}}</a></li>{{/children}}
        </ul>
        {{/hasChildren}}
      </li>
      {{/pages}}
    </ul>
  </div>
</div>`,
    },
    {
      label: 'Slide-in Drawer',
      description: 'Slide-in Schublade von links',
      code: `<div class="mobile-nav drawer-nav">
  <button class="drawer-toggle" aria-label="Menü öffnen" onclick="this.closest('.mobile-nav').classList.toggle('open')">☰</button>
  <div class="drawer-backdrop" onclick="this.closest('.mobile-nav').classList.remove('open')"></div>
  <aside class="drawer-panel">
    <div class="drawer-header">
      <span class="drawer-brand">Menü</span>
      <button class="drawer-close" aria-label="Menü schließen" onclick="this.closest('.mobile-nav').classList.remove('open')">✕</button>
    </div>
    <ul class="drawer-list">
      {{#pages}}
      <li class="drawer-item{{#hasChildren}} has-children{{/hasChildren}}">
        <a class="drawer-link" href="/{{slug}}">{{title}}</a>
        {{#hasChildren}}
        <ul class="drawer-sub">
          {{#children}}<li><a href="/{{slug}}">{{title}}</a></li>{{/children}}
        </ul>
        {{/hasChildren}}
      </li>
      {{/pages}}
    </ul>
  </aside>
</div>`,
    },
    {
      label: 'Bottom Bar',
      description: 'Navigation am unteren Bildschirmrand',
      code: `<nav class="mobile-nav bottom-bar" aria-label="Hauptnavigation">
  <ul class="bottom-bar-list">
    {{#pages}}
    <li class="bottom-bar-item">
      <a class="bottom-bar-link" href="/{{slug}}">
        <span class="bottom-bar-icon" aria-hidden="true">○</span>
        <span class="bottom-bar-label">{{title}}</span>
      </a>
    </li>
    {{/pages}}
  </ul>
</nav>`,
    },
    {
      label: 'Accordion',
      description: 'Ausklappbare Sektion-Navigation mit Unterseiten',
      code: `<nav class="mobile-nav accordion-nav" aria-label="Hauptnavigation">
  <ul class="accordion-list">
    {{#pages}}
    <li class="accordion-item{{#hasChildren}} has-children{{/hasChildren}}">
      {{#hasChildren}}
      <button class="accordion-toggle" onclick="this.closest('.accordion-item').classList.toggle('open')">
        {{title}} <span class="accordion-arrow" aria-hidden="true">›</span>
      </button>
      <ul class="accordion-sub">
        {{#children}}<li><a class="accordion-sub-link" href="/{{slug}}">{{title}}</a></li>{{/children}}
      </ul>
      {{/hasChildren}}
      {{^hasChildren}}<a class="accordion-link" href="/{{slug}}">{{title}}</a>{{/hasChildren}}
    </li>
    {{/pages}}
  </ul>
</nav>`,
    },
  ],
};

const TYPE_TABS = [
  { id: 'MAIN', label: 'Hauptnavigation', Icon: Globe },
  { id: 'PAGE', label: 'Seitennavigation', Icon: Anchor },
  { id: 'MOBILE', label: 'Mobile Navigation', Icon: Smartphone },
];

export default function NavigationView({ showToast }) {
  const [navType, setNavType] = useState('MAIN');
  const [navList, setNavList] = useState([]);
  const [editing, setEditing] = useState(null); // { id?, name, type, code, isNew }
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
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

  useEffect(() => { loadNavList(); }, [loadNavList]);

  // Live preview: re-render whenever code changes
  useEffect(() => {
    if (!editing) { setPreviewHtml(''); return; }
    try {
      // Dynamic import of Mustache to avoid SSR issues
      import('mustache').then(({ default: Mustache }) => {
        const sampleData = SAMPLE_DATA[editing.type?.toLowerCase() || navType.toLowerCase()] || {};
        const rendered = Mustache.render(String(editCode || ''), sampleData);
        setPreviewHtml(rendered);
      }).catch(() => setPreviewHtml(editCode));
    } catch (e) {
      setPreviewHtml(editCode);
    }
  }, [editCode, editing, navType]);

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

            {/* Editor + Preview split */}
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
                <div className="nav-panel-label">Live-Vorschau</div>
                <div
                  className="nav-preview-container"
                  dangerouslySetInnerHTML={{ __html: previewHtml || '<p style="color:#999;padding:1rem">Vorschau erscheint beim Bearbeiten…</p>' }}
                />
                <div className="nav-preview-hint">
                  Vorschau mit Beispieldaten — echte Daten kommen zur Laufzeit
                </div>
              </div>
            </div>

            {/* Placeholder reference */}
            <div className="nav-placeholder-ref">
              <strong>Platzhalter:</strong>
              <code>{`{{{nav:main}}}`}</code> Hauptnavigation ·
              <code>{`{{{nav:page}}}`}</code> Seitennavigation ·
              <code>{`{{{nav:mobile}}}`}</code> Mobile Navigation
            </div>
          </div>
        ) : (
          <div className="nav-editor-panel nav-editor-empty">
            <Navigation size={40} strokeWidth={1} />
            <p>Navigation aus der Liste wählen oder eine neue erstellen.</p>
            <p className="nav-editor-empty-hint">
              Aktive Navigationen werden via <code>{`{{{nav:main}}}`}</code>,
              <code>{`{{{nav:page}}}`}</code> oder <code>{`{{{nav:mobile}}}`}</code> in
              Site-Templates eingebunden.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
