import React, { useState, useMemo, useEffect } from 'react';
import { Save, FileText, ImageIcon, User, Clock, Tag, SlidersHorizontal } from '../lib/muiIcons';
import SmartRichTextEditor from './SmartRichTextEditor';
import { useRichTextEditorMode } from '../lib/useRichTextEditorMode';
import { resolveTemplateFields } from '../lib/templateFieldResolver';
import { formatFieldLabel, SimpleFieldInput, RepeaterSectionEditor } from './TemplateFieldEditors';
import SeoPanel from './SeoPanel';
import { renderTemplate } from '../lib/templateEngine';
import { withDateParts } from '../lib/blogPostQuery';
import { loadGlobalVars } from '../lib/renderPipeline';
import EditorShell, { EditorToolbar, PreviewToggleButton, EditorPreviewPane, usePanelToggle } from './EditorShell';

const STATUS_OPTIONS = [
  { value: 'DRAFT',     label: 'Entwurf',                   color: '#64748b' },
  { value: 'REVIEW',    label: 'In Prüfung',                color: '#f59e0b' },
  { value: 'APPROVED',  label: 'Freigegeben',               color: '#3b82f6' },
  { value: 'PUBLISHED', label: 'Veröffentlicht',            color: '#10b981' },
  { value: 'SCHEDULED', label: 'Geplant (Datum erforderlich)', color: '#8b5cf6' },
];

const slugify = (v) =>
  String(v || '').toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');

export default function BlogPostEditor({ post, channelSlug, channelName, onSave, onBack, readingTemplateCode }) {
  // Fokus-Layout (components/EditorShell.js): Abschnitts-Sidebar, einspaltige Felder, Vorschau als Seitenpanel.
  const [previewOpen, togglePreview] = usePanelToggle('blog-preview-panel');
  const [previewHtml, setPreviewHtml] = useState('');
  const [enabledCssFiles, setEnabledCssFiles] = useState([]);
  const [globalVars, setGlobalVars] = useState({});

  const richTextEditorMode = useRichTextEditorMode();
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

  const fieldSchema = useMemo(
    () => resolveTemplateFields(readingTemplateCode),
    [readingTemplateCode]
  );
  const templateVarSet = fieldSchema.fieldSet;
  const hasTemplateVar = (name) => {
    const needle = String(name || '').toLowerCase();
    for (const v of templateVarSet) {
      if (String(v).toLowerCase() === needle) return true;
    }
    return false;
  };

  const showTitleField = hasTemplateVar('title');
  const showSlugField = hasTemplateVar('slug');
  const showExcerptField = hasTemplateVar('excerpt');
  const showBodyField = hasTemplateVar('body');
  const showCoverField = hasTemplateVar('coverImage');
  const showAuthorField = hasTemplateVar('author');

  const customFields = fieldSchema.customFields;
  const customFieldTypeByName = fieldSchema.customFieldTypeByName;
  const groupedCustomFields = fieldSchema.customGroups;

  function handleTitleChange(v) {
    setTitle(v);
    if (!slugManual) setSlug(slugify(v));
  }

  function setCustomField(key, value) {
    setTemplateData(prev => ({ ...prev, [key]: value }));
  }

  function setRepeaterRows(sectionName, rows) {
    setTemplateData(prev => ({ ...prev, [sectionName]: rows }));
  }

  // Aktivierte CSS-Dateien und globale Variablen für die Live-Vorschau — wie
  // in PageEditor.js (siehe dort buildSplitPreviewHtml) einmalig geladen.
  useEffect(() => {
    fetch('/api/css')
      .then(r => r.json())
      .then(data => setEnabledCssFiles((data.files || []).filter(f => f.enabled !== false)))
      .catch(() => {});
    loadGlobalVars().then(setGlobalVars);
  }, []);

  // Rendert das Lese-Template mit denselben Daten wie die öffentliche Beitragsseite
  // (siehe pages/[...slug].js) — inkl. {{global.x}}, damit die Vorschau Render-Parität
  // zur echten Seite hat. Eigene Felder (templateData) überschreiben Basis-Felder
  // gleichen Namens, genau wie /api/blog/public/.../... es für den Live-Betrieb tut.
  function buildPreviewHtml() {
    try {
      if (!readingTemplateCode) {
        return '<!DOCTYPE html><html><body><p style="padding:16px;color:#888;font-family:sans-serif">Kein Lese-Template für diesen Kanal hinterlegt.</p></body></html>';
      }
      const mergedPost = {
        ...(post || {}),
        title, slug, excerpt, body, coverImage, author, status,
        publishAt: publishAt || null,
        ...templateData,
      };
      const rendered = renderTemplate(readingTemplateCode, {
        ...withDateParts(mergedPost),
        channel: { slug: channelSlug, name: channelName },
        channelUrl: `/${channelSlug}`,
        postUrl: `/${channelSlug}/${slug || 'beitrag'}`,
        global: globalVars,
      }, { title }); // Titel als Text, nicht als Markdown (siehe hydrateBlogChannels)

      const cssLinkTags = enabledCssFiles
        .map(f => `    <link rel="stylesheet" href="${String(f.href || '').replace(/"/g, '&quot;')}">`)
        .join('\n');
      return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title || 'Vorschau'}</title>\n${cssLinkTags}</head><body>${rendered}</body></html>`;
    } catch (e) {
      console.error('buildPreviewHtml (Blog) failed:', e);
      return `<!DOCTYPE html><html><body><pre style="color:red;padding:16px">${String(e)}</pre></body></html>`;
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setPreviewHtml(buildPreviewHtml()), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, slug, excerpt, body, coverImage, author, status, publishAt, templateData, readingTemplateCode, enabledCssFiles, globalVars, channelSlug, channelName]);

  function validate() {
    const errs = {};
    if (showTitleField && !title.trim()) errs.title = 'Titel ist erforderlich';
    if (showSlugField && !slug.trim()) errs.slug  = 'Slug ist erforderlich';
    if (status === 'SCHEDULED' && !publishAt) errs.publishAt = 'Datum ist für „Geplant" erforderlich';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSaving(true);
    const safeTitle = showTitleField ? title.trim() : (title.trim() || 'Beitrag');
    const safeSlug = showSlugField ? slug.trim() : (slug.trim() || slugify(safeTitle || 'beitrag'));
    await onSave({
      ...(post ? { id: post.id } : {}),
      title: safeTitle,
      slug: safeSlug,
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

  const sections = [
    (showTitleField || showSlugField || showExcerptField) && { id: 'basis', label: 'Grunddaten' },
    showBodyField && { id: 'inhalt', label: 'Inhalt' },
    customFields.length > 0 && { id: 'felder', label: 'Template-Felder' },
    ...fieldSchema.repeaterBlocks.map(({ sectionName }) => ({ id: `rep-${sectionName}`, label: formatFieldLabel(sectionName) })),
    { id: 'status', label: 'Status & Zeitplan' },
    showCoverField && { id: 'cover', label: 'Cover-Bild' },
    showAuthorField && { id: 'autor', label: 'Autor' },
    { id: 'seo', label: 'SEO' },
  ].filter(Boolean);
  const jumpTo = (id) => document.getElementById(`bp-sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <EditorShell
      sidebarLabel="Beitrags-Abschnitte"
      sidebar={(
        <div className="pe-tree">
          <ul className="ef-list flat" aria-label="Abschnitte des Beitrags">
            {sections.map(sec => (
              <li key={sec.id} className="ef-item">
                <button type="button" className="ef-item-btn" onClick={() => jumpTo(sec.id)}>
                  <span className="ef-item-name">{sec.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      toolbar={(
        <EditorToolbar
          onBack={onBack}
          backLabel="Zurück zur Beitragsliste"
          title={post ? title || 'Beitrag bearbeiten' : 'Neuer Beitrag'}
          subtitle={channelName || channelSlug}
        >
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
          <PreviewToggleButton open={previewOpen} onClick={togglePreview} />
          <button className="pe-tb-btn pe-tb-btn-primary" form="blog-post-form" type="submit" disabled={saving}>
            <Save size={14} /> {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </EditorToolbar>
      )}
      previewPanel={previewOpen ? (
        <EditorPreviewPane
          html={previewHtml}
          title="Beitrags-Vorschau"
          onRefresh={() => setPreviewHtml(buildPreviewHtml())}
          onClose={togglePreview}
        />
      ) : null}
    >
      <form id="blog-post-form" className="ef-blog-form" onSubmit={handleSubmit}>
            {/* ── Main column ── */}
            <div className="blog-editor-main">

              {/* Title + Slug */}
              {(showTitleField || showSlugField || showExcerptField) && (
                <div id="bp-sec-basis" className="blog-editor-card ef-blog-section">
                  <div className="blog-editor-card__head">
                    <FileText size={12} /> Grunddaten
                  </div>
                  <div className="blog-editor-card__body">
                    {showTitleField && (
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
                    )}

                    {showSlugField && (
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
                    )}

                    {showExcerptField && (
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
                    )}
                  </div>
                </div>
              )}

              {/* Body */}
              {showBodyField && (
                <div id="bp-sec-inhalt" className="blog-editor-card ef-blog-section">
                  <div className="blog-editor-card__head">
                    <Tag size={12} /> Inhalt
                  </div>
                  <div className="blog-editor-card__body" style={{ padding: '12px 14px' }}>
                    <SmartRichTextEditor
                      mode={richTextEditorMode}
                      label="Inhalt"
                      value={body}
                      onChange={setBody}
                      toolbar={['bold', 'italic', 'strike', 'h1', 'h2', 'h3', 'ol', 'ul', 'blockquote', 'code', 'link', 'image', 'clear']}
                    />
                  </div>
                </div>
              )}

              {/* Custom template fields (from reading template) */}
              {customFields.length > 0 && (
                <div id="bp-sec-felder" className="blog-editor-card ef-blog-section">
                  <div className="blog-editor-card__head">
                    <SlidersHorizontal size={12} /> Template-Felder
                    <span className="blog-editor-card__head-hint">aus Master-Template</span>
                  </div>
                  <div className="blog-editor-card__body">
                    {groupedCustomFields.map(group => (
                      <div key={group.key} className="blog-editor-template-group">
                        {group.label && <div className="blog-editor-template-group__label">{group.label}</div>}
                        {group.fields.map(field => (
                          <SimpleFieldInput
                            key={field}
                            varName={field}
                            inputType={customFieldTypeByName.get(String(field).toLowerCase()) || 'text'}
                            label={formatFieldLabel(field)}
                            value={templateData[field] ?? ''}
                            onChange={(val) => setCustomField(field, val)}
                            richTextEditorMode={richTextEditorMode}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Repeater fields: {{#each:name}}...{{/each:name}} from the reading template */}
              {fieldSchema.repeaterBlocks.map(({ sectionName, subFields }) => {
                const rows = Array.isArray(templateData[sectionName]) ? templateData[sectionName] : [];
                return (
                  <div key={sectionName} id={`bp-sec-rep-${sectionName}`} className="blog-editor-card ef-blog-section">
                    <div className="blog-editor-card__head">
                      <SlidersHorizontal size={12} /> {formatFieldLabel(sectionName)}
                    </div>
                    <div className="blog-editor-card__body">
                      <RepeaterSectionEditor
                        sectionName={sectionName}
                        subFields={subFields}
                        rows={rows}
                        onRowsChange={(next) => setRepeaterRows(sectionName, next)}
                        richTextEditorMode={richTextEditorMode}
                        showSectionLabel={false}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Status, Cover, Autor, SEO ── */}
            <div className="blog-editor-sidebar">

              {/* Status & Datum */}
              <div id="bp-sec-status" className="blog-editor-card ef-blog-section">
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
              {showCoverField && (
                <div id="bp-sec-cover" className="blog-editor-card ef-blog-section">
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
              )}

              {/* Author */}
              {showAuthorField && (
                <div id="bp-sec-autor" className="blog-editor-card ef-blog-section">
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
              )}

              {/* SEO — eigenes Bauteil wie im Seiten-Editor, verwaltet seinen
                  Auf-/Zuklapp-Zustand selbst. Overrides liegen unter
                  templateData.seo (genau wie page.data.seo bei Seiten) und
                  werden von lib/seo.js::buildBlogPostMeta beim Rendern gelesen. */}
              <div id="bp-sec-seo" className="ef-blog-section">
                <SeoPanel
                  pageData={templateData}
                  onChange={setTemplateData}
                  slug={channelSlug ? `${channelSlug}/${slug}` : slug}
                />
              </div>
            </div>
      </form>
    </EditorShell>
  );
}
