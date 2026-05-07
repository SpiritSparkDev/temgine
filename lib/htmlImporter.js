/**
 * HTML Importer Helpers
 * Pure functions (no DOM, no Node.js APIs) – safe to import on client and server.
 */

/** Known semantic block tags ordered by specificity */
export const SEMANTIC_BLOCK_TAGS = new Set([
  'header', 'footer', 'nav', 'main', 'section', 'article', 'aside',
  'figure', 'blockquote', 'form', 'table', 'ul', 'ol'
]);

/**
 * Guess block type from tag name, CSS class list, and raw innerHTML.
 * Returns one of: 'navigation' | 'header' | 'footer' | 'gallery' | 'cta' | 'image' | 'quote' | 'list' | 'text'
 */
export function guessBlockType(tagName, classList = [], innerHTML = '') {
  const tag = String(tagName || '').toLowerCase();
  const classes = (Array.isArray(classList) ? classList : [classList]).join(' ').toLowerCase();
  const content = String(innerHTML || '').toLowerCase();

  if (tag === 'nav' || /\bnav(igation|bar|menu)?\b/.test(classes)) return 'navigation';

  if (tag === 'footer' || /\b(footer|site-footer|page-footer|bottom-bar)\b/.test(classes)) return 'footer';

  if (
    tag === 'header' ||
    /\b(hero|banner|jumbotron|masthead|showcase|intro|splash|top-section|page-header)\b/.test(classes)
  ) return 'header';

  const imgCount = (content.match(/<img/g) || []).length;
  if (imgCount >= 2 || /\b(gallery|carousel|slider|lightbox|portfolio|masonry)\b/.test(classes)) return 'gallery';

  if (
    /\b(cta|call-to-action|cta-section|action-bar|promo|promotion|conversion)\b/.test(classes) ||
    (content.includes('<a ') && imgCount === 0 && content.length < 400)
  ) return 'cta';

  if (
    tag === 'figure' ||
    (imgCount === 1 && content.length < 600) ||
    /\b(image|photo|picture|media)\b/.test(classes)
  ) return 'image';

  if (
    tag === 'blockquote' ||
    /\b(quote|testimonial|review|feedback|client-say)\b/.test(classes)
  ) return 'quote';

  if (
    tag === 'ul' || tag === 'ol' ||
    /\b(list|features?|services?|items?|benefits?|pricing|steps?|process|team|staff|cards?)\b/.test(classes)
  ) return 'list';

  if (tag === 'aside' || /\b(sidebar|widget|aside)\b/.test(classes)) return 'text';

  return 'text';
}

/** Strip all HTML tags and collapse whitespace to plain text */
export function extractTextContent(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extract text of the first heading (<h1>–<h4>) found in an HTML string */
export function extractHeading(html) {
  const m = String(html || '').match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
  return m ? extractTextContent(m[1]) : '';
}

/** Return an array of all img src values found in an HTML string */
export function extractImageSrcs(html) {
  const srcs = [];
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) srcs.push(m[1]);
  return srcs;
}

/** Return an array of { text, href } for every <a> with a navigable href */
export function extractLinks(html) {
  const links = [];
  const re = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = extractTextContent(m[2]);
    if (text || m[1]) links.push({ text, href: m[1] });
  }
  return links;
}

/**
 * Generate a human-readable template name for an auto-created block template.
 * @param {string} blockType
 * @param {number} index  1-based
 */
export function generateTemplateName(blockType, index) {
  const typeLabels = {
    text: 'Text', header: 'Header', footer: 'Footer', gallery: 'Gallery',
    cta: 'CTA', image: 'Image', quote: 'Quote', list: 'Liste', navigation: 'Navigation',
  };
  const label = typeLabels[blockType] || 'Block';
  return `Imported-${label}-${index}`;
}

/**
 * Light HTML cleanup: strip scripts, styles, and HTML comments.
 * Does NOT sanitize (that is done server-side via htmlSanitize.js).
 */
export function cleanHtml(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .trim();
}

/**
 * Convert raw HTML content into a clean block template.
 *
 * Strategy:
 *  1. Preserve the outer wrapper element (tag + all attributes).
 *  2. Extract the first heading (any level) as {{title}} / extractedProps.title.
 *  3. Everything else in the wrapper → {{{content}}} / extractedProps.content
 *     (triple-stache, rendered as unescaped HTML – keeps formatting tags intact).
 *  4. Convenience: also pull the first <img src> into extractedProps.imgurl
 *     so it can be used as a standalone image field when an existing template
 *     asks for {{imgurl}}.
 *
 * This guarantees that NO actual text content is ever baked into the
 * generated template code – it all ends up in editable page-content fields.
 *
 * Returns { name, code, type: 'BLOCK', extractedProps }
 */
export function generateTemplateFromHtml(htmlContent, templateName) {
  const raw = String(htmlContent || '');
  const extractedProps = {};

  // ── Detect outer wrapper element ────────────────────────────────────────
  // Backreference \2 ensures the closing tag matches the opening tag,
  // and ([\s\S]*) is greedy so nested same-tag elements are handled correctly.
  const wrapperRe = /^(\s*<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>)([\s\S]*)(<\/\2>\s*)$/i;
  const wrapperMatch = raw.match(wrapperRe);

  let outerOpen = '';
  let outerClose = '';
  let innerHtml = raw;

  if (wrapperMatch) {
    outerOpen  = wrapperMatch[1].trimStart(); // e.g. <section class="hero">
    outerClose = wrapperMatch[5].trimEnd();   // e.g. </section>
    innerHtml  = wrapperMatch[4];
  }

  // ── Extract first heading → {{title}} ───────────────────────────────────
  const headingRe = /<(h[1-6])([^>]*)>([\s\S]*?)<\/h[1-6]>/i;
  const headingMatch = innerHtml.match(headingRe);

  let headingCode = '';
  let contentHtml = innerHtml.trim();

  if (headingMatch) {
    extractedProps.title = extractTextContent(headingMatch[3]);
    const headingTag   = headingMatch[1].toLowerCase();
    const headingAttrs = headingMatch[2]; // preserve class/id on heading
    headingCode  = `<${headingTag}${headingAttrs}>{{title}}</${headingTag}>`;
    contentHtml  = innerHtml.replace(headingMatch[0], '').trim();
  }

  // ── Remaining innerHTML → {{{content}}} ─────────────────────────────────
  if (contentHtml) {
    extractedProps.content = contentHtml;
  }

  // ── Convenience: first <img> src ─────────────────────────────────────────
  const imgMatch = raw.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) extractedProps.imgurl = imgMatch[1];

  // ── Build template code ──────────────────────────────────────────────────
  const bodyParts = [
    headingCode,
    extractedProps.content !== undefined ? '{{{content}}}' : '',
  ].filter(Boolean).join('');

  const code = outerOpen
    ? `${outerOpen}${bodyParts}${outerClose}`
    : (bodyParts || '{{{content}}}');

  return { name: templateName, code, type: 'BLOCK', extractedProps };
}

/**
 * Parse the HTML string that lives in `{{{content}}}` (props.content) and
 * return an array of extractable child elements that the user could promote
 * to their own named Mustache fields.
 *
 * Supports: h2-h6, p, li (first 3), blockquote, a (with href), img
 *
 * Each item:
 * {
 *   idx:           number          // stable index for keying
 *   tag:           string          // 'h2', 'p', 'img', …
 *   attrs:         string          // raw attribute string (may be empty)
 *   outerHtml:     string          // full original element HTML
 *   textValue:     string          // plain text (stripped tags)
 *   imgSrc:        string|null     // src attribute for img elements
 *   href:          string|null     // href attribute for a elements
 *   suggestedName: string          // auto-generated field name (e.g. 'subtitle', 'text1')
 *   type:          'text'|'image'|'link'
 * }
 *
 * Pure function – no DOM, no browser APIs.
 */
export function extractContentElements(contentHtml) {
  const html = String(contentHtml || '');
  const results = [];

  // Match self-closing img separately
  const imgRe = /<img([^>]*)>/gi;
  // Match regular tags: <tag attrs>...content...</tag>
  const tagRe = /<(h[2-6]|p|li|blockquote|a)([^>]*)>([\s\S]*?)<\/\1>/gi;

  // Collect all matches with their position in the string so we can deduplicate
  // overlapping captures (e.g. a <p> that contains an <a>).
  const raw = [];

  let m;
  while ((m = tagRe.exec(html)) !== null) {
    raw.push({ start: m.index, end: m.index + m[0].length, outerHtml: m[0], tag: m[1].toLowerCase(), attrs: m[2], inner: m[3] });
  }
  tagRe.lastIndex = 0;

  while ((m = imgRe.exec(html)) !== null) {
    raw.push({ start: m.index, end: m.index + m[0].length, outerHtml: m[0], tag: 'img', attrs: m[1], inner: '' });
  }
  imgRe.lastIndex = 0;

  // Sort by position
  raw.sort((a, b) => a.start - b.start);

  // Remove items fully contained within a previously accepted item (skip nested)
  const accepted = [];
  let lastEnd = -1;
  for (const item of raw) {
    if (item.start < lastEnd) continue; // nested inside previous – skip
    accepted.push(item);
    lastEnd = item.end;
  }

  // Counters for auto-naming
  const counters = {};

  for (let idx = 0; idx < accepted.length; idx++) {
    const item = accepted[idx];
    const { tag, attrs, outerHtml, inner } = item;

    const textValue = extractTextContent(inner || outerHtml);

    // img src
    const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
    const imgSrc = srcMatch ? srcMatch[1] : null;

    // a href
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    const href = hrefMatch ? hrefMatch[1] : null;

    // type
    const type = tag === 'img' ? 'image' : tag === 'a' ? 'link' : 'text';

    // suggested field name
    let base;
    if (/^h[2-6]$/.test(tag)) base = 'subtitle';
    else if (tag === 'p') base = 'text';
    else if (tag === 'li') base = 'item';
    else if (tag === 'blockquote') base = 'quote';
    else if (tag === 'a') base = 'link';
    else if (tag === 'img') base = 'image';
    else base = 'field';

    counters[base] = (counters[base] || 0) + 1;
    const suggestedName = counters[base] === 1 ? base : `${base}${counters[base]}`;

    results.push({ idx, tag, attrs, outerHtml, textValue, imgSrc, href, suggestedName, type });
  }

  return results;
}

/**
 * Apply user-selected field extractions to a block's template code and props.
 *
 * For each extraction with `selected: true`:
 * - Removes the element from `contentHtml`
 * - Inserts a Mustache conditional snippet into `templateCode`
 *   immediately before the `{{{content}}}` placeholder
 * - Adds the text/image value to `newProps[fieldName]`
 *
 * Returns { newCode, newProps, newContentHtml }
 *
 * Pure function – no DOM, no browser APIs.
 *
 * @param {string}   templateCode  - current template code (contains `{{{content}}}`)
 * @param {string}   contentHtml   - current props.content value
 * @param {Array}    extractions   - array of { outerHtml, fieldName, selected, tag, textValue, imgSrc }
 * @returns {{ newCode: string, newProps: Object, newContentHtml: string }}
 */
export function applyFieldExtractions(templateCode, contentHtml, extractions) {
  let newContentHtml = String(contentHtml || '');
  let newCode = String(templateCode || '');
  const newProps = {};

  const selected = (extractions || []).filter(e => e.selected && e.fieldName && e.fieldName.trim());

  for (const ext of selected) {
    const name = ext.fieldName.trim().replace(/[^a-zA-Z0-9_]/g, '_');

    // Remove element from contentHtml (exact match)
    newContentHtml = newContentHtml.replace(ext.outerHtml, '').trim();

    // Build Mustache snippet for this field
    let snippet;
    if (ext.tag === 'img') {
      snippet = `{{#${name}}}<img src="{{${name}}}"${ext.attrs.replace(/src=["'][^"']*["']/i, '').trim() ? ' ' + ext.attrs.replace(/src=["'][^"']*["']/i, '').trim() : ''} />{{/${name}}}`;
    } else if (ext.tag === 'a') {
      snippet = `{{#${name}}}<a href="{{${name}Href}}">{{${name}}}</a>{{/${name}}}`;
      newProps[`${name}Href`] = ext.href || '';
    } else {
      snippet = `{{#${name}}}<${ext.tag}${ext.attrs}>{{${name}}}</${ext.tag}>{{/${name}}}`;
    }

    // Insert snippet just before {{{content}}} in template code
    if (newCode.includes('{{{content}}}')) {
      newCode = newCode.replace('{{{content}}}', `${snippet}\n{{{content}}}`);
    } else {
      // No content placeholder – append at end of template body
      newCode = newCode.replace(/<\/([a-z][a-z0-9]*)\s*>\s*$/i, `${snippet}\n</$1>`);
    }

    // Store prop value
    if (ext.tag === 'img') {
      newProps[name] = ext.imgSrc || '';
    } else {
      newProps[name] = ext.textValue || '';
    }
  }

  // Clean up empty content placeholder if contentHtml became empty
  if (!newContentHtml.trim()) {
    newCode = newCode.replace(/\s*\{{{content}}}\s*/g, '');
  }

  return { newCode, newProps, newContentHtml };
}
