// Bausteine der Einstellungsseite (components/SettingsView.js, components/PluginsPanel.js).
import React from 'react';

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`st-toggle${checked ? ' is-on' : ''}`}
    >
      <span />
    </button>
  );
}

// Karte mit Titel/Beschreibung; Inhalt sind Zeilen (Row) oder freie Elemente
export function Card({ title, description, children, footer }) {
  return (
    <section className="st-card">
      <header className="st-card-head">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      <div className="st-card-body">{children}</div>
      {footer && <footer className="st-card-foot">{footer}</footer>}
    </section>
  );
}

// Zeile: links Label + Hilfetext, rechts das Bedienelement
export function Row({ label, hint, children, stacked }) {
  return (
    <div className={`st-row${stacked ? ' is-stacked' : ''}`}>
      <div className="st-row-label">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </div>
      <div className="st-row-control">{children}</div>
    </div>
  );
}

export function SaveButton({ onClick, saving, children = 'Speichern' }) {
  return (
    <button type="button" className="st-btn st-btn-primary" onClick={onClick} disabled={saving}>
      {saving ? 'Speichern…' : children}
    </button>
  );
}
