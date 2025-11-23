import Mustache from 'mustache';

/**
 * Template-Engine für Mustache-ähnliche Platzhalter
 * Unterstützt: {{variable}}, {{#blocks}}...{{/blocks}}, {{#if}}...{{/if}}, {{navigation:name}}
 */

/**
 * Verarbeitet {{navigation:name}} Platzhalter im Template
 * @param {string} templateCode - Template-Code mit Platzhaltern
 * @param {array} pages - Alle Seiten für Navigation
 * @param {object} navigationTemplates - Vorgeladene Navigation-Templates
 */
function processNavigationPlaceholders(templateCode, pages, navigationTemplates = {}) {
  const navigationRegex = /\{\{navigation:([a-zA-Z0-9_-]+)\}\}/g;
  

  return templateCode.replace(navigationRegex, (match, navName) => {
    const navTemplate = navigationTemplates[navName];

    if (navTemplate) {
      try {
        // Annotate hierarchical pages so each node.slug is a full path (parent/child)
        const annotated = annotateHierarchy(pages || []);
        // Debug: indicate navigation template is being rendered and show sample slugs/titles
        // eslint-disable-next-line no-console
        console.log(`processNavigationPlaceholders: rendering navigation '${navName}' with ${annotated.length} top-level pages (annotated)`)
        // eslint-disable-next-line no-console
        console.log('processNavigationPlaceholders: sample pages ->', annotated.slice(0,10).map(p => ({ slug: p.slug, title: p.title })) )
        // Build a flattened anchors list (slug + anchor entries) for easier templates
        const flatAnchors = [];
        try {
          const walk = (arr) => {
            for (const p of arr || []) {
              const pgSlug = String(p.slug || '');
              if (p.anchors && Array.isArray(p.anchors)) {
                for (const a of p.anchors) {
                  flatAnchors.push({ slug: pgSlug, id: a.id, anchorId: a.id, anchor: a.id, title: a.title || '' });
                }
              }
              if (p.children && p.children.length) walk(p.children);
            }
          };
          walk(annotated);
        } catch (e) {
          // ignore
        }

        // Debug: show annotated pages with their anchors and the flattened anchors list
        try {
          // eslint-disable-next-line no-console
          console.log('processNavigationPlaceholders: annotated pages (anchors):', annotated.map(p => ({ slug: p.slug, anchors: p.anchors ? p.anchors.map(a => ({ id: a.id, title: a.title, slug: a.slug })) : [] })));
          // eslint-disable-next-line no-console
          console.log('processNavigationPlaceholders: flatAnchors ->', flatAnchors.slice(0,50));
        } catch (e) {}

        // Rendere die Navigation mit der hierarchisch annotierten Seiten-Struktur
        // Provide both `pages` and flattened `anchors` to the navigation template
        // Replace '#' with a temporary marker so later preprocessing (which converts
        // `#name` -> `{{name}}`) does not accidentally remove fragment identifiers
        const navHtml = Mustache.render(navTemplate, { pages: annotated, anchors: flatAnchors });
        return String(navHtml).replace(/#/g, '___NAV_HASH___')
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`processNavigationPlaceholders: render failed for '${navName}':`, e)
        return `<!-- navigation '${navName}' render error -->`
      }
    }
    // eslint-disable-next-line no-console
    console.debug(`processNavigationPlaceholders: navigation template not found for '${navName}'`)
    return match; // Behalte Platzhalter, wenn Navigation nicht gefunden
  });
}

// Helper: annotate hierarchical pages with full slugs (e.g. parent/child)
// Returns a new tree where each node.slug is replaced by its full path and children are annotated too.
const annotateHierarchy = (nodes = [], parentPath = '') => {
  return (nodes || []).map(n => {
    const base = String(n.slug || '').trim();
    const full = parentPath ? `${parentPath}/${base}` : base;
    const copy = { ...n, slug: full };
    // Build an `anchors` array from blocks: allow templates to render per-page anchors
    try {
      const anchors = [];
      const seen = new Set();
      // Blocks may contain props like `anchorId`, `headingText` or `title` which can be used to build anchors
      const blkList = (n.blocks && Array.isArray(n.blocks)) ? n.blocks : [];
      for (const b of blkList) {
        if (!b || !b.props) continue;
        // Only create anchors when an explicit `anchorId` (or `id`) was provided
        // from the backend/editor. Do NOT derive anchors from headings/content here,
        // because derived anchors should not produce frontend fragment targets.
        const candidate = b.props.anchorId || b.props.id || null;
        if (!candidate) continue;
        // derive id from the explicit candidate and ensure slug-like form
        let id = String(candidate).trim();
        if (!id) continue;
        id = slugify(id);
        if (seen.has(id)) continue;
        seen.add(id);
        // For title, prefer an explicit heading/title if present, otherwise fallback to
        // an empty string — we don't want to pull large content into anchor titles here.
        let title = '';
        if (b.props.headingText) title = String(b.props.headingText).trim();
        else if (b.props.title) title = String(b.props.title).trim();
        anchors.push({ id, title, slug: full });
      }
      if (anchors.length > 0) copy.anchors = anchors;
      else copy.anchors = [];
      // If no title for anchor entries, try to fallback to page title
      try {
        if (copy.anchors && copy.anchors.length > 0) {
          copy.anchors = copy.anchors.map(a => ({ id: a.id, anchorId: a.id, anchor: a.id, title: a.title || String(n.title || ''), slug: a.slug || full }));
        }
      } catch (e) {}
      // Debug: list anchors generated for this page
      try { console.debug('annotateHierarchy: anchors for', full, copy.anchors); } catch (e) {}
    } catch (e) {
      // non-fatal: if anchor extraction fails, just leave anchors empty
      // eslint-disable-next-line no-console
      console.warn('annotateHierarchy: failed to extract anchors for page', n && n.slug, e)
      copy.anchors = [];
    }
    if (n.children && n.children.length) {
      copy.children = annotateHierarchy(n.children, full);
    } else {
      copy.children = [];
    }
    return copy;
  });
};

// Helper: flatten annotated hierarchical pages into a flat array (preorder)
const flattenPages = (nodes = []) => {
  const out = [];
  const walk = (arr) => {
    for (const n of arr || []) {
      out.push(n);
      if (n.children && n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
};

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

// Helper: resolve nested properties from an object by path like 'data.excerpt' or 'images.0.src'
const getNestedProp = (obj, path) => {
  if (!obj || !path) return undefined
  const parts = String(path).split('.')
  let cur = obj
  for (const p of parts) {
    if (cur === undefined || cur === null) return undefined
    // handle array index like images.0
    if (/^\d+$/.test(p)) {
      const idx = parseInt(p, 10)
      cur = Array.isArray(cur) ? cur[idx] : undefined
    } else {
      cur = cur[p]
    }
  }
  return cur
}

/**
 * Verarbeitet {{template:name}} Platzhalter im Template (genestete Templates)
 * @param {string} templateCode - Template-Code mit Platzhaltern
 * @param {object} templateTemplates - Vorgeladene Templates
 * @param {object} data - Daten für das Template-Rendering
 */
function processTemplatePlaceholders(templateCode, templateTemplates = {}, data = {}) {
  const templateRegex = /\{\{template:([a-zA-Z0-9_-]+)\}\}/g;
  
  return templateCode.replace(templateRegex, (match, templateName) => {
    const nestedTemplate = templateTemplates[templateName];
    
    if (nestedTemplate) {
      // Rendere das genestete Template mit den übergebenen Daten
      return Mustache.render(nestedTemplate, data);
    }
    return match; // Behalte Platzhalter, wenn Template nicht gefunden
  });
}

export function renderTemplate(templateCode, data) {
  try {
    // Verarbeite Navigation-Platzhalter zuerst
    let processedTemplate = processNavigationPlaceholders(
      templateCode, 
      data.pages || [], 
      data.navigationTemplates || {}
    );
    // Replace bound-snippet markers like #title or #data.excerpt with mustache variables
    try {
      // First handle slug/class tokens: #slug:FIELD or #class:FIELD -> produce safe class names
      const slugRegex = /#(?:slug|class):([a-zA-Z0-9_.-]+)/g
        // Process snippet placeholders like {{snippet:Label}} by replacing with escaped string values
        try {
            const snippets = (data && data.snippets) || {}
            // Debug: list snippet keys passed into the template engine
            try {
              // eslint-disable-next-line no-console
              console.debug('renderTemplate: snippets keys ->', Object.keys(snippets || {}))
            } catch (e) {}

            if (snippets && Object.keys(snippets).length > 0) {
              // Support unescaped HTML insertion via {{snippetHtml:Label}}
              // If a snippet value starts with '#', treat it as a bound variable
              // (e.g. snippet value '#title' will insert the value of `data.title`).
              processedTemplate = processedTemplate.replace(/\{\{snippetHtml:([a-zA-Z0-9_\- ]+)\}\}/g, (m, name) => {
                const key = String(name).trim()
                const val = snippets[key]
                if (val == null) return ''
                if (typeof val === 'string' && val.startsWith('#')) {
                  const bound = String(val).slice(1)
                  const boundVal = getNestedProp(data, bound) || (data && data[bound])
                  return boundVal == null ? '' : String(boundVal)
                }
                return String(val)
              })

              // Default: escaped insertion for safe text
              processedTemplate = processedTemplate.replace(/\{\{snippet:([a-zA-Z0-9_\- ]+)\}\}/g, (m, name) => {
                const key = String(name).trim()
                const val = snippets[key]
                if (val == null) return ''
                if (typeof val === 'string' && val.startsWith('#')) {
                  const bound = String(val).slice(1)
                  const boundVal = getNestedProp(data, bound) || (data && data[bound])
                  return escapeHtml(boundVal == null ? '' : String(boundVal))
                }
                return escapeHtml(String(val))
              })
            }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('renderTemplate: failed to process snippet placeholders', e)
        }
      const slugKeys = []
      processedTemplate = processedTemplate.replace(slugRegex, (m, name) => {
        // we'll create a computed var name and insert that
        const varName = `__slug_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`
        slugKeys.push({ varName, name })
        return `{{${varName}}}`
      })

      // Note: removed the global shorthand '#name' -> '{{name}}' replacement because
      // it conflicted with URL fragments and other uses of '#'. Snippets that used
      // to rely on '#name' should be stored as snippet values (e.g. '#title') and
      // are handled above when processing {{snippet:Label}} placeholders.

      // compute slug/class values on data object so Mustache can render them
      if (!data) data = {}
      for (const sk of slugKeys) {
        if (data[sk.varName] === undefined) {
          const rawVal = getNestedProp(data, sk.name)
          data[sk.varName] = slugify(String(rawVal || ''))
        }
      }
    } catch (e) {}
    
    // Verarbeite Template-Platzhalter (genestete Templates)
    processedTemplate = processTemplatePlaceholders(
      processedTemplate,
      data.templateTemplates || {},
      data
    );
    
    // Mustache.render verarbeitet Template-String mit Daten-Objekt
    const finalRendered = Mustache.render(processedTemplate, data);
    // Restore any protected navigation hashes we replaced earlier
    try {
      return String(finalRendered).replace(/___NAV_HASH___/g, '#')
    } catch (e) {
      return finalRendered
    }
  } catch (error) {
    console.error('Template-Rendering Fehler:', error);
    return `<div style="color: red; padding: 20px;">Template-Fehler: ${error.message}</div>`;
  }
}

/**
 * Hilfsfunktion: Seite rendern durch Zusammensetzen aller Block-Templates
 * @param {object} page - Seiten-Objekt mit { title, slug, template, blocks, data }

 * @param {object} blockTemplates - Object mit Template-Namen → Template-Code für Block-Rendering
    const escapeHtml = (s) => {
      if (s === undefined || s === null) return ''
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    }
 * @param {string} pageTemplateCode - Optional: Template-Code für das Seiten-Layout
 * @param {array} allPages - Optional: Alle Seiten für Navigation-Rendering
 * @param {object} navigationTemplates - Optional: Vorgeladene Navigation-Templates
 * @param {object} templateTemplates - Optional: Alle Templates für genestete Template-Verwendung
 * @returns {string} - Gerendertes HTML (alle Blöcke nacheinander oder in Seiten-Template)
 */
export function renderPage(page, blockTemplates = {}, pageTemplateCode = null, allPages = [], navigationTemplates = {}, templateTemplates = {}, snippets = {}) {
  // Rendere jeden Block mit seinem Template
  // Debug: show incoming page.blocks and available blockTemplates keys
  // eslint-disable-next-line no-console
  console.log('renderPage: page id/slug ->', page && (page.id || page.slug))
  // eslint-disable-next-line no-console
  console.log('renderPage: blocks ->', (page && page.blocks) || [])
  // eslint-disable-next-line no-console
  console.log('renderPage: available blockTemplates keys ->', Object.keys(blockTemplates || {}))
  // Per-block diagnostics: which template name will be used and whether it's present
  try {
    (page.blocks || []).forEach((b, i) => {
      const tmplName = (b && (b.template || b.type)) || '(none)'
      // eslint-disable-next-line no-console
      console.log(`renderPage: block[${i}] templateName ->`, tmplName, 'found->', !!(blockTemplates && blockTemplates[tmplName]))
      // eslint-disable-next-line no-console
      console.log(`renderPage: block[${i}] props ->`, b && b.props)
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('renderPage: failed to log per-block diagnostics', e)
  }
  const blockHtmls = (page.blocks || [])
    .map(block => {
      // Use explicit block.template, or fallback to block.type when template is empty
      const templateName = block.template || block.type
      if (templateName && blockTemplates[templateName]) {
          if (!block.template && block.type) {
          // helpful debug when blocks omit the template name
          // eslint-disable-next-line no-console
          console.log(`renderPage: falling back to block.type '${block.type}' for rendering`)
        }
        // Prepare block data
        const blockData = {
          ...block.props,
          pages: allPages,
          navigationTemplates,
          templateTemplates,
          // provide snippets map to block templates so {{snippet:Label}} works inside blocks
          ...(snippets || {}) && { snippets }
        }

        // Ensure blockData exposes an `id` field only when an explicit anchorId
        // or anchor was provided by the backend/editor. Do NOT derive ids from
        // headings/content here — derived anchors should not produce frontend ids.
        try {
          if ((!blockData.id || String(blockData.id).trim() === '') && (blockData.anchorId || blockData.anchor)) {
            blockData.id = String(blockData.anchorId || blockData.anchor || '').trim();
          }
        } catch (e) {}

        // Heuristic: if template expects {{title}} but title is empty, fill from h1..h5 or headingText
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

        // If certain props contain HTML, ensure the template renders them unescaped by swapping to triple-mustache
        let localTemplateCode = blockTemplates[templateName]
        try {
          const htmlKeys = Object.keys(blockData).filter(k => typeof blockData[k] === 'string' && /<[^>]+>/.test(blockData[k]))
          if (htmlKeys.length > 0) {
            // eslint-disable-next-line no-console
            console.log('renderPage: htmlKeys detected for block, promoting to triple-mustache ->', htmlKeys)
            for (const k of htmlKeys) {
              // escape the key for use in regex
              const escKey = String(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              // replace occurrences of {{ key }} with {{{ key }}} (global, allow whitespace)
              const varRegex = new RegExp('\\{\\{\\s*' + escKey + '\\s*\\}\\}', 'g')
              localTemplateCode = localTemplateCode.replace(varRegex, `{{{${k}}}}`)
                // Also, if the template wraps the variable in a <p>...</p>, unwrap it
                // Replace patterns like <p> {{ {key} }} </p> or <p> {{ key }} </p> with {{{key}}}
                try {
                  const pWrappedTriple = new RegExp('<p\\s*>\\s*\\{\\{\\{\\s*' + escKey + '\\s*\\}\\}\\}\\s*<\\/p\\s*>', 'gi')
                  localTemplateCode = localTemplateCode.replace(pWrappedTriple, `{{{${k}}}}`)
                  const pWrappedDouble = new RegExp('<p\\s*>\\s*\\{\\{\\s*' + escKey + '\\s*\\}\\}\\s*<\\/p\\s*>', 'gi')
                  localTemplateCode = localTemplateCode.replace(pWrappedDouble, `{{{${k}}}}`)
                } catch (e) {
                  // ignore
                }

                // If the value itself is wrapped in a single outer <p>...</p> and contains other block-level tags,
                // remove that surrounding <p> to avoid double paragraphs when inserted into templates.
                try {
                  const val = String(blockData[k] || '')
                  // Use [\s\S] instead of the 's' (dotAll) flag for compatibility
                  if (/^<p[^>]*>[\s\S]*<\/p>$/i.test(val) && /<(?:h[1-6]|article|section|div|ul|ol|li|table|header|footer|nav|blockquote)[\s>]/i.test(val)) {
                    // strip outer <p>...</p>
                    blockData[k] = val.replace(/^<p[^>]*>\s*|\s*<\/p>$/gi, '')
                  }
                } catch (e) {}
            }
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('renderPage: failed to normalize template for HTML props', e)
        }

        // If template code itself appears HTML-escaped (e.g. &lt;article&gt;), unescape it
        try {
          if (localTemplateCode && (localTemplateCode.indexOf('&lt;') !== -1 || localTemplateCode.indexOf('&gt;') !== -1)) {
            // eslint-disable-next-line no-console
            console.log('renderPage: detected escaped HTML in block template code - unescaping')
            localTemplateCode = unescapeHtml(localTemplateCode)
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('renderPage: failed to unescape block template code', e)
        }

        return renderTemplate(localTemplateCode, blockData)
      }
      // Fallback: wenn Template nicht gefunden, gib sichtbaren Debug-HTML zurück
      // Das hilft im Frontend zu erkennen, welche Blocks fehlen.
      try {
        const propsPreview = block.props ? JSON.stringify(block.props).replace(/</g, '&lt;') : ''
        return `<div class="missing-block" style="border:1px dashed #c00;padding:8px;margin:6px 0;background:#fff7f7;color:#600">Missing template: ${String(templateName || '(none)')}<pre style="white-space:pre-wrap">${propsPreview}</pre></div>`
      } catch (e) {
        return `<div class="missing-block">Missing template: ${String(templateName || '(none)')}</div>`
      }
    })
    .filter(html => html)
  
  const blocksHtml = blockHtmls.join('\n')
  // Debug: show blocksHtml size and a short preview to help diagnose missing output
  try {
    // eslint-disable-next-line no-console
    console.log('renderPage: blocksHtml length ->', blocksHtml.length)
    // eslint-disable-next-line no-console
    console.log('renderPage: blocksHtml preview ->', blocksHtml.slice(0, 300))
  } catch (e) {}
  // If there were blocks defined but nothing rendered, provide a visible debug panel
  const noBlocksButDefined = (!blocksHtml || blocksHtml.trim() === '') && Array.isArray(page.blocks) && page.blocks.length > 0
  let debugBlocksPanel = ''
  if (noBlocksButDefined) {
    try {
      const needed = (page.blocks || []).map(b => ({ type: b.type, template: b.template || b.type }))
      const available = Object.keys(blockTemplates || {})
      debugBlocksPanel = `<div style="border:2px dashed #f39c12;padding:12px;margin:12px 0;background:#fffaf0;color:#5a3b00"><strong>Debug: Blocks not rendered</strong><div style="margin-top:8px">Needed templates: <pre style=\"white-space:pre-wrap\">${JSON.stringify(needed, null, 2)}</pre></div><div>Loaded template keys: <pre style=\"white-space:pre-wrap\">${JSON.stringify(available, null, 2)}</pre></div></div>`
    } catch (e) {
      debugBlocksPanel = '<div style="color:#c00;padding:8px">Debug: Blocks not rendered (failed to build debug info)</div>'
    }
  }
  
  // Wenn Seiten-Template vorhanden, rendere damit
  if (pageTemplateCode) {
    // Merge metadata title and pageHeader but do not expose them to templates as visible fields
    const mergedMetaTitle = (page.data && (page.data.pageHeader || page.data.header)) ? (page.data.pageHeader || page.data.header) : page.title;
    const pageData = {
      ...(page.data || {}),
      // Keep metaTitle for metadata uses (not rendered by templates unless explicitly used)
      metaTitle: mergedMetaTitle,
      // Remove visible title/header/pageHeader to avoid rendering them directly in templates
      title: '',
      header: '',
      pageHeader: '',
      slug: page.slug,
      blocks: blocksHtml,
      pages: allPages,
      navigationTemplates,
      templateTemplates
      ,
      snippets
    }
    // If the page template used a double-mustache for blocks, promote it to triple-mustache
    try {
      const hasTriple = /\{\{\{\s*blocks\s*\}\}\}/.test(pageTemplateCode)
      const hasDouble = /\{\{\s*blocks\s*\}\}/.test(pageTemplateCode)
      // Debug: show whether template contains double/triple variants
      // eslint-disable-next-line no-console
      console.log('renderPage: pageTemplate hasDouble->', hasDouble, 'hasTriple->', hasTriple)
      if (hasDouble && !hasTriple) {
        // eslint-disable-next-line no-console
        console.log('renderPage: promoting {{blocks}} to {{{blocks}}} to avoid HTML-escaping')
        // Replace only the double-mustache occurrences (safe because triple form absent)
        pageTemplateCode = pageTemplateCode.replace(/\{\{\s*blocks\s*\}\}/g, '{{{blocks}}}')
        // eslint-disable-next-line no-console
        console.log('renderPage: pageTemplateCode after promotion preview ->', String(pageTemplateCode).slice(0,200))
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('renderPage: failed to promote blocks placeholder', e)
    }

    const rendered = renderTemplate(pageTemplateCode, pageData)
    // If the page template does not include a blocks placeholder, append the blocksHtml
    const blocksPlaceholderRegex = /\{\{\{blocks\}\}\}|\{\{blocks\}\}/
    let finalRendered = rendered
    if (!blocksPlaceholderRegex.test(pageTemplateCode) && blocksHtml && blocksHtml.trim()) {
      // append blocks in a container so they are visible even if the template forgot {{{blocks}}}
      finalRendered = rendered + '\n' + `<div class="page-content">${blocksHtml}</div>`
      // eslint-disable-next-line no-console
      console.log('renderPage: page template missing {{{blocks}}} - appending blocksHtml to output')
    }
    // Wenn das Seiten-Template selbst keine {{navigation:...}} Platzhalter enthält,
    // füge die Standard-Navigation 'main' oben hinzu (sofern vorhanden), damit
    // auch Child-Seiten eine Navigation sehen, ohne Template-Anpassung.
    const navigationRegex = /\{\{navigation:[a-zA-Z0-9_-]+\}\}/g
    if (!navigationRegex.test(pageTemplateCode)) {
      const mainNav = navigationTemplates && navigationTemplates['main']
      if (mainNav) {
        try {
          const annotated = annotateHierarchy(allPages || [])
          const navHtml = Mustache.render(mainNav, { pages: annotated })
          // prepend debug panel if blocks were defined but produced no output
          return navHtml + '\n' + (debugBlocksPanel || '') + finalRendered
        } catch (e) {
          // non-fatal, fallback to rendered
          console.error('renderPage: failed to render main navigation fallback', e)
        }
      }
    }

    // If no main nav fallback or nav rendered, still include debug panel when blocks missing
    return (debugBlocksPanel || '') + finalRendered
  }
  
  // Sonst nur die Blöcke zurückgeben
  return blocksHtml
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
