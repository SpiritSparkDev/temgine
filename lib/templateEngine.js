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
        // Rendere die Navigation mit der hierarchisch annotierten Seiten-Struktur
        return Mustache.render(navTemplate, { pages: annotated });
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
      const slugKeys = []
      processedTemplate = processedTemplate.replace(slugRegex, (m, name) => {
        // we'll create a computed var name and insert that
        const varName = `__slug_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`
        slugKeys.push({ varName, name })
        return `{{${varName}}}`
      })

      // general bound markers: #name -> {{name}}
      processedTemplate = processedTemplate.replace(/#([a-zA-Z0-9_.-]+)/g, (m, name) => `{{${name}}}`)

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
    return Mustache.render(processedTemplate, data);
  } catch (error) {
    console.error('Template-Rendering Fehler:', error);
    return `<div style="color: red; padding: 20px;">Template-Fehler: ${error.message}</div>`;
  }
}

/**
 * Hilfsfunktion: Seite rendern durch Zusammensetzen aller Block-Templates
 * @param {object} page - Seiten-Objekt mit { title, slug, template, blocks, data }
 * @param {object} blockTemplates - Object mit Template-Namen → Template-Code für Block-Rendering
 * @param {string} pageTemplateCode - Optional: Template-Code für das Seiten-Layout
 * @param {array} allPages - Optional: Alle Seiten für Navigation-Rendering
 * @param {object} navigationTemplates - Optional: Vorgeladene Navigation-Templates
 * @param {object} templateTemplates - Optional: Alle Templates für genestete Template-Verwendung
 * @returns {string} - Gerendertes HTML (alle Blöcke nacheinander oder in Seiten-Template)
 */
export function renderPage(page, blockTemplates = {}, pageTemplateCode = null, allPages = [], navigationTemplates = {}, templateTemplates = {}) {
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
          templateTemplates
        }

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
