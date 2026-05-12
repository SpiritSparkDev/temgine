import React, { useState } from 'react';
import { X, Save, Rss, Layout, AlertTriangle } from '../lib/muiIcons';

const slugify = (v) =>
  String(v || '').toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');

function isMasterTemplate(tpl) {
  const role = String(tpl?.blogRole || '').toLowerCase();
  if (role === 'master') return true;
  const blogType = String(tpl?.blogType || '').toLowerCase();
  return blogType === 'master' || blogType === 'reading';
}

export default function BlogChannelEditor({ channel, templates = [], onSave, onClose }) {
  const [name, setName] = useState(channel?.name ?? '');
  const [slug, setSlug] = useState(channel?.slug ?? '');
  const [description, setDescription] = useState(channel?.description ?? '');
  const [masterTemplate, setMasterTemplate] = useState(
    channel?.templateReading ?? channel?.templateDetailPreview ?? channel?.templateSimplePreview ?? channel?.templateArchiveEntry ?? ''
  );
  const [slugManual, setSlugManual] = useState(!!channel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const masterTemplates = templates.filter(t => (t.type === 'BLOCK' || !t.type) && isMasterTemplate(t));

  function handleNameChange(v) {
    setName(v);
    if (!slugManual) setSlug(slugify(v));
  }

  function handleSlugChange(v) {
    setSlugManual(true);
    setSlug(slugify(v));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name ist erforderlich'); return; }
    if (!slug.trim()) { setError('Slug ist erforderlich'); return; }
    setSaving(true);
    const ok = await onSave({
      ...(channel ? { id: channel.id } : {}),
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || null,
      // Legacy compatibility: existing renderer still reads slot fields.
      // Restricting assignment to a single master keeps workflow simple.
      templateReading: masterTemplate || null,
      templateDetailPreview: masterTemplate || null,
      templateSimplePreview: masterTemplate || null,
      templateArchiveEntry: masterTemplate || null,
    });
    setSaving(false);
    if (!ok) setError('Fehler beim Speichern');
  }

  return (
    <div className="blog-modal-overlay" onClick={onClose}>
      <div className="blog-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="blog-modal__header">
          <div className="blog-modal__header-icon">
            <Rss size={16} />
          </div>
          <h3 className="blog-modal__title">
            {channel ? 'Kanal bearbeiten' : 'Neuer Kanal'}
          </h3>
          <button className="blog-modal__close" onClick={onClose} title="Schließen">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="blog-modal__body">
            {error && (
              <div className="blog-modal__error">
                <AlertCircle size={15} />
                {error}
              </div>
            )}

            {/* Grunddaten */}
            <div className="blog-modal__section-head">
              <Rss size={11} /> Grunddaten
            </div>

            <div className="blog-form-row">
              <div className="blog-form-field">
                <label className="blog-form-label">
                  Name <span className="blog-form-label__required">*</span>
                </label>
                <input
                  className="blog-form-input"
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="z. B. Tech-Blog"
                  autoFocus
                />
              </div>

              <div className="blog-form-field">
                <label className="blog-form-label">
                  Slug <span className="blog-form-label__required">*</span>
                  <span className="blog-form-label__hint">→ URL-Pfad</span>
                </label>
                <input
                  className="blog-form-input"
                  value={slug}
                  onChange={e => handleSlugChange(e.target.value)}
                  placeholder="tech-blog"
                  style={{ fontFamily: 'Fira Code, monospace', fontSize: 13 }}
                />
              </div>
            </div>

            <div className="blog-form-field">
              <label className="blog-form-label">Beschreibung</label>
              <textarea
                className="blog-form-textarea"
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Kurze Beschreibung des Kanals (optional)"
              />
            </div>

            {/* Template-Zuweisung */}
            <div className="blog-modal__section-head">
              <Layout size={11} /> Template-Zuweisung
            </div>

            <div className="template-slot-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="template-slot-card">
                <div className="template-slot-card__label">
                  <span style={{ fontSize: 14 }}>▤</span>
                  Master-Template
                </div>
                <select
                  className="blog-form-select"
                  value={masterTemplate}
                  onChange={e => setMasterTemplate(e.target.value)}
                >
                  <option value="">(kein Template)</option>
                  {masterTemplates.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
                <p className="template-slot-card__hint">
                  Der Kanal nutzt ein Master-Template. Vorschauen werden daraus abgeleitet.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="blog-modal__footer">
            <button type="button" className="blog-btn blog-btn--secondary" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="blog-btn blog-btn--primary" disabled={saving}>
              <Save size={14} />
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
