import React, { useState, useMemo } from 'react';
import { ChevronLeft, Save, FileText, ImageIcon, User, Clock, Tag, Rss, SlidersHorizontal } from '../lib/muiIcons';
import RichTextEditor from './RichTextEditor';

const STATUS_OPTIONS = [
  { value: 'DRAFT',     label: 'Entwurf',                   color: '#64748b' },
  { value: 'REVIEW',    label: 'Review',                    color: '#f59e0b' },
  { value: 'APPROVED',  label: 'Freigegeben',               color: '#3b82f6' },
  { value: 'PUBLISHED', label: 'Veröffentlicht',            color: '#10b981' },
  { value: 'SCHEDULED', label: 'Geplant (Datum erforderlich)', color: '#8b5cf6' },
];

// Fields handled by fixed UI — never go into templateData
const FIXED_FIELDS = new Set(['title', 'slug', 'excerpt', 'body', 'coverImage', 'author',
  'status', 'publishAt', 'publishedAt', 'channelSlug', 'channelUrl', 'postUrl',
  'id', 'channelId', 'createdAt', 'updatedAt']);

const slugify = (v) =>
  String(v || '').toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');

// Extract {{varName}} placeholders from template HTML
function extractVarsFromCode(code) {
  if (!code) return [];
  const seen = new Set();
  const result = [];
  const re = /\{\{([^{}#^/!>]+?)\}\}/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const raw = m[1].trim();
    const colon = raw.indexOf(':');
    const name = colon !== -1 ? raw.slice(0, colon).trim() : raw;
    if (name && !name.startsWith('nav:') && !name.startsWith('each:') && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export default function BlogPostEditor({ post, channelSlug, channelName, onSave, onBack, readingTemplateCode }) {
  const [title, setTitle]           = useState(post?.title ?? '');
  const [slug, setSlug]             = useState(post?.slug ?? '');
  const [excerpt, setExcerpt]       = useState(post?.excerpt ?? '');
  const [body, setBody]             = useState(post?.body ?? '');
  const [coverImage, setCoverImage] = useState(post?.coverImage ?? '');
  const [author, setAuthor]         = useState(post?.author ?? '');
  const [status, setStatus]         = useState(post?.status ?? 'DRAFT');
  const [publishAt, setPublishAt]   = useState(
    post?.publishAt ? new Date(post.publishAt).toISOString().slice(0, 16) : ''
  );
  const [slugManual, setSlugManual] = useState(!!post);
  const [saving, setSaving]         = useState(false);
  const [errors, setErrors]         = useState({});
  // templateData holds values for custom vars from the reading template
  const [templateData, setTemplateData] = useState(post?.templateData ?? {});

  // Derive custom fields from the reading template code
  const customFields = useMemo(() => {
    const vars = extractVarsFromCode(readingTemplateCode);
    return vars.filter(v => !FIXED_FIELDS.has(v));
  }, [readingTemplateCode]);

  function handleTitleChange(v) {
    setTitle(v);
    if (!slugManual) setSlug(slugify(v));
  }

  function setCustomField(key, value) {
    setTemplateData(prev => ({ ...prev, [key]: value }));
  }

  function validate() {
    const errs = {};
    if (!title.trim()) errs.title = 'Titel ist erforderlich';
    if (!slug.trim())  errs.slug  = 'Slug ist erforderlich';
    if (status === 'SCHEDULED' && !publishAt) errs.publishAt = 'Datum ist für „Geplant" erforderlich';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSaving(true);
    await onSave({
      ...(post ? { id: post.id } : {}),
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim() || null,
      body: body || null,
      coverImage: coverImage.trim() || null,
      author: author.trim() || null,
      status,
      publishAt: publishAt || null,
      templateData: Object.keys(templateData).length > 0 ? templateData : null,
    });
    setSaving(false);
  }

  const currentStatus = STATUS_OPTIONS.find(o => o.value === status);

  return (
    <div className="blog-post-editor">
      {/* Top bar */}
      <div className="blog-topbar">
        <button className="blog-topbar__back" onClick={onBack} title="Zurück zur Beitragsliste">
          <ChevronLeft size={16} />
        </button>
        <div className="blog-topbar__breadcrumb">
          <Rss size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span className="blog-topbar__channel">{channelName || channelSlug}</span>
          <span className="blog-topbar__sep">/</span>
          <span className="blog-topbar__sub">{post ? title || 'Beitrag bearbeiten' : 'Neuer Beitrag'}</span>
        </div>
        <div className="blog-topbar__actions">
          {currentStatus && (
            <span
              className="blog-status-badge"
              style={{
                background: currentStatus.color + '22',
                color: currentStatus.color,
                border: `1px solid ${currentStatus.color}44`,
              }}
            >
              {currentStatus.label}
            </span>
          )}
          <button className="btn-modern" form="blog-post-form" type="submit" disabled={saving}>
            <Save size={14} /> {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>

      {/* Editor body */}
      <div className="blog-editor-body">
        <form id="blog-post-form" onSubmit={handleSubmit}>
          <div className="blog-editor-layout">

            {/* ── Main column ── */}
            <div className="blog-editor-main">

              {/* Title + Slug */}
              <div className="blog-editor-card">
                <div className="blog-editor-card__head">
                  <FileText size={12} /> Grunddaten
                </div>
                <div className="blog-editor-card__body">
                  <div className="blog-editor-field">
                    <label className="blog-editor-label">
                      Titel <span className="blog-editor-label__required">*</span>
                    </label>
                    <input
                      className={`blog-editor-input${errors.title ? ' has-error' : ''}`}
                      value={title}
                      onChange={e => handleTitleChange(e.target.value)}
                      placeholder="Mein erster Beitrag"
                      autoFocus
                    />
                    {errors.title && <div className="blog-editor-error">{errors.title}</div>}
                  </div>

                  <div className="blog-editor-field">
                    <label className="blog-editor-label">
                      Slug <span className="blog-editor-label__required">*</span>
                      <span className="blog-editor-label__hint">/{channelSlug}/…</span>
                    </label>
                    <input
                      className={`blog-editor-input blog-editor-input-mono${errors.slug ? ' has-error' : ''}`}
                      value={slug}
                      onChange={e => { setSlugManual(true); setSlug(slugify(e.target.value)); }}
                      placeholder="mein-erster-beitrag"
                    />
                    {errors.slug && <div className="blog-editor-error">{errors.slug}</div>}
                  </div>

                  <div className="blog-editor-field">
                    <label className="blog-editor-label">
                      Excerpt
                      <span className="blog-editor-label__hint">Kurzbeschreibung für Vorschaukarten</span>
                    </label>
                    <textarea
                      className="blog-editor-textarea"
                      rows={2}
                      value={excerpt}
                      onChange={e => setExcerpt(e.target.value)}
                      placeholder="Eine kurze Zusammenfassung…"
                    />
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="blog-editor-card">
                <div className="blog-editor-card__head">
                  <Tag size={12} /> Inhalt
                </div>
                <div className="blog-editor-card__body" style={{ padding: '12px 14px' }}>
                  <RichTextEditor
                    value={body}
                    onChange={setBody}
                    toolbar={['bold', 'italic', 'strike', 'h1', 'h2', 'h3', 'ol', 'ul', 'blockquote', 'code', 'link', 'image', 'clear']}
                  />
                </div>
              </div>

              {/* Custom template fields (from reading template) */}
              {customFields.length > 0 && (
                <div className="blog-editor-card">
                  <div className="blog-editor-card__head">
                    <Sliders size={12} /> Template-Felder
                    <span className="blog-editor-card__head-hint">aus Leseseite-Template</span>
                  </div>
                  <div className="blog-editor-card__body">
                    {customFields.map(field => (
                      <div key={field} className="blog-editor-field">
                        <label className="blog-editor-label">
                          <code style={{ fontSize: 11, fontFamily: 'Fira Code, monospace', opacity: .75 }}>{`{{${field}}}`}</code>
                        </label>
                        <input
                          className="blog-editor-input"
                          value={templateData[field] ?? ''}
                          onChange={e => setCustomField(field, e.target.value)}
                          placeholder={field}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Sidebar ── */}
            <div className="blog-editor-sidebar">

              {/* Status & Datum */}
              <div className="blog-editor-card">
                <div className="blog-editor-card__head">
                  <Clock size={12} /> Status & Zeitplan
                </div>
                <div className="blog-editor-card__body">
                  <div className="blog-editor-field">
                    <label className="blog-editor-label">Status</label>
                    <select
                      className="blog-editor-select"
                      value={status}
                      onChange={e => setStatus(e.target.value)}
                      style={{ borderColor: currentStatus?.color + '66' }}
                    >
                      {STATUS_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="blog-editor-field">
                    <label className="blog-editor-label">
                      Veröffentlichung
                      {status === 'SCHEDULED' && <span className="blog-editor-label__required"> *</span>}
                    </label>
                    <input
                      className={`blog-editor-input${errors.publishAt ? ' has-error' : ''}`}
                      type="datetime-local"
                      value={publishAt}
                      onChange={e => setPublishAt(e.target.value)}
                    />
                    {errors.publishAt && <div className="blog-editor-error">{errors.publishAt}</div>}
                  </div>
                </div>
              </div>

              {/* Cover image */}
              <div className="blog-editor-card">
                <div className="blog-editor-card__head">
                  <ImageIcon size={12} /> Cover-Bild
                </div>
                <div className="blog-editor-card__body">
                  {coverImage ? (
                    <img className="blog-editor-cover-preview" src={coverImage} alt="Cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="blog-editor-cover-placeholder">
                      <ImageIcon size={16} /> Kein Bild
                    </div>
                  )}
                  <div className="blog-editor-field">
                    <label className="blog-editor-label">Pfad oder URL</label>
                    <input
                      className="blog-editor-input"
                      value={coverImage}
                      onChange={e => setCoverImage(e.target.value)}
                      placeholder="/uploads/bild.jpg"
                    />
                  </div>
                </div>
              </div>

              {/* Author */}
              <div className="blog-editor-card">
                <div className="blog-editor-card__head">
                  <User size={12} /> Autor
                </div>
                <div className="blog-editor-card__body">
                  <div className="blog-editor-field">
                    <input
                      className="blog-editor-input"
                      value={author}
                      onChange={e => setAuthor(e.target.value)}
                      placeholder="Max Mustermann"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </form>
      </div>
    </div>
  );
}
