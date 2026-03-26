import React, { useState, useEffect, useCallback } from 'react';
import { Upload, ChevronRight, ChevronLeft, Check, AlertTriangle, FileCode, Eye, Type, Image, List, Quote, AlignLeft, Layers, X, RefreshCw } from 'lucide-react';
import { guessBlockType, extractHeading, extractTextContent, extractImageSrcs, cleanHtml, generateTemplateName, generateTemplateFromHtml } from '../lib/htmlImporter.js';
import { findBestMatch, extractPropsFromHtml } from '../lib/templateMatcher.js';
import { extractTemplateVariables } from '../lib/templateParser.js';

// ─── Block type display helpers ─────────────────────────────────────────────

const BLOCK_TYPE_LABELS = {
  text: 'Text', header: 'Header', footer: 'Footer', gallery: 'Gallery',
  cta: 'CTA', image: 'Bild', quote: 'Zitat', list: 'Liste', navigation: 'Navigation',
};

const BLOCK_TYPE_ICONS = {
  text: AlignLeft, header: Layers, footer: Layers, gallery: Image,
  cta: ChevronRight, image: Image, quote: Quote, list: List, navigation: Layers,
};

function BlockTypeIcon({ type, size = 14 }) {
  const Icon = BLOCK_TYPE_ICONS[type] || Type;
  return <Icon size={size} />;
}

// ─── Browser-side HTML → blocks parser ──────────────────────────────────────

/**
 * Use the browser's DOMParser to split an HTML string into block candidates.
 * Returns an array of { id, tagName, blockType, html, preview, classList }.
 */
function parseHtmlToBlockCandidates(htmlString) {
  const clean = cleanHtml(htmlString);
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(`<body>${clean}</body>`, 'text/html');
  const body = doc.body;

  const BLOCK_TAGS = new Set([
    'header', 'footer', 'nav', 'main', 'section', 'article', 'aside',
    'figure', 'blockquote', 'form', 'table', 'ul', 'ol', 'div',
    'h1', 'h2', 'h3',
  ]);

  const candidates = [];
  let idx = 0;

  const walk = (node, depth) => {
    if (node.nodeType !== 1) return; // element nodes only
    const tag = node.tagName.toLowerCase();

    if (BLOCK_TAGS.has(tag)) {
      const classArr = Array.from(node.classList);
      const innerHTML = node.innerHTML || '';
      const blockType = guessBlockType(tag, classArr, innerHTML);
      const preview = extractHeading(innerHTML) || extractTextContent(innerHTML).slice(0, 80);

      candidates.push({
        id: `block-${idx++}`,
        tagName: tag,
        blockType,
        html: node.outerHTML,
        preview: preview || `<${tag}>`,
        classList: classArr,
      });
      return; // don't recurse into recognised blocks
    }

    if (depth < 3) {
      for (const child of Array.from(node.children)) walk(child, depth + 1);
    }
  };

  for (const child of Array.from(body.children)) walk(child, 0);

  // If nothing detected, treat entire body as a single text block
  if (candidates.length === 0 && body.innerHTML.trim()) {
    const innerHTML = body.innerHTML;
    candidates.push({
      id: 'block-0',
      tagName: 'div',
      blockType: 'text',
      html: `<div>${innerHTML}</div>`,
      preview: extractTextContent(innerHTML).slice(0, 80),
      classList: [],
    });
  }

  return candidates;
}

// ─── Build match suggestions ─────────────────────────────────────────────────

function buildMatches(candidates, templates) {
  return candidates.map((candidate, i) => {
    const match = findBestMatch(candidate.blockType, templates);
    const autoTemplate = match && match.score >= 40 ? match.template : null;

    let props = {};
    let usesExistingTemplate = Boolean(autoTemplate);
    let chosenTemplate = autoTemplate ? autoTemplate.name : null;
    let newTemplateCode = null;

    if (autoTemplate) {
      const vars = extractTemplateVariables(autoTemplate.code || '');
      // Reuse the semantic extraction from generateTemplateFromHtml so that
      // content, title, imgurl etc. are always extracted the same way —
      // regardless of what name the existing template uses for its variables.
      const { extractedProps: sem } = generateTemplateFromHtml(candidate.html, '_');
      props = {};
      for (const v of vars) {
        const n = v.toLowerCase().replace(/[^a-z]/g, '');
        if (/title|heading|headline|ueberschrift/.test(n)) {
          props[v] = sem.title || '';
        } else if (/text|content|body|description|inhalt|richtext|beschreibung/.test(n)) {
          props[v] = sem.content || '';
        } else if (/img|image|src|bild|photo|imgurl/.test(n)) {
          props[v] = sem.imgurl || '';
        } else {
          // For any other var (href, label, alt, …) fall back to extractPropsFromHtml
          const fp = extractPropsFromHtml(candidate.html, [v]);
          props[v] = fp[v] || '';
        }
      }
    } else {
      // Auto-generate a new template
      const genName = generateTemplateName(candidate.blockType, i + 1);
      const gen = generateTemplateFromHtml(candidate.html, genName);
      chosenTemplate = gen.name;
      newTemplateCode = gen.code;
      usesExistingTemplate = false;
      // Use the props extracted during template generation (content already split
      // into named fields rather than embedding raw HTML in the template code).
      props = gen.extractedProps || extractPropsFromHtml(candidate.html, extractTemplateVariables(gen.code));
    }

    return {
      ...candidate,
      chosenTemplate,
      usesExistingTemplate,
      newTemplateCode,
      props,
      matchScore: match ? match.score : 0,
    };
  });
}

// ─── Site-template generator ─────────────────────────────────────────────────

/**
 * Generate a SITE-type template HTML from the original raw HTML.
 * Finds the main content container, replaces its content with {{{blocks}}},
 * and optionally replaces the first <h1> with {{title}}.
 * Browser-only (requires window.DOMParser).
 *
 * @param {string} rawHtml   - the exact string the user pasted
 * @param {Array}  candidates - block candidates (each has .html = outerHTML)
 * @returns {string} Mustache template code for a SITE template
 */
function computeSiteTemplateCode(rawHtml, candidates) {
  try {
    const clean = cleanHtml(rawHtml);
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(`<body>${clean}</body>`, 'text/html');
    const body = doc.body;

    // Build prefix list from candidate outerHTML strings (first 100 chars for matching)
    const candidatePrefixes = candidates.map(c => (c.html || '').trim().slice(0, 100)).filter(Boolean);

    // Count how many direct children of `el` match a known candidate
    function countMatchingChildren(el) {
      return Array.from(el.children).filter(child => {
        const prefix = (child.outerHTML || '').trim().slice(0, 100);
        return candidatePrefixes.some(p => p && prefix && prefix === p);
      }).length;
    }

    // Priority 1: semantic <main> or role="main"
    let container = body.querySelector('main') || body.querySelector('[role="main"]');

    // Priority 2: element whose direct children best match the candidates
    if (!container) {
      let bestEl = null;
      let bestCount = 0;
      const allEls = [body, ...Array.from(body.querySelectorAll('*'))];
      for (const el of allEls) {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
        const count = countMatchingChildren(el);
        if (count > bestCount) { bestCount = count; bestEl = el; }
      }
      container = (bestCount >= 2 ? bestEl : null) || body;
    }

    // Replace container content with blocks placeholder
    container.innerHTML = '\n{{{blocks}}}\n';

    // Replace first <h1> text with {{title}} (page-title placeholder)
    const h1 = body.querySelector('h1');
    if (h1) h1.innerHTML = '{{title}}';

    return body.innerHTML.trim();
  } catch {
    return '';
  }
}

// ─── Slug helper ────────────────────────────────────────────────────────────

function slugify(text) {
  return String(text || '').toLowerCase()
    .replace(/[äöüÄÖÜ]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'ae', Ö: 'oe', Ü: 'ue' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ImporterView({ showToast, onPageCreated }) {
  const [step, setStep] = useState(1); // 1: input, 2: review blocks, 3: page settings
  const [htmlInput, setHtmlInput] = useState('');
  const [parseError, setParseError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [matches, setMatches] = useState([]);      // array of enriched block objects
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [pageTitle, setPageTitle] = useState('');
  const [pageSlug, setPageSlug] = useState('');
  const [siteTemplate, setSiteTemplate] = useState('');
  const [siteTemplateMode, setSiteTemplateMode] = useState('none'); // 'none' | 'existing' | 'new'
  const [newSiteTemplateName, setNewSiteTemplateName] = useState('');
  const [generatedSiteTemplateCode, setGeneratedSiteTemplateCode] = useState('');
  const [importing, setImporting] = useState(false);

  // Load available templates once on mount
  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.json())
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]));
  }, []);

  const siteTemplates = templates.filter(t => t.type !== 'BLOCK');
  const blockTemplates = templates.filter(t => t.type === 'BLOCK' || !t.type);

  // ── Step 1: Analyse HTML ────────────────────────────────────────────────

  function handleAnalyse() {
    setParseError('');
    if (!htmlInput.trim()) {
      setParseError('Bitte füge HTML-Code ein.');
      return;
    }
    try {
      const candidates = parseHtmlToBlockCandidates(htmlInput);
      if (candidates.length === 0) {
        setParseError('Keine Block-Strukturen erkannt. Prüfe den HTML-Code.');
        return;
      }
      const built = buildMatches(candidates, templates);
      setMatches(built);
      setSelectedBlockId(built[0]?.id || null);

      // Pre-compute the site template code for the "Neu aus HTML" mode
      try {
        const siteCode = computeSiteTemplateCode(htmlInput, candidates);
        setGeneratedSiteTemplateCode(siteCode);
      } catch {
        setGeneratedSiteTemplateCode('');
      }

      setStep(2);
    } catch (e) {
      console.error('[ImporterView] parse error', e);
      setParseError('Fehler beim Analysieren des HTML-Codes: ' + e.message);
    }
  }

  // ── Step 2: Block editor helpers ────────────────────────────────────────

  const selectedMatch = matches.find(m => m.id === selectedBlockId) || null;

  function updateMatch(id, patch) {
    setMatches(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  }

  function handleTemplateChange(blockId, templateName) {
    const tpl = templates.find(t => t.name === templateName);
    setMatches(prev => prev.map(m => {
      if (m.id !== blockId) return m;
      let props = m.props;
      let newTemplateCode = m.newTemplateCode;
      let usesExistingTemplate = m.usesExistingTemplate;

      if (tpl) {
        const vars = extractTemplateVariables(tpl.code || '');
        const { extractedProps: sem } = generateTemplateFromHtml(m.html, '_');
        props = {};
        for (const v of vars) {
          const n = v.toLowerCase().replace(/[^a-z]/g, '');
          if (/title|heading|headline|ueberschrift/.test(n)) {
            props[v] = sem.title || '';
          } else if (/text|content|body|description|inhalt|richtext|beschreibung/.test(n)) {
            props[v] = sem.content || '';
          } else if (/img|image|src|bild|photo|imgurl/.test(n)) {
            props[v] = sem.imgurl || '';
          } else {
            const fp = extractPropsFromHtml(m.html, [v]);
            props[v] = fp[v] || '';
          }
        }
        newTemplateCode = null;
        usesExistingTemplate = true;
      } else {
        // "__new__" sentinel - regenerate
        const genName = generateTemplateName(m.blockType, matches.indexOf(m) + 1);
        const gen = generateTemplateFromHtml(m.html, genName);
        props = gen.extractedProps || extractPropsFromHtml(m.html, extractTemplateVariables(gen.code));
        newTemplateCode = gen.code;
        usesExistingTemplate = false;
        templateName = gen.name;
      }

      return { ...m, chosenTemplate: templateName, usesExistingTemplate, newTemplateCode, props };
    }));
  }

  function handlePropChange(blockId, key, value) {
    setMatches(prev => prev.map(m =>
      m.id === blockId ? { ...m, props: { ...m.props, [key]: value } } : m
    ));
  }

  // ── Step 3: Import ──────────────────────────────────────────────────────

  async function handleImport() {
    if (!pageTitle.trim()) { showToast('Bitte Seitentitel eingeben', 'error'); return; }
    if (!pageSlug.trim()) { showToast('Bitte Slug eingeben', 'error'); return; }

    setImporting(true);
    try {
      // Collect new block templates that need to be created
      const newTemplates = matches
        .filter(m => !m.usesExistingTemplate && m.newTemplateCode)
        .map(m => ({ name: m.chosenTemplate, code: m.newTemplateCode, type: 'BLOCK' }));

      // Dedup by name
      const deduped = [...new Map(newTemplates.map(t => [t.name, t])).values()];

      // Resolve effective site template based on the chosen mode
      let effectiveSiteTemplate = null;
      if (siteTemplateMode === 'existing') {
        effectiveSiteTemplate = siteTemplate || null;
      } else if (siteTemplateMode === 'new') {
        const stName = (newSiteTemplateName.trim() || `Site-${pageTitle.trim()}`);
        if (generatedSiteTemplateCode) {
          deduped.push({ name: stName, code: generatedSiteTemplateCode, type: 'SITE' });
          effectiveSiteTemplate = stName;
        }
      }

      // blocks are kept in their original order from `matches` (array order = display order).
      // `type` is included alongside `template` for PageEditor compatibility (editor uses it as fallback).
      const blocks = matches.map(m => ({
        template: m.chosenTemplate,
        type: m.blockType,
        props: m.props,
        children: [],
      }));

      const res = await fetch('/api/import/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageTitle: pageTitle.trim(),
          pageSlug: pageSlug.trim(),
          siteTemplate: effectiveSiteTemplate,
          blocks,
          newTemplates: deduped,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Import fehlgeschlagen', 'error');
        return;
      }

      showToast(`Seite "${data.page.title}" wurde importiert!`, 'success');

      // Notify parent (AdminPageClient) so it can refresh its pages state and navigate.
      if (typeof onPageCreated === 'function') {
        onPageCreated(data.page.slug);
      }

      // Reset to initial state
      setStep(1);
      setHtmlInput('');
      setMatches([]);
      setPageTitle('');
      setPageSlug('');
      setSiteTemplate('');
      setSiteTemplateMode('none');
      setNewSiteTemplateName('');
      setGeneratedSiteTemplateCode('');
    } catch (e) {
      showToast('Netzwerkfehler: ' + e.message, 'error');
    } finally {
      setImporting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="importer-view">
      {/* Progress bar */}
      <div className="importer-steps">
        {['HTML eingeben', 'Blöcke prüfen', 'Seite importieren'].map((label, i) => (
          <div key={i} className={`importer-step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}>
            <span className="importer-step-num">{step > i + 1 ? <Check size={12} /> : i + 1}</span>
            <span className="importer-step-label">{label}</span>
            {i < 2 && <ChevronRight size={14} className="importer-step-arrow" />}
          </div>
        ))}
      </div>

      {/* ─── STEP 1: HTML input ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="importer-panel">
          <div className="importer-panel-header">
            <FileCode size={18} />
            <h2>HTML-Code einfügen</h2>
          </div>
          <p className="importer-hint">
            Füge vollständiges HTML oder einen Ausschnitt ein. Das System erkennt semantische Blöcke
            (<code>section</code>, <code>article</code>, <code>header</code> usw.) automatisch.
          </p>
          <textarea
            className="importer-html-input"
            value={htmlInput}
            onChange={e => setHtmlInput(e.target.value)}
            placeholder={'<section class="hero">\n  <h1>Überschrift</h1>\n  <p>Beschreibung...</p>\n</section>\n<section class="content">\n  <h2>Weitere Inhalte</h2>\n  <p>Text...</p>\n</section>'}
            spellCheck={false}
          />
          {parseError && (
            <div className="importer-error">
              <AlertTriangle size={14} /> {parseError}
            </div>
          )}
          <div className="importer-actions">
            <button className="btn btn-primary" onClick={handleAnalyse} disabled={!htmlInput.trim()}>
              <Eye size={14} /> Analysieren
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 2: Block review ────────────────────────────────────────── */}
      {step === 2 && (
        <div className="importer-split">
          {/* Block list sidebar */}
          <div className="importer-sidebar">
            <div className="importer-sidebar-head">
              <span>{matches.length} Block{matches.length !== 1 ? 'e' : ''} erkannt</span>
              <button className="importer-back-btn" onClick={() => setStep(1)} title="Zurück">
                <ChevronLeft size={14} /> Zurück
              </button>
            </div>
            <ul className="importer-block-list">
              {matches.map(m => (
                <li
                  key={m.id}
                  className={`importer-block-item ${selectedBlockId === m.id ? 'active' : ''}`}
                  onClick={() => setSelectedBlockId(m.id)}
                >
                  <span className="importer-block-icon">
                    <BlockTypeIcon type={m.blockType} />
                  </span>
                  <span className="importer-block-info">
                    <span className="importer-block-type">{BLOCK_TYPE_LABELS[m.blockType] || m.blockType}</span>
                    <span className="importer-block-preview">{m.preview}</span>
                  </span>
                  {m.usesExistingTemplate
                    ? <span className="importer-badge match" title={`Template: ${m.chosenTemplate}`}>✓</span>
                    : <span className="importer-badge new" title="Neues Template wird erstellt">+</span>
                  }
                </li>
              ))}
            </ul>
            <div className="importer-sidebar-footer">
              <button className="btn btn-primary btn-full" onClick={() => setStep(3)}>
                Weiter <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Block editor main panel */}
          {selectedMatch && (
            <div className="importer-editor">
              <div className="importer-editor-header">
                <BlockTypeIcon type={selectedMatch.blockType} size={16} />
                <strong>{BLOCK_TYPE_LABELS[selectedMatch.blockType] || selectedMatch.blockType}</strong>
                <code className="importer-tag-badge">&lt;{selectedMatch.tagName}&gt;</code>
              </div>

              {/* Template assignment */}
              <label className="importer-field-label">Template</label>
              <div className="importer-template-row">
                <select
                  className="importer-select"
                  value={selectedMatch.chosenTemplate || ''}
                  onChange={e => handleTemplateChange(selectedMatch.id, e.target.value)}
                >
                  <option value="__new__">+ Neues Template erstellen</option>
                  <optgroup label="Block-Templates">
                    {blockTemplates.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Site-Templates">
                    {siteTemplates.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </optgroup>
                </select>
                {!selectedMatch.usesExistingTemplate && (
                  <span className="importer-new-badge">Neu</span>
                )}
              </div>

              {/* Field editor */}
              {Object.keys(selectedMatch.props).length > 0 && (
                <>
                  <label className="importer-field-label" style={{ marginTop: '1rem' }}>Felder</label>
                  <div className="importer-fields">
                    {Object.entries(selectedMatch.props).map(([key, val]) => (
                      <div key={key} className="importer-field">
                        <label className="importer-field-key">{key}</label>
                        {String(val).length > 80 || String(val).includes('<') ? (
                          <textarea
                            className="importer-field-textarea"
                            value={val}
                            onChange={e => handlePropChange(selectedMatch.id, key, e.target.value)}
                            rows={4}
                          />
                        ) : (
                          <input
                            className="importer-field-input"
                            type="text"
                            value={val}
                            onChange={e => handlePropChange(selectedMatch.id, key, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* HTML preview */}
              <details className="importer-html-details">
                <summary>Erkanntes HTML</summary>
                <pre className="importer-html-pre">{selectedMatch.html}</pre>
              </details>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 3: Page settings + import ─────────────────────────────── */}
      {step === 3 && (
        <div className="importer-panel">
          <div className="importer-panel-header">
            <Upload size={18} />
            <h2>Seite importieren</h2>
          </div>

          <div className="importer-summary">
            <strong>{matches.length}</strong> Block{matches.length !== 1 ? 'e' : ''} werden importiert
            {matches.filter(m => !m.usesExistingTemplate).length > 0 && (
              <span className="importer-summary-new">
                &nbsp;– {matches.filter(m => !m.usesExistingTemplate).length} neue Template{matches.filter(m => !m.usesExistingTemplate).length !== 1 ? 's' : ''} werden erstellt
              </span>
            )}
          </div>

          {/* Block summary list */}
          <ul className="importer-summary-list">
            {matches.map(m => (
              <li key={m.id} className="importer-summary-item">
                <BlockTypeIcon type={m.blockType} />
                <span>{m.preview || BLOCK_TYPE_LABELS[m.blockType]}</span>
                <span className="importer-summary-tpl">→ {m.chosenTemplate}</span>
                {!m.usesExistingTemplate && <span className="importer-badge new">Neu</span>}
              </li>
            ))}
          </ul>

          {/* Page metadata */}
          <div className="importer-meta-form">
            <div className="importer-field">
              <label className="importer-field-label">Seitentitel *</label>
              <input
                className="importer-field-input"
                type="text"
                value={pageTitle}
                onChange={e => {
                  setPageTitle(e.target.value);
                  if (!pageSlug) setPageSlug(slugify(e.target.value));
                }}
                placeholder="z.B. Startseite"
              />
            </div>

            <div className="importer-field">
              <label className="importer-field-label">Slug *</label>
              <div className="importer-slug-row">
                <span className="importer-slug-prefix">/</span>
                <input
                  className="importer-field-input"
                  type="text"
                  value={pageSlug}
                  onChange={e => setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\-/]/g, ''))}
                  placeholder="startseite"
                />
                <button
                  className="importer-regen-btn"
                  onClick={() => setPageSlug(slugify(pageTitle))}
                  title="Slug aus Titel generieren"
                  type="button"
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>

            <div className="importer-field">
              <label className="importer-field-label">Seiten-Template</label>
              <div className="importer-mode-toggle">
                <button
                  type="button"
                  className={`importer-mode-btn${siteTemplateMode === 'none' ? ' active' : ''}`}
                  onClick={() => setSiteTemplateMode('none')}
                >
                  Keines
                </button>
                <button
                  type="button"
                  className={`importer-mode-btn${siteTemplateMode === 'existing' ? ' active' : ''}`}
                  onClick={() => setSiteTemplateMode('existing')}
                >
                  Vorhandenes
                </button>
                <button
                  type="button"
                  className={`importer-mode-btn${siteTemplateMode === 'new' ? ' active' : ''}`}
                  onClick={() => {
                    setSiteTemplateMode('new');
                    if (!newSiteTemplateName.trim()) {
                      setNewSiteTemplateName(`Site-${pageTitle.trim() || 'Seite'}`);
                    }
                  }}
                >
                  Neu aus HTML
                </button>
              </div>

              {siteTemplateMode === 'existing' && (
                <select
                  className="importer-select"
                  value={siteTemplate}
                  onChange={e => setSiteTemplate(e.target.value)}
                >
                  <option value="">(bitte wählen)</option>
                  {siteTemplates.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              )}

              {siteTemplateMode === 'new' && (
                <div className="importer-site-tpl-new">
                  <input
                    className="importer-field-input"
                    type="text"
                    value={newSiteTemplateName}
                    onChange={e => setNewSiteTemplateName(e.target.value)}
                    placeholder="z.B. Site-Startseite"
                  />
                  {generatedSiteTemplateCode ? (
                    <details className="importer-html-details">
                      <summary>Vorschau Site-Template</summary>
                      <pre className="importer-html-pre">{generatedSiteTemplateCode}</pre>
                    </details>
                  ) : (
                    <p className="importer-hint" style={{ marginTop: '0.25rem' }}>
                      Kein Site-Template konnte aus dem HTML generiert werden.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="importer-actions">
            <button className="btn btn-secondary" onClick={() => setStep(2)} disabled={importing}>
              <ChevronLeft size={14} /> Zurück
            </button>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importing || !pageTitle.trim() || !pageSlug.trim()}
            >
              {importing ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
              {importing ? 'Importiere...' : 'Jetzt importieren'}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .importer-view { display: flex; flex-direction: column; height: 100%; padding: 1.5rem; gap: 1.25rem; }

        /* Progress steps */
        .importer-steps { display: flex; align-items: center; gap: 0.25rem; font-size: 0.8rem; }
        .importer-step { display: flex; align-items: center; gap: 0.4rem; color: var(--text-muted, #888); }
        .importer-step.active { color: var(--accent, #0070f3); font-weight: 600; }
        .importer-step.done { color: var(--success, #16a34a); }
        .importer-step-num { width: 20px; height: 20px; border-radius: 50%; background: var(--bg-2, #eee); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; }
        .importer-step.active .importer-step-num { background: var(--accent, #0070f3); color: #fff; }
        .importer-step.done .importer-step-num { background: var(--success, #16a34a); color: #fff; }
        .importer-step-arrow { color: var(--text-muted, #aaa); }

        /* Panel (steps 1 & 3) */
        .importer-panel { display: flex; flex-direction: column; gap: 1rem; max-width: 800px; }
        .importer-panel-header { display: flex; align-items: center; gap: 0.5rem; }
        .importer-panel-header h2 { margin: 0; font-size: 1rem; font-weight: 600; }
        .importer-hint { font-size: 0.85rem; color: var(--text-muted, #666); margin: 0; }

        /* Textarea */
        .importer-html-input { width: 100%; min-height: 320px; font-family: monospace; font-size: 0.8rem; padding: 0.75rem; border: 1px solid var(--border, #ddd); border-radius: 6px; resize: vertical; background: var(--bg, #fff); color: var(--text, #333); }

        /* Error */
        .importer-error { display: flex; align-items: center; gap: 0.4rem; color: var(--error, #dc2626); font-size: 0.85rem; }

        /* Actions row */
        .importer-actions { display: flex; gap: 0.75rem; }
        .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem; border-radius: 6px; border: none; cursor: pointer; font-size: 0.85rem; font-weight: 500; }
        .btn-primary { background: var(--accent, #0070f3); color: #fff; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { background: var(--bg-2, #f3f4f6); color: var(--text, #333); border: 1px solid var(--border, #ddd); }
        .btn-full { width: 100%; justify-content: center; }

        /* Split view (step 2) */
        .importer-split { display: flex; gap: 0; flex: 1; min-height: 0; border: 1px solid var(--border, #ddd); border-radius: 8px; overflow: hidden; }

        /* Sidebar */
        .importer-sidebar { width: 260px; flex-shrink: 0; border-right: 1px solid var(--border, #ddd); display: flex; flex-direction: column; }
        .importer-sidebar-head { padding: 0.75rem; border-bottom: 1px solid var(--border, #ddd); display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; font-weight: 600; }
        .importer-back-btn { background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; color: var(--accent, #0070f3); }
        .importer-block-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
        .importer-block-item { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.6rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--border-light, #f0f0f0); }
        .importer-block-item:hover, .importer-block-item.active { background: var(--bg-2, #f8f9fa); }
        .importer-block-icon { margin-top: 2px; color: var(--text-muted, #888); flex-shrink: 0; }
        .importer-block-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
        .importer-block-type { font-size: 0.75rem; font-weight: 600; }
        .importer-block-preview { font-size: 0.7rem; color: var(--text-muted, #888); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .importer-badge { font-size: 0.7rem; padding: 0.1rem 0.35rem; border-radius: 3px; flex-shrink: 0; }
        .importer-badge.match { background: #dcfce7; color: #16a34a; }
        .importer-badge.new { background: #dbeafe; color: #1d4ed8; }
        .importer-sidebar-footer { padding: 0.75rem; border-top: 1px solid var(--border, #ddd); }

        /* Block editor */
        .importer-editor { flex: 1; overflow-y: auto; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
        .importer-editor-header { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
        .importer-tag-badge { font-size: 0.75rem; background: var(--bg-2, #f3f4f6); padding: 0.15rem 0.4rem; border-radius: 4px; color: var(--text-muted, #666); }
        .importer-field-label { font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 0.25rem; }
        .importer-template-row { display: flex; align-items: center; gap: 0.5rem; }
        .importer-select { flex: 1; padding: 0.4rem 0.6rem; border: 1px solid var(--border, #ddd); border-radius: 5px; font-size: 0.85rem; background: var(--bg, #fff); }
        .importer-new-badge { font-size: 0.7rem; background: #dbeafe; color: #1d4ed8; padding: 0.15rem 0.5rem; border-radius: 4px; }
        .importer-fields { display: flex; flex-direction: column; gap: 0.6rem; }
        .importer-field { display: flex; flex-direction: column; gap: 0.25rem; }
        .importer-field-key { font-size: 0.75rem; color: var(--text-muted, #666); font-family: monospace; }
        .importer-field-input { padding: 0.35rem 0.5rem; border: 1px solid var(--border, #ddd); border-radius: 5px; font-size: 0.85rem; background: var(--bg, #fff); }
        .importer-field-textarea { padding: 0.35rem 0.5rem; border: 1px solid var(--border, #ddd); border-radius: 5px; font-size: 0.8rem; font-family: inherit; resize: vertical; background: var(--bg, #fff); }
        .importer-html-details { margin-top: 0.5rem; }
        .importer-html-details summary { cursor: pointer; font-size: 0.8rem; color: var(--text-muted, #888); }
        .importer-html-pre { font-size: 0.72rem; background: var(--bg-2, #f8f9fa); padding: 0.6rem; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; }

        /* Step 3 summary */
        .importer-summary { font-size: 0.85rem; color: var(--text-muted, #666); }
        .importer-summary-new { color: #1d4ed8; }
        .importer-summary-list { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; border: 1px solid var(--border, #ddd); border-radius: 6px; overflow: hidden; }
        .importer-summary-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-light, #f0f0f0); font-size: 0.82rem; }
        .importer-summary-item:last-child { border-bottom: none; }
        .importer-summary-tpl { color: var(--text-muted, #888); margin-left: auto; font-size: 0.78rem; }

        /* Meta form */
        .importer-meta-form { display: flex; flex-direction: column; gap: 0.75rem; }
        .importer-slug-row { display: flex; align-items: center; gap: 0; }
        .importer-slug-prefix { padding: 0.35rem 0.5rem; background: var(--bg-2, #f3f4f6); border: 1px solid var(--border, #ddd); border-right: none; border-radius: 5px 0 0 5px; font-size: 0.85rem; color: var(--text-muted, #888); }
        .importer-slug-row .importer-field-input { border-radius: 0; flex: 1; }
        .importer-regen-btn { padding: 0.35rem 0.6rem; border: 1px solid var(--border, #ddd); border-left: none; border-radius: 0 5px 5px 0; background: var(--bg-2, #f3f4f6); cursor: pointer; display: flex; align-items: center; }

        /* Site-template mode toggle */
        .importer-mode-toggle { display: flex; border: 1px solid var(--border, #ddd); border-radius: 6px; overflow: hidden; margin-bottom: 0.4rem; }
        .importer-mode-btn { flex: 1; padding: 0.35rem 0.5rem; background: var(--bg, #fff); border: none; border-right: 1px solid var(--border, #ddd); cursor: pointer; font-size: 0.8rem; color: var(--text-muted, #666); transition: background 0.15s, color 0.15s; }
        .importer-mode-btn:last-child { border-right: none; }
        .importer-mode-btn:hover { background: var(--bg-2, #f3f4f6); }
        .importer-mode-btn.active { background: var(--accent, #0070f3); color: #fff; font-weight: 600; }
        .importer-site-tpl-new { display: flex; flex-direction: column; gap: 0.4rem; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}
