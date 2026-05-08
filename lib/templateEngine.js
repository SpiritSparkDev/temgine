import Mustache from 'mustache';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

// Convert a markdown string to HTML, unwrapping single-paragraph output
// so values can be placed inline in templates (e.g. <h1>{{title}}</h1>).
// Already-HTML values are returned unchanged.
function mdToHtml(s) {
  if (!s || typeof s !== 'string') return s;
  if (/<[a-z][\s\S]*>/i.test(s)) return s; // already HTML
  // Bare URLs must not be converted — they are used as href values in templates.
  if (/^https?:\/\/\S+$/.test(s.trim())) return s.trim();
  const html = marked.parse(s);
  const single = html.match(/^<p>([\s\S]*?)<\/p>\n?$/);
  return single ? single[1] : html.trim();
}

// Recursively convert all string leaves of a data object through mdToHtml.
// Arrays and nested objects are handled so that {{#each}} items also render.
function processMarkdownData(val) {
  if (typeof val === 'string') return mdToHtml(val);
  if (Array.isArray(val))  return val.map(processMarkdownData);
  if (val && typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val)) out[k] = processMarkdownData(val[k]);
    return out;
  }
  return val;
}

/**
 * Template-Engine für Mustache-ähnliche Platzhalter
 * Unterstützt: {{variable}}, {{#blocks}}...{{/blocks}}, {{#if}}...{{/if}}
 */

// Helper: remove HTML tags from a string (safe, used both server and client)
// Returns an empty string for falsy input to keep callers simple.
const stripTags = (s) => {
  if (!s) return '';
  try {
    return String(s).replace(/<[^>]*>/g, '');
  } catch (e) {
    return String(s);
  }
};

// Helper: unescape a few common HTML entities in a template string
const unescapeHtml = (s) => {
  if (!s) return '';
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
};

// Helper: escape a string for safe insertion into HTML (used for snippet values)
const escapeHtml = (s) => {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper: slugify a string for use as CSS class (lowercase, replace non-alnum with '-', collapse dashes)
const slugify = (s) => {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

const CSS_CLASS_REGEX = /^[A-Za-z_][A-Za-z0-9_-]*$/

const toValidBlockClassName = (value, fallback = 'block-item') => {
  const normalized = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  let candidate = normalized
  if (!candidate || !/^[a-z_]/.test(candidate)) {
    candidate = `block-${candidate || fallback}`
  }
  candidate = candidate.replace(/[^a-z0-9_-]/g, '')

  return CSS_CLASS_REGEX.test(candidate) ? candidate : 'block-item'
}

export function renderTemplate(templateCode, data) {
  try {
    // Pre-process data: convert markdown strings → HTML (each-block items included)
    const processedData = processMarkdownData(data || {});
    // Expand {{#each:name}} / {{/each:name}} → {{#name}} / {{/name}} before Mustache sees the code
    const withEachExpanded = String(templateCode || '').replace(/\{\{([#/])each:([^{}]+)\}\}/g, '{{$1$2}}');
    // Expand {{#if:name}} / {{/if:name}} → {{#name}} / {{/name}} (conditional blocks — renders only when name is non-empty)
    const withIfExpanded = withEachExpanded.replace(/\{\{([#/^])if:([^{}]+)\}\}/g, '{{$1$2}}');
    // Strip :type annotations (e.g. {{header:number}} → {{header}}) before Mustache sees the code
    const VALID_TYPES = 'text|textarea|number|url|image|date|select|color|array';
    const typeAnnotationRe = new RegExp(
      `(\\{\\{\\{?)([^{}#^/!>]+?):(${VALID_TYPES})(\\}\\}\\}?)`,
      'g'
    );
    let cleaned = withIfExpanded.replace(typeAnnotationRe, '$1$2$4');

    // Collect ALL key names (at any nesting depth, including inside each-arrays)
    // whose processed value is an HTML string — then force {{{key}}} unescaped output.
    const htmlKeyNames = new Set();
    function collectHtmlKeys(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(collectHtmlKeys); return; }
      Object.entries(obj).forEach(([k, v]) => {
        if (typeof v === 'string' && /<[^>]+>/.test(v)) htmlKeyNames.add(k);
        else if (v && typeof v === 'object') collectHtmlKeys(v);
      });
    }
    collectHtmlKeys(processedData);

    htmlKeyNames.forEach((key) => {
      const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const doubleBraceRe = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g');
      cleaned = cleaned.replace(doubleBraceRe, `{{{${key}}}}`);

      // If someone wrapped {{key}} into a paragraph, drop wrapper to avoid nested <p> issues.
      const pWrappedDouble = new RegExp(`<p\\s*>\\s*\\{\\{\\s*${escapedKey}\\s*\\}\\}\\s*<\/p\\s*>`, 'gi');
      cleaned = cleaned.replace(pWrappedDouble, `{{{${key}}}}`);
    });

    // Mustache.render verarbeitet Template-String mit Daten-Objekt
    return Mustache.render(cleaned, processedData);
  } catch (error) {
    console.error('Template-Rendering Fehler:', error);
    return `<div style="color: red; padding: 20px;">Template-Fehler: ${error.message}</div>`;
  }
}

/**
 * Baut automatisch verschachteltes Navigations-HTML aus dem Seitenbaum.
 * Gibt `{{{nav:auto}}}` als Platzhalter für Templates zurück.
 *
 * @param {Array}  nodes        - Seitenbaum (Top-Level oder Kinder)
 * @param {string} currentSlug  - Vollständiger Pfad der aktuellen Seite (z. B. "produkte/widget")
 * @param {string} parentPath   - Intern für Rekursion, leer lassen
 * @param {number} depth        - Intern für Rekursion, leer lassen
 * @returns {string}            - Fertig gerendertes HTML
 */
export function buildNavHtml(nodes, currentSlug = '', parentPath = '', depth = 0) {
  const visible = (nodes || []).filter(n => n.status === 'PUBLISHED' || n.isHomepage);
  if (visible.length === 0) return '';

  const items = visible.map(node => {
    const fullPath = parentPath ? `${parentPath}/${node.slug}` : node.slug;
    const href = `/${fullPath}`;
    const isActive = currentSlug === fullPath;
    const childrenHtml = (node.children && node.children.length > 0)
      ? buildNavHtml(node.children, currentSlug, fullPath, depth + 1)
      : '';
    return `<li class="nav-item depth-${depth}${isActive ? ' active' : ''}">`
      + `<a href="${href}"${isActive ? ' aria-current="page"' : ''}>${escapeHtml(node.title)}</a>`
      + childrenHtml
      + `</li>`;
  });

  const listTag = depth === 0 ? `<ul class="auto-nav-list">` : `<ul class="auto-nav-sub">`;
  const list = listTag + items.join('') + `</ul>`;
  return depth === 0 ? `<nav class="auto-nav" aria-label="Hauptnavigation">${list}</nav>` : list;
}

/**
 * Hilfsfunktion: Seite rendern durch Zusammensetzen aller Block-Templates
 * @param {object} page - Seiten-Objekt mit { title, slug, blocks }
 * @param {object} blockTemplates - Object mit Template-Namen → Template-Code für Block-Rendering
 * @param {object} options - Optional: Render-Optionen
 * @returns {string} - Gerendertes HTML (alle Blöcke nacheinander)
 */
export function renderPage(page, blockTemplates = {}, options = {}, navigations = {}) {
  // Pre-render navigation HTML once so every block can reference {{{nav:main}}} etc.
  const navHtml = {};
  for (const key of ['main', 'page', 'mobile', 'auto']) {
    const entry = navigations[key];
    if (entry && entry.code) {
      try {
        navHtml[`nav:${key}`] = Mustache.render(String(entry.code), entry.data || {});
      } catch (e) {
        navHtml[`nav:${key}`] = '';
      }
    } else {
      navHtml[`nav:${key}`] = '';
    }
  }

  // Render blocks recursively so nested `children` arrays are supported.
  const renderBlockRecursive = (block) => {
    if (!block || block.hidden) return ''
    const templateName = block.template || block.type

    // Special type: blog-channel — outputs a client-hydrated placeholder div
    if (block.type === 'blog-channel') {
      const { channelSlug = '', templateSlot = 'templateDetailPreview', postLimit = 6 } = block.props || {};
      return `<div class="blog-channel-block" data-channel="${escapeHtml(channelSlug)}" data-slot="${escapeHtml(templateSlot)}" data-limit="${parseInt(postLimit, 10) || 6}"></div>`;
    }
    if (templateName && blockTemplates[templateName]) {
      const childSeparator = (options && options.blockSeparator && options.insertChildSeparators) ? ("\n" + options.blockSeparator + "\n") : ''
      const childrenHtml = (block.children || []).map(renderBlockRecursive).filter(h => h).join(childSeparator)

      const blockData = {
        ...block.props,
        ...navHtml,
        page: {
          title: page?.title || '',
          slug: page?.slug || '',
          data: { ...(page?.data || {}) },
          isChild: !!options?.isChild
        },
        inner: childrenHtml
      }

      try {
        if ((!blockData.id || String(blockData.id).trim() === '') && (blockData.anchorId || blockData.anchor)) {
          blockData.id = String(blockData.anchorId || blockData.anchor || '').trim();
        }
      } catch (e) {}

      if ((!blockData.title || String(blockData.title).trim() === '')) {
        for (let lvl = 1; lvl <= 5; lvl++) {
          const key = `h${lvl}`;
          if (blockData[key] && String(blockData[key]).trim() !== '') {
            blockData.title = stripTags(blockData[key]);
            break;
          }
        }
        if ((!blockData.title || String(blockData.title).trim() === '') && blockData.headingText) {
          blockData.title = stripTags(blockData.headingText);
        }
      }

      let localTemplateCode = blockTemplates[templateName]
      try {
        const htmlKeys = Object.keys(blockData).filter(k => typeof blockData[k] === 'string' && /<[^>]+>/.test(blockData[k]))
        for (const k of htmlKeys) {
          const escKey = String(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const varRegex = new RegExp('\\{\\{\\s*' + escKey + '\\s*\\}\\}', 'g')
          localTemplateCode = localTemplateCode.replace(varRegex, `{{{${k}}}}`)
          try {
            const pWrappedTriple = new RegExp('<p\\s*>\\s*\\{\\{\\{\\s*' + escKey + '\\s*\\}\\}\\}\\s*<\\/p\\s*>', 'gi')
            localTemplateCode = localTemplateCode.replace(pWrappedTriple, `{{{${k}}}}`)
            const pWrappedDouble = new RegExp('<p\\s*>\\s*\\{\\{\\s*' + escKey + '\\s*\\}\\}\\s*<\\/p\\s*>', 'gi')
            localTemplateCode = localTemplateCode.replace(pWrappedDouble, `{{{${k}}}}`)
          } catch (e) {}
          try {
            const val = String(blockData[k] || '')
            if (/^<p[^>]*>[\s\S]*<\/p>$/i.test(val) && /<(?:h[1-6]|article|section|div|ul|ol|li|table|header|footer|nav|blockquote)[\s>]/i.test(val)) {
              blockData[k] = val.replace(/^<p[^>]*>\s*|\s*<\/p>$/gi, '')
            } else if (/^<p[^>]*>[\s\S]*<\/p>$/i.test(val)) {
              // Single <p> wrapping inline-only content — strip so the template's
              // own container element (e.g. <p class="textfield">) is not broken
              const inner = val.replace(/^<p[^>]*>\s*|\s*<\/p>$/gi, '')
              if (!/<p[\s>\/]|<\/p>/i.test(inner) && !/<(?:h[1-6]|article|section|div|ul|ol|li|table|header|footer|nav|blockquote)[\s>\/]/i.test(inner)) {
                blockData[k] = inner.trim()
              }
            }
          } catch (e) {}
        }
      } catch (e) {}

      try {
        if (localTemplateCode && (localTemplateCode.indexOf('&lt;') !== -1 || localTemplateCode.indexOf('&gt;') !== -1)) {
          localTemplateCode = unescapeHtml(localTemplateCode)
        }
      } catch (e) {}

      const renderedBlock = renderTemplate(localTemplateCode, blockData)
      try {
        if (childrenHtml && String(childrenHtml).trim()) {
          const hasInnerPlaceholder = /\{\{\{?\s*inner\s*\}?\}\}/.test(localTemplateCode)
          if (!hasInnerPlaceholder) {
            const rb = String(renderedBlock)
            try {
              const openingMatch = rb.match(/^\s*<([a-zA-Z0-9\-]+)(\s|>)/)
              if (openingMatch) {
                const tag = openingMatch[1]
                const closingTag = `</${tag}>`
                const idx = rb.lastIndexOf(closingTag)
                if (idx !== -1) {
                  return rb.slice(0, idx) + `<div class="block-children">${childrenHtml}</div>` + rb.slice(idx)
                }
              }
            } catch (e) {}
            return rb + '\n' + `<div class="block-children">${childrenHtml}</div>`
          }
        }
      } catch (e) {}
      return renderedBlock
    }
    try {
      const propsPreview = block.props ? JSON.stringify(block.props).replace(/</g, '&lt;') : ''
      return `<div class="missing-block" style="border:1px dashed #c00;padding:8px;margin:6px 0;background:#fff7f7;color:#600">Missing template: ${String(templateName || '(none)')}<pre style="white-space:pre-wrap">${propsPreview}</pre></div>`
    } catch (e) {
      return `<div class="missing-block">Missing template: ${String(templateName || '(none)')}</div>`
    }
  }

  const topSeparator = (options && options.blockSeparator && options.betweenBlocks) ? ("\n" + options.blockSeparator + "\n") : '\n'
  const blocksHtml = (page.blocks || []).map(renderBlockRecursive).filter(Boolean).join(topSeparator)

  // Auto-inject navigations that are not already embedded via {{{nav:*}}} placeholders in block templates.
  // MAIN nav is prepended, MOBILE nav appended. PAGE nav is available as {{{nav:page}}} but not auto-injected.
  const mainNav = navHtml['nav:main'] || ''
  const mobileNav = navHtml['nav:mobile'] || ''

  // Only inject if the blocks HTML doesn't already contain the nav HTML (avoids double output)
  const hasMainNavInBlocks = mainNav && blocksHtml.includes(mainNav)
  const hasMobileNavInBlocks = mobileNav && blocksHtml.includes(mobileNav)

  const parts = []
  if (mainNav && !hasMainNavInBlocks) parts.push(mainNav)
  parts.push(blocksHtml)
  if (mobileNav && !hasMobileNavInBlocks) parts.push(mobileNav)

  return parts.filter(Boolean).join('\n')
}
  
/**
 * Beispiel-Template-Daten für Preview
 */
export function getPreviewData() {
  return {
    title: 'Beispiel-Seite',
    slug: 'beispiel',
    text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    blocks: [
      {
        type: 'text',
        isText: true,
        title: 'Überschrift 1',
        content: 'Dies ist ein Textblock mit Lorem Ipsum Inhalt.',
      },
      {
        type: 'gallery',
        isGallery: true,
        images: [
          { src: 'https://via.placeholder.com/300x200/007bff/ffffff?text=Bild+1', alt: 'Bild 1' },
          { src: 'https://via.placeholder.com/300x200/28a745/ffffff?text=Bild+2', alt: 'Bild 2' },
        ],
      },
      {
        type: 'text',
        isText: true,
        title: 'Überschrift 2',
        content: 'Ein weiterer Textblock am Ende der Seite.',
      },
    ],
    images: [
      { src: 'https://via.placeholder.com/400x300', alt: 'Hauptbild' },
    ],
  };
}
