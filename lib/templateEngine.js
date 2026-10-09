import Mustache from 'mustache';
import { marked } from 'marked';
import { extractFolderBlocks, extractPicgineBlocks } from './templateParser';

marked.setOptions({ breaks: true, gfm: true });

// Values that are HTML, or text already entity-escaped on save (pages API sanitizeRecursive turns
// "&" into "&amp;"), must be output unescaped ({{{key}}}); otherwise Mustache escapes the entities twice.
const HAS_MARKUP_OR_ENTITY = /<[^>]+>|&(?:amp|lt|gt|quot|#39|#x27);/;

// Convert a markdown string to HTML, unwrapping single-paragraph output
// so values can be placed inline in templates (e.g. <h1>{{title}}</h1>).
// Already-HTML values are returned unchanged.
function mdToHtml(s) {
  if (!s || typeof s !== 'string') return s;
  if (/<[a-z][\s\S]*>/i.test(s)) return s; // already HTML
  // Bare URLs must not be converted — they are used as href values in templates.
  if (/^https?:\/\/\S+$/.test(s.trim())) return s.trim();
  // Same for bare e-mail addresses: marked would autolink them, which breaks href="mailto:{{email}}".
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s.trim())) return s.trim();
  const html = marked.parse(s);
  const single = html.match(/^<p>([\s\S]*?)<\/p>\n?$/);
  // Plain text without any markdown effect: marked only entity-escaped it (& -> &amp;), and
  // {{key}} escapes again -> "&amp;amp;". Return the original so it is escaped exactly once.
  if (single && !/<[a-z]/i.test(single[1])) return s;
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

// Picgine sections are swapped out while the HTML-key rewriting ({{key}} → {{{key}}})
// runs, so a block prop that happens to share a name with a gallery field (e.g. a
// richtext "description") can't make gallery strings render unescaped.
const PICGINE_SECTION_RE = /\{\{#picgine:[\s\S]*?\{\{\/picgine:[^{}]*\}\}/g;
function shieldPicgineSections(code) {
  const parts = [];
  return {
    code: String(code || '').replace(PICGINE_SECTION_RE, (m) => `\u0000${parts.push(m) - 1}\u0000`),
    restore: (c) => c.replace(/\u0000(\d+)\u0000/g, (_, i) => parts[i]),
  };
}

// rawData is merged in after markdown/HTML-key processing, i.e. its strings are always
// HTML-escaped by Mustache — used for external data such as Picgine galleries.
export function renderTemplate(templateCode, data, rawData = {}) {
  try {
    // Pre-process data: convert markdown strings → HTML (each-block items included)
    const processedData = processMarkdownData(data || {});
    // Expand {{#each:name}} / {{/each:name}} → {{#name}} / {{/name}} before Mustache sees the code
    const shield = shieldPicgineSections(templateCode);
    const withEachExpanded = shield.code.replace(/\{\{([#/])each:([^{}]+)\}\}/g, '{{$1$2}}');
    // Expand {{#folder:name}} / {{/folder:name}} → {{#name}} / {{/name}} — bare {{#folder}} needs
    // no expansion, its property key is already 'folder' (see renderBlockRecursive, which
    // resolves the picked upload-folder path into an items array under that same key).
    const withFolderExpanded = withEachExpanded.replace(/\{\{([#/])folder:([^{}]+)\}\}/g, '{{$1$2}}');
    // Expand {{#if:name}} / {{/if:name}} → {{#name}} / {{/name}} (conditional blocks — renders only when name is non-empty)
    const withIfExpanded = withFolderExpanded.replace(/\{\{([#/^])if:([^{}]+)\}\}/g, '{{$1$2}}');
    // Strip :type annotations (e.g. {{header:number}} → {{header}}) before Mustache sees the code
    // Strip |Gruppe annotations (editor-only section label, e.g. {{title:text|Inhalt}} → {{title:text}})
    const groupAnnotationRe = /(\{\{\{?)([^{}#^/!>|]+?)\|[^{}]*(\}\}\}?)/g;
    const withoutGroups = withIfExpanded.replace(groupAnnotationRe, '$1$2$3');
    // select darf Optionen tragen: {{align:select(links, Mitte=center)}} → {{align}}
    const VALID_TYPES = 'text|textarea|number|url|image|date|select(?:\\([^{}()]*\\))?|color|array|checkbox';
    const typeAnnotationRe = new RegExp(
      `(\\{\\{\\{?)([^{}#^/!>]+?):(${VALID_TYPES})(\\}\\}\\}?)`,
      'g'
    );
    let cleaned = withoutGroups.replace(typeAnnotationRe, '$1$2$4');

    // Collect ALL key names (at any nesting depth, including inside each-arrays)
    // whose processed value is an HTML string — then force {{{key}}} unescaped output.
    const htmlKeyNames = new Set();
    function collectHtmlKeys(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(collectHtmlKeys); return; }
      Object.entries(obj).forEach(([k, v]) => {
        if (typeof v === 'string' && HAS_MARKUP_OR_ENTITY.test(v)) htmlKeyNames.add(k);
        else if (v && typeof v === 'object') collectHtmlKeys(v);
      });
    }
    collectHtmlKeys(processedData);

    htmlKeyNames.forEach((key) => {
      const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Lookaround guards keep this from matching *inside* an already-triple
      // {{{key}}} reference (which would otherwise become a mismatched
      // {{{{key}}}} — see lib/templateEngine.js's renderPage for the same fix).
      const doubleBraceRe = new RegExp(`(?<!\\{)\\{\\{\\s*${escapedKey}\\s*\\}\\}(?!\\})`, 'g');
      cleaned = cleaned.replace(doubleBraceRe, `{{{${key}}}}`);

      // If someone wrapped {{key}} into a paragraph, drop wrapper to avoid nested <p> issues.
      const pWrappedDouble = new RegExp(`<p\\s*>\\s*\\{\\{\\s*${escapedKey}\\s*\\}\\}\\s*<\/p\\s*>`, 'gi');
      cleaned = cleaned.replace(pWrappedDouble, `{{{${key}}}}`);
    });

    // Mustache.render verarbeitet Template-String mit Daten-Objekt
    // {{#picgine:name=slug}} / {{#picgine:name}} / {{/picgine:name}} → {{#name}} / {{/name}}
    cleaned = shield.restore(cleaned).replace(/\{\{([#/])picgine:([^{}=]+?)(?:=[^{}]*)?\}\}/g, '{{$1$2}}');

    return Mustache.render(cleaned, { ...processedData, ...rawData });
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
  const visible = (nodes || []).filter(n => (n.status === 'PUBLISHED' || n.isHomepage) && !Boolean(n?.data?.ignoreInNavigation));
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
 * Sammelt alle navigationId-Werte, die auf `type: 'navigation'`-Blöcken
 * (inkl. verschachtelter `children`) referenziert werden — damit der Aufrufer
 * genau die Navigationen per ID nachladen kann, die eine Seite tatsächlich nutzt.
 * @param {Array} blocks
 * @returns {string[]} eindeutige navigationId-Werte
 */
export function collectNavigationBlockIds(blocks) {
  const ids = new Set();
  const walk = (list) => {
    for (const block of (list || [])) {
      if (block?.type === 'navigation' && block.props?.navigationId) {
        ids.add(String(block.props.navigationId));
      }
      if (block?.children) walk(block.children);
    }
  };
  walk(blocks);
  return Array.from(ids);
}

/**
 * Sammelt alle globalPageId-Werte, die auf `type: 'global-page'`-Blöcken
 * (Widgets, inkl. verschachtelter `children`) referenziert werden — Pendant
 * zu collectNavigationBlockIds für die seitenbaum-unabhängigen Widgets.
 * @param {Array} blocks
 * @returns {string[]} eindeutige globalPageId-Werte
 */
export function collectGlobalPageBlockIds(blocks) {
  const ids = new Set();
  const walk = (list) => {
    for (const block of (list || [])) {
      if (block?.type === 'global-page' && block.props?.globalPageId) {
        ids.add(String(block.props.globalPageId));
      }
      if (block?.children) walk(block.children);
    }
  };
  walk(blocks);
  return Array.from(ids);
}

/**
 * Sammelt alle Ordnerpfade, die über {{#folder}}/{{#folder:name}}-Blöcke in den Templates
 * der übergebenen Blöcke (inkl. verschachtelter `children`) tatsächlich ausgewählt wurden —
 * damit der Aufrufer genau diese Ordner per listFolderItemsRecursive/API vorab auflösen kann,
 * bevor renderPage() läuft (renderPage selbst hat keinen Dateisystemzugriff).
 * @param {Array} blocks
 * @param {object} blockTemplates - Object mit Template-Namen → Template-Code
 * @returns {string[]} eindeutige, nicht-leere Ordnerpfade
 */
export function collectFolderBlockPaths(blocks, blockTemplates = {}) {
  const paths = new Set();
  const walk = (list) => {
    for (const block of (list || [])) {
      if (!block) continue;
      const templateName = block.template || block.type;
      const code = templateName ? blockTemplates[templateName] : null;
      if (code) {
        for (const { sectionName } of extractFolderBlocks(code)) {
          const folderPath = block.props?.[sectionName];
          // An empty/unset folder path means "nothing chosen yet" — never resolve the
          // entire uploads root implicitly, only an explicitly picked subfolder.
          if (folderPath) paths.add(String(folderPath));
        }
      }
      if (block.children) walk(block.children);
    }
  };
  walk(blocks);
  return Array.from(paths);
}

/**
 * Sammelt alle Picgine-Galerie-Slugs aus {{#picgine:name}}-Sections (Slug aus block.props)
 * und {{#picgine:name=slug}} (fester Slug) der übergebenen Blöcke inkl. `children` — damit
 * der Aufrufer die Galerie-Daten vor renderPage() laden kann.
 * @returns {string[]} eindeutige, nicht-leere Slugs
 */
export function collectPicgineSlugs(blocks, blockTemplates = {}) {
  const slugs = new Set();
  const walk = (list) => {
    for (const block of (list || [])) {
      if (!block) continue;
      const templateName = block.template || block.type;
      const code = templateName ? blockTemplates[templateName] : null;
      if (code) {
        for (const { sectionName, fixedSlug } of extractPicgineBlocks(code)) {
          const slug = fixedSlug || block.props?.[sectionName];
          if (slug) slugs.add(String(slug));
        }
      }
      if (block.children) walk(block.children);
    }
  };
  walk(blocks);
  return Array.from(slugs);
}

// Picgine-Antwort (GET /api/v1/galleries/:slug) → Template-Kontext (TEMGINE-INTEGRATION §3).
// Alle Felder (auch allowDownload, zip, images[].download, parentSlug) werden durchgereicht.
// Unterordner-Navigation (SPEC §11.9): `data` kann ein Unterordner der im Block gewählten
// Galerie `rootSlug` sein; Links zeigen auf `basePath?picgine=<slug>` (Wurzel: `basePath`),
// breadcrumb/parentUrl bleiben im gewählten Teilbaum.
export function toPicgineContext(data, rootSlug = data?.slug, basePath = '') {
  if (!data || typeof data !== 'object') return null;
  const locked = !!data.locked;
  const url = (slug) => (slug === rootSlug ? (basePath || '?') : `${basePath}?picgine=${encodeURIComponent(slug)}`);
  const isRoot = data.slug === rootSlug;
  const crumbs = Array.isArray(data.breadcrumb) ? data.breadcrumb : [];
  const rootIndex = crumbs.findIndex((c) => c?.slug === rootSlug);
  return {
    ...data,
    breadcrumb: isRoot || rootIndex < 0 ? [] : crumbs.slice(rootIndex).map((c) => ({ ...c, url: url(c.slug) })),
    parentUrl: isRoot || !data.parentSlug ? null : url(data.parentSlug),
    locked,
    lockPassword: locked && data.lockMode === 'password',
    lockLogin: locked && data.lockMode === 'users',
    loggedIn: !!data.loggedIn,
    cover: locked ? null : (data.cover || null),
    images: locked || !Array.isArray(data.images) ? [] : data.images.map((img, i) => ({ ...img, index: i + 1 })),
    children: Array.isArray(data.children) ? data.children.map((c) => ({ ...c, url: url(c.slug) })) : [],
  };
}

const RESERVED_NAV_SLUGS = new Set(['main', 'page', 'mobile', 'auto']);

/**
 * Wandelt einen Navigationsnamen in ein für Mustache-Platzhalter sicheres
 * Kürzel um (z. B. "Künstler Übersicht" → "kuenstler-uebersicht" ist NICHT
 * das Ziel — Umlaute werden einfach entfernt, kein Transliterieren).
 * @param {string} name
 * @returns {string}
 */
export function navPlaceholderSlug(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'navigation';
}

/**
 * Berechnet für eine Liste von Navigationen (nur { id, name } nötig) je Navigation
 * einen eindeutigen `nav:<slug>`-Platzhalter-Key. Reine Funktion der id/name-Paare,
 * damit Template-Editor (Einfügen-Buttons) und Renderer (Auflösung) immer exakt
 * denselben Platzhalter berechnen — unabhängig davon, wer sie aufruft.
 * @param {Array<{id: string, name: string}>} navList
 * @returns {Object<string, string>} id → "nav:<slug>"
 */
export function buildNavPlaceholderKeys(navList) {
  const sorted = [...(Array.isArray(navList) ? navList : [])]
    .filter((n) => n && n.id)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de') || String(a.id).localeCompare(String(b.id)));

  const used = new Set();
  const keys = {};
  for (const nav of sorted) {
    let base = navPlaceholderSlug(nav.name);
    if (RESERVED_NAV_SLUGS.has(base)) base = `${base}-nav`;
    let slug = base;
    let i = 2;
    while (used.has(slug)) {
      slug = `${base}-${i}`;
      i++;
    }
    used.add(slug);
    keys[nav.id] = `nav:${slug}`;
  }
  return keys;
}

/**
 * Hilfsfunktion: Seite rendern durch Zusammensetzen aller Block-Templates
 * @param {object} page - Seiten-Objekt mit { title, slug, blocks }
 * @param {object} blockTemplates - Object mit Template-Namen → Template-Code für Block-Rendering
 * @param {object} options - Render-Optionen:
 *   - isChild: Unterseite (setzt {{isChild}} im Block-Kontext)
 *   - navigations: { main, page, mobile, auto, byId } (Code + Daten je Navigation)
 *   - footer: aktiver Footer { code, data } oder null
 *   - globalVars: globale Variablen ({{global.X}})
 *   - globalPages: { byId } der Widgets
 *   - folderContents: Map Ordnerpfad → vorab aufgelöstes Item-Array (siehe
 *     collectFolderBlockPaths/lib/uploadFolder.js) — löst {{#folder}}-Blöcke auf, da renderPage
 *     selbst keinen Dateisystemzugriff hat (läuft auch clientseitig).
 *   - picgineContents: Map Galerie-Slug → Picgine-Galerie-Daten (siehe collectPicgineSlugs) —
 *     löst {{#picgine:name}}-Sections auf; fehlt der Slug, rendert die Section nichts. Bei
 *     Unterordner-Navigation (?picgine=) steht unter dem Wurzel-Slug die Unterordner-Antwort.
 *   - picgineBasePath: Seitenpfad für die Picgine-Unterordner-Links
 *   - blockSeparator, insertChildSeparators, betweenBlocks: optionale Trenner zwischen Blöcken
 * @returns {string} - Gerendertes HTML (alle Blöcke nacheinander)
 */
export function renderPage(page, blockTemplates = {}, options = {}) {
  const { navigations = {}, footer = null, globalVars = {}, folderContents = {}, globalPages = {}, picgineContents = {} } = options || {};
  // Pre-render navigation HTML once so every block can reference {{{nav:main}}} etc.
  const navHtml = {};
  for (const key of ['main', 'page', 'mobile', 'auto']) {
    const entry = navigations[key];
    if (entry && entry.code) {
      try {
        navHtml[`nav:${key}`] = Mustache.render(String(entry.code), { ...(entry.data || {}), global: globalVars });
      } catch (e) {
        navHtml[`nav:${key}`] = '';
      }
    } else {
      navHtml[`nav:${key}`] = '';
    }
  }

  // Named placeholders — every navigation known via navigations.byId (id → { name, code, data })
  // additionally becomes addressable as {{{nav:<slug-of-name>}}}, so several PAGE navs can be
  // told apart directly in a Template's code, independent of the "block" placement mechanism.
  const byId = navigations.byId || {};
  const placeholderKeys = buildNavPlaceholderKeys(
    Object.keys(byId).map((id) => ({ id, name: byId[id]?.name }))
  );
  for (const [id, key] of Object.entries(placeholderKeys)) {
    const entry = byId[id];
    if (!entry || !entry.code) continue;
    try {
      navHtml[key] = Mustache.render(String(entry.code), { ...(entry.data || {}), global: globalVars });
    } catch (e) {
      navHtml[key] = '';
    }
  }

  // Render blocks recursively so nested `children` arrays are supported.
  const renderBlockRecursive = (block) => {
    if (!block || block.hidden) return ''
    const templateName = block.template || block.type

    // Special type: blog-channel — outputs a client-hydrated placeholder div
    if (block.type === 'blog-channel') {
      const { channelSlug = '', templateSlot = 'templateDetailPreview', templateName = '', postLimit = 6 } = block.props || {};
      const templateAttr = templateName ? ` data-template="${escapeHtml(templateName)}"` : '';
      return `<div class="blog-channel-block" data-channel="${escapeHtml(channelSlug)}" data-slot="${escapeHtml(templateSlot)}"${templateAttr} data-limit="${parseInt(postLimit, 10) || 6}"></div>`;
    }

    // Special type: global-page — renders a specific (by id) Widget inline.
    // Anders als 'navigation' bekommt es keine seitenbaum-spezifischen Daten
    // (pages/anchors/childPages), nur {{global.X}} — wie Footer.
    if (block.type === 'global-page') {
      const globalPageId = block.props?.globalPageId || '';
      const entry = (globalPages.byId || {})[globalPageId];
      if (!entry || !entry.code) return '';
      try {
        return Mustache.render(String(entry.code), { global: globalVars });
      } catch (e) {
        return '';
      }
    }

    // Special type: navigation — renders a specific (by id) Seitennavigation inline
    if (block.type === 'navigation') {
      const navigationId = block.props?.navigationId || '';
      const navEntry = (navigations.byId || {})[navigationId];
      if (!navEntry || !navEntry.code) return '';
      try {
        return Mustache.render(String(navEntry.code), { ...(navEntry.data || {}), global: globalVars });
      } catch (e) {
        return '';
      }
    }
    if (templateName && blockTemplates[templateName]) {
      const childSeparator = (options && options.blockSeparator && options.insertChildSeparators) ? ("\n" + options.blockSeparator + "\n") : ''
      const childrenHtml = (block.children || []).map(renderBlockRecursive).filter(h => h).join(childSeparator)

      const blockData = {
        ...block.props,
        ...navHtml,
        global: globalVars,
        // `data` is a shorthand alias for `page.data`, so a page's custom fields
        // read the same way here as they already do inside navigation templates
        // ({{data.X}} per page in {{#pages}}) — {{page.data.X}} keeps working
        // for existing templates written against it.
        data: { ...(page?.data || {}) },
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

      // Resolve {{#folder}}/{{#folder:name}} sections: block.props[sectionName] holds the
      // picked upload-folder path (a string) — replace it with the pre-resolved items array
      // (folderContents, built by the caller via collectFolderBlockPaths) so Mustache can
      // iterate over it. An unset/empty path resolves to no items.
      try {
        for (const { sectionName } of extractFolderBlocks(localTemplateCode)) {
          const folderPath = block.props?.[sectionName];
          blockData[sectionName] = folderPath ? (folderContents[folderPath] || []) : [];
        }
      } catch (e) {}

      // Resolve {{#picgine:name}} / {{#picgine:name=slug}} sections to the gallery context —
      // passed as raw data so the gallery strings skip markdown processing and stay escaped.
      const picgineData = {}
      try {
        for (const { sectionName, fixedSlug } of extractPicgineBlocks(localTemplateCode)) {
          const slug = fixedSlug || block.props?.[sectionName];
          picgineData[sectionName] = slug ? toPicgineContext((picgineContents || {})[slug], String(slug), options?.picgineBasePath || '') : null;
        }
      } catch (e) {}

      const shield = shieldPicgineSections(localTemplateCode)
      localTemplateCode = shield.code
      try {
        const htmlKeys = Object.keys(blockData).filter(k => typeof blockData[k] === 'string' && HAS_MARKUP_OR_ENTITY.test(blockData[k]))
        for (const k of htmlKeys) {
          const escKey = String(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          // Lookaround guards: don't match {{key}} when it's really the inside
          // of an already-triple {{{key}}} reference (e.g. {{{nav:mobile}}}) —
          // that would otherwise become a mismatched {{{{key}}}}.
          const varRegex = new RegExp('(?<!\\{)\\{\\{\\s*' + escKey + '\\s*\\}\\}(?!\\})', 'g')
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

      localTemplateCode = shield.restore(localTemplateCode)

      try {
        if (localTemplateCode && (localTemplateCode.indexOf('&lt;') !== -1 || localTemplateCode.indexOf('&gt;') !== -1)) {
          localTemplateCode = unescapeHtml(localTemplateCode)
        }
      } catch (e) {}

      const renderedBlock = renderTemplate(localTemplateCode, blockData, picgineData)
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
    // Kein Template + html-Prop: freies HTML-Feld, unverändert ausgeben
    if (!block.template && typeof block.props?.html === 'string') {
      const childrenHtml = (block.children || []).map(renderBlockRecursive).filter(h => h).join('')
      return block.props.html + childrenHtml
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
  // MAIN nav is prepended. PAGE nav is available as {{{nav:page}}} but not auto-injected.
  const mainNav = navHtml['nav:main'] || ''

  // Only inject if the blocks HTML doesn't already contain the nav HTML (avoids double output)
  const hasMainNavInBlocks = mainNav && blocksHtml.includes(mainNav)

  // Render the active footer (if any) at the end of the layout, same context shape as nav/blocks.
  let footerHtml = ''
  if (footer && footer.code) {
    try {
      footerHtml = Mustache.render(String(footer.code), { ...(footer.data || {}), global: globalVars })
    } catch (e) {
      footerHtml = ''
    }
  }

  const parts = []
  if (mainNav && !hasMainNavInBlocks) parts.push(mainNav)
  parts.push(blocksHtml)
  if (footerHtml) parts.push(footerHtml)

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
