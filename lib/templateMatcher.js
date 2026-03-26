/**
 * Template Matcher Helpers
 * Pure functions – no DOM, no Node.js APIs.
 * Matches detected HTML blocks against existing Temphelix block templates.
 */
import {
  extractTextContent,
  extractHeading,
  extractImageSrcs,
  extractLinks,
} from './htmlImporter.js';

/** Keyword hints per block type (checked against lowercased template name) */
const TYPE_HINTS = {
  text:       ['text', 'content', 'article', 'post', 'paragraph', 'richtext', 'body'],
  header:     ['header', 'hero', 'banner', 'intro', 'splash'],
  footer:     ['footer'],
  gallery:    ['gallery', 'images', 'grid', 'carousel', 'slider'],
  cta:        ['cta', 'call', 'action', 'button', 'contact'],
  image:      ['image', 'figure', 'photo', 'picture', 'img'],
  quote:      ['quote', 'testimonial', 'blockquote', 'review'],
  list:       ['list', 'features', 'items', 'ul', 'cards'],
  navigation: ['navigation', 'nav', 'menu'],
};

/**
 * Score how well a template matches a given block type (0–100).
 * Prefers BLOCK-type templates over SITE-type templates.
 */
export function computeMatchScore(blockType, templateName, templateType) {
  const name = String(templateName || '').toLowerCase();
  const type = String(blockType || 'text');
  const hints = TYPE_HINTS[type] || [type];

  let score = 0;

  for (const hint of hints) {
    if (name === hint) { score = Math.max(score, 95); break; }
    if (name.includes(hint)) score = Math.max(score, 60 + hint.length * 2);
  }

  // Prefer block-type templates when matching block content
  if (score > 0 && templateType === 'BLOCK') score = Math.min(100, score + 10);

  return score;
}

/**
 * Find the best-matching template for a block type from a list of templates.
 * Returns { template, score } or null when no match found.
 */
export function findBestMatch(blockType, templates) {
  let best = null;
  let bestScore = 0;

  for (const t of templates) {
    if (!t || !t.name) continue;
    const score = computeMatchScore(blockType, t.name, t.type);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  return best ? { template: best, score: bestScore } : null;
}

/**
 * Extract prop values from an HTML block, mapped to the template's variable names.
 * @param {string} htmlContent - raw innerHTML of the block
 * @param {string[]} templateVars - variable names from extractTemplateVariables()
 * @returns {Object} key → value mapping
 */
export function extractPropsFromHtml(htmlContent, templateVars = []) {
  const props = {};
  const heading = extractHeading(htmlContent);
  const text = extractTextContent(htmlContent);
  const images = extractImageSrcs(htmlContent);
  const links = extractLinks(htmlContent);

  for (const varName of templateVars) {
    const n = varName.toLowerCase();

    if (/title|heading|headline|ueberschrift|kopf/.test(n)) {
      props[varName] = heading || text.slice(0, 80);
    } else if (/text|content|body|description|inhalt|beschreibung/.test(n)) {
      // Extract paragraph content rather than dumping the full block HTML.
      // For "content" keep inner HTML (paired with {{{content}}} triple-stache);
      // for "text" and others collapse to plain text.
      const paraMatch = htmlContent.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (paraMatch) {
        props[varName] = /^content$/.test(n)
          ? paraMatch[1].trim()
          : extractTextContent(paraMatch[1]);
      } else if (/^content$/.test(n)) {
        // No <p> found – use full block HTML so HTML-aware fields stay populated
        props[varName] = htmlContent;
      } else {
        props[varName] = extractTextContent(htmlContent).slice(0, 200);
      }
    } else if (/img|image|src|bild|photo/.test(n)) {
      props[varName] = images[0] || '';
    } else if (/href|url|link/.test(n)) {
      props[varName] = links[0]?.href || '';
    } else if (/label|btntext|button|linktext/.test(n)) {
      props[varName] = links[0]?.text || '';
    } else if (/alt|caption/.test(n)) {
      props[varName] = images.length ? text.slice(0, 60) : '';
    } else {
      // Generic fallback: use plain-text summary
      props[varName] = text.slice(0, 120);
    }
  }

  return props;
}
