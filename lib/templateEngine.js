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
        const blockData = { 
          ...block.props,
          pages: allPages,
          navigationTemplates,
          templateTemplates
        }
        return renderTemplate(blockTemplates[templateName], blockData)
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
  
  // Wenn Seiten-Template vorhanden, rendere damit
  if (pageTemplateCode) {
    const pageData = {
      ...(page.data || {}),
      // Restore original behavior: expose the page title to the page template
      title: page.title,
      slug: page.slug,
      blocks: blocksHtml,
      pages: allPages,
      navigationTemplates,
      templateTemplates
    }
    const rendered = renderTemplate(pageTemplateCode, pageData)

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
          return navHtml + '\n' + rendered
        } catch (e) {
          // non-fatal, fallback to rendered
          console.error('renderPage: failed to render main navigation fallback', e)
        }
      }
    }

    return rendered
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
