/**
 * blockToDomMigration.js
 * Converts legacy block-template system pages to new DOM-based pages
 * 
 * Legacy format: { blocks: [{template, props, children}], data: {blockSlots} }
 * New format: { pageLayout: [{tag, id, attrs, children, content}], pageMetadata: {...} }
 */

/**
 * Check if a page needs migration from legacy format to new DOM format
 */
export function pageNeedsMigration(page) {
  if (!page) return false;
  
  // Already migrated or has new layout
  if (page.isMigrated || (page.pageLayout && Array.isArray(page.pageLayout) && page.pageLayout.length > 0)) {
    return false;
  }
  
  // Has old-style blocks or blockSlots data
  const hasBlocks = page.blocks && Array.isArray(page.blocks) && page.blocks.length > 0;
  const hasBlockSlots = page.data && page.data.blockSlots && Object.keys(page.data.blockSlots).length > 0;
  
  return hasBlocks || hasBlockSlots;
}

/**
 * Generate unique ID for DOM elements
 */
export function generateElementId() {
  return `elem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert legacy block to new DOM element
 */
function blockToElement(block, idPrefix = '') {
  if (!block) return null;
  
  const id = generateElementId();
  
  // Determine tag based on block type or template
  let tag = 'div';
  if (block.type === 'text') {
    tag = 'section';
  } else if (block.type === 'hero') {
    tag = 'header';
  } else if (block.type === 'gallery') {
    tag = 'figure';
  }
  
  const element = {
    id,
    tag,
    attrs: {
      class: block.template ? `block-${block.template.toLowerCase()}` : '',
      'data-template': block.template || '',
    },
    children: [],
    content: '',
    metadata: {
      legacyTemplate: block.template,
      legacyType: block.type,
      migratedAt: new Date().toISOString(),
    }
  };
  
  // Convert props to content or nested elements
  if (block.props && typeof block.props === 'object') {
    // If props has title/content, create nested elements
    if (block.props.title) {
      const titleEl = {
        id: generateElementId(),
        tag: 'h2',
        attrs: { class: 'block-title' },
        children: [],
        content: String(block.props.title),
      };
      element.children.push(titleEl);
    }
    
    if (block.props.content) {
      const contentEl = {
        id: generateElementId(),
        tag: 'p',
        attrs: { class: 'block-content' },
        children: [],
        content: String(block.props.content),
      };
      element.children.push(contentEl);
    }
    
    // Store other props as JSON comment
    const otherProps = { ...block.props };
    delete otherProps.title;
    delete otherProps.content;
    if (Object.keys(otherProps).length > 0) {
      element.metadata.legacyProps = otherProps;
    }
  }
  
  // Recursively convert children
  if (block.children && Array.isArray(block.children)) {
    for (const childBlock of block.children) {
      const childEl = blockToElement(childBlock, `${idPrefix}${element.id}_`);
      if (childEl) {
        element.children.push(childEl);
      }
    }
  }
  
  return element;
}

/**
 * Migrate a complete page from legacy to new DOM format
 */
export function migratePage(page) {
  if (!page) return { pageLayout: [], pageMetadata: {} };
  
  const pageLayout = [];
  
  // Convert legacy blocks to new elements
  if (page.blocks && Array.isArray(page.blocks)) {
    for (const block of page.blocks) {
      const element = blockToElement(block);
      if (element) {
        pageLayout.push(element);
      }
    }
  }
  
  // If no blocks but has blockSlots data, convert those
  if (pageLayout.length === 0 && page.data && page.data.blockSlots) {
    for (const [slotName, templateName] of Object.entries(page.data.blockSlots)) {
      const element = {
        id: generateElementId(),
        tag: 'div',
        attrs: {
          class: `slot-${slotName.toLowerCase()}`,
          'data-slot': slotName,
          'data-template': templateName,
        },
        children: [],
        content: '',
        metadata: {
          legacySlot: slotName,
          legacyTemplate: templateName,
          migratedAt: new Date().toISOString(),
        }
      };
      pageLayout.push(element);
    }
  }
  
  const pageMetadata = generatePageMetadata(pageLayout);
  
  return {
    pageLayout,
    pageMetadata,
    isMigrated: true,
  };
}

/**
 * Generate metadata from page layout (scan for classes, IDs, structure info)
 */
export function generatePageMetadata(pageLayout) {
  const metadata = {
    generatedAt: new Date().toISOString(),
    elementCount: 0,
    tags: [],
    classes: new Set(),
    ids: new Set(),
    hasHeadings: false,
    hasImages: false,
  };
  
  function traverse(elements) {
    for (const el of (elements || [])) {
      metadata.elementCount += 1;
      
      // Collect tag names
      if (!metadata.tags.includes(el.tag)) {
        metadata.tags.push(el.tag);
      }
      
      // Check for headings
      if (el.tag && el.tag.match(/^h[1-6]$/)) {
        metadata.hasHeadings = true;
      }
      
      // Check for images
      if (el.tag === 'img') {
        metadata.hasImages = true;
      }
      
      // Collect classes and IDs from attrs
      if (el.attrs) {
        if (el.attrs.id) {
          metadata.ids.add(el.attrs.id);
        }
        if (el.attrs.class) {
          const classes = String(el.attrs.class).split(/\s+/);
          classes.forEach(c => {
            if (c && !metadata.classes.has(c)) {
              metadata.classes.add(c);
            }
          });
        }
      }
      
      // Recurse into children
      if (Array.isArray(el.children)) {
        traverse(el.children);
      }
    }
  }
  
  traverse(pageLayout);
  
  // Convert sets to arrays for JSON serialization
  metadata.classes = Array.from(metadata.classes);
  metadata.ids = Array.from(metadata.ids);
  
  return metadata;
}

/**
 * Reverse migration: convert DOM layout back to legacy format
 * (for backward compatibility if needed)
 */
export function elementToBlock(element) {
  if (!element) return null;
  
  const block = {
    type: element.tag === 'section' ? 'text' : (element.tag === 'header' ? 'hero' : 'generic'),
    template: element.metadata?.legacyTemplate || element.attrs?.['data-template'] || '',
    props: {
      ...(element.metadata?.legacyProps || {}),
      title: element.children?.find(c => c.tag === 'h2')?.content || '',
      content: element.content || element.children?.find(c => c.tag === 'p')?.content || '',
    },
    children: [],
  };
  
  // Recursively convert children (skip h2, p that are converted to props)
  const childElements = element.children?.filter(c => c.tag !== 'h2' && c.tag !== 'p') || [];
  for (const childEl of childElements) {
    const childBlock = elementToBlock(childEl);
    if (childBlock) {
      block.children.push(childBlock);
    }
  }
  
  return block;
}

/**
 * Find duplicate IDs and classes in page metadata
 */
export function findDuplicateIdentifiers(pageLayout) {
  const duplicates = {
    ids: {},
    classes: {},
  };
  
  function traverse(elements) {
    for (const el of (elements || [])) {
      // Check for duplicate IDs
      if (el.attrs?.id) {
        const id = el.attrs.id;
        duplicates.ids[id] = (duplicates.ids[id] || 0) + 1;
      }
      
      // Check for duplicate classes
      if (el.attrs?.class) {
        const classes = String(el.attrs.class).split(/\s+/).filter(c => c);
        for (const cls of classes) {
          duplicates.classes[cls] = (duplicates.classes[cls] || 0) + 1;
        }
      }
      
      traverse(el.children);
    }
  }
  
  traverse(pageLayout);
  
  // Filter to only show actual duplicates
  const result = {
    ids: Object.fromEntries(Object.entries(duplicates.ids).filter(([, count]) => count > 1)),
    classes: Object.fromEntries(Object.entries(duplicates.classes).filter(([, count]) => count > 1)),
  };
  
  return result;
}
