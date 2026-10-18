import React, { useState, useEffect } from 'react';
import { ArrowLeft, Eye, X } from '../lib/muiIcons';

// Gemeinsames Fokus-Layout für Editoren außerhalb des Seiten-Editors
// (Globale Seiten, Wartungsseiten, Blog-Beitrag): Toolbar oben, links
// Sidebar (Gliederung/Liste), Mitte Editor, rechts optionales Panel
// (Vorschau/Doku). Styles: styles/focus-editor.css (Präfix "ef-").
// Siehe docs/specs/editors-focus-layout.md.

// Ein/Aus-Zustand eines Seitenpanels, je Browser in localStorage gemerkt (Standard: zu).
export function usePanelToggle(storageKey) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { setOpen(localStorage.getItem(storageKey) === '1'); } catch (_e) {}
  }, [storageKey]);
  const toggle = () => setOpen((v) => {
    try { localStorage.setItem(storageKey, v ? '0' : '1'); } catch (_e) {}
    return !v;
  });
  return [open, toggle];
}

export function EditorToolbar({ onBack, backLabel = 'Zurück', title, subtitle, children }) {
  return (
    <>
      <div className="pe-toolbar-left">
        {onBack && (
          <button type="button" className="pe-tb-btn pe-tb-btn-back" onClick={onBack} aria-label={backLabel} title={backLabel}>
            <ArrowLeft size={14} /> Zurück
          </button>
        )}
        <div className="pe-toolbar-titlewrap">
          <span className="pe-toolbar-title">{title}</span>
          {subtitle ? <span className="pe-toolbar-slug">{subtitle}</span> : null}
        </div>
      </div>
      <div className="pe-toolbar-actions">{children}</div>
    </>
  );
}

export function PreviewToggleButton({ open, onClick, label = 'Vorschau', Icon = Eye }) {
  return (
    <button
      type="button"
      className={`pe-tb-btn${open ? ' pe-tb-btn-active' : ''}`}
      onClick={onClick}
      aria-pressed={open}
      aria-label={`${label} ${open ? 'ausblenden' : 'einblenden'}`}
      title={`${label} ${open ? 'ausblenden' : 'einblenden'}`}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

export function EditorPreviewPane({ html, title = 'Vorschau', sandbox = 'allow-scripts allow-same-origin', onRefresh, onClose }) {
  return (
    <div className="page-split-preview ef-preview">
      <div className="page-split-preview-head">
        <span className="page-split-preview-label">Live-Vorschau</span>
        <span className="ef-preview-actions">
          {onRefresh && (
            <button type="button" className="btn-modern-small hollow" onClick={onRefresh} title="Vorschau aktualisieren" aria-label="Vorschau aktualisieren">↻</button>
          )}
          {onClose && (
            <button type="button" className="pe-outline-icon-btn" onClick={onClose} title="Vorschau schließen" aria-label="Vorschau schließen"><X size={14} /></button>
          )}
        </span>
      </div>
      <iframe srcDoc={html} sandbox={sandbox} className="page-split-preview-iframe" title={title} />
    </div>
  );
}

export default function EditorShell({ sidebar, sidebarLabel, toolbar, previewPanel, fill = false, className = '', children }) {
  return (
    <div className={`ef-shell${fill ? ' ef-fill' : ''}${className ? ` ${className}` : ''}`}>
      <div className="pe-toolbar ef-toolbar">{toolbar}</div>
      <div className={`ef-body${sidebar ? ' has-sidebar' : ''}${previewPanel ? ' has-side' : ''}`}>
        {sidebar && <aside className="pe-outline ef-sidebar" aria-label={sidebarLabel}>{sidebar}</aside>}
        <div className="ef-main">{children}</div>
        {previewPanel && <div className="ef-side">{previewPanel}</div>}
      </div>
    </div>
  );
}
