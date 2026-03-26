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

  if (tag === 'nav' || /\bnav(igation|bar)?\b/.test(classes)) return 'navigation';
  if (tag === 'footer' || /\bfooter\b/.test(classes)) return 'footer';
  if (tag === 'header' || /\b(hero|banner|jumbotron)\b/.test(classes)) return 'header';

  const imgCount = (content.match(/<img/g) || []).length;
  if (imgCount >= 2 || /\b(gallery|carousel|slider|grid)\b/.test(classes)) return 'gallery';

  if (/\bcta\b|\bcall-to-action\b/.test(classes)) return 'cta';

  if (tag === 'figure' || imgCount === 1 || /\bimage\b/.test(classes)) return 'image';

  if (tag === 'blockquote' || /\b(quote|testimonial|review)\b/.test(classes)) return 'quote';

  if (tag === 'ul' || tag === 'ol' || /\b(list|features|items)\b/.test(classes)) return 'list';

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
