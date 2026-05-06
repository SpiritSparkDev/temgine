const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// Split "varName:type" → { name, explicitType }
// e.g. "header:number" → { name: "header", explicitType: "number" }
//      "title"         → { name: "title",  explicitType: null }
const VALID_EXPLICIT_TYPES = new Set(['text', 'textarea', 'number', 'url', 'image', 'date', 'select', 'color', 'array']);
function parseVarToken(raw) {
  const colon = raw.indexOf(':');
  if (colon === -1) return { name: raw, explicitType: null };
  const name = raw.slice(0, colon).trim();
  const maybeType = raw.slice(colon + 1).trim().toLowerCase();
  const explicitType = VALID_EXPLICIT_TYPES.has(maybeType) ? maybeType : null;
  // If the part after : is not a known type it could be a nav: or template: prefix — preserve as-is
  return { name: explicitType ? name : raw, explicitType };
}

/**
 * Extrahiert alle Platzhalter aus einem Mustache-Template
 * z.B. {{title}}, {{#blocks}}, {{images}}, {{header:number}}
 * Gibt auch verschachtelte Felder zurück wie button.url, button.label
 */
export function extractTemplateVariables(templateCode) {
  if (!templateCode) return [];

  const code = String(templateCode);
  const variables = new Set();
  const nestedSections = new Map(); // section -> [variablen darin]
  const eachInnerVarNames = new Set(); // vars inside {{#each:...}} — excluded from flat list

  // Finde alle {{#section}}...{{/section}} Blöcke mit deren Inhalt
  const sectionBlockPattern = /\{\{#([^{}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let sectionMatch;
  while ((sectionMatch = sectionBlockPattern.exec(code)) !== null) {
    const sectionName = sectionMatch[1].trim();
    const sectionContent = sectionMatch[2];

    // if: sections → the condition var AND inner vars are all regular fields
    if (sectionName.startsWith('if:')) {
      const condVar = sectionName.slice(3).trim();
      if (condVar) variables.add(condVar);
      const innerVarPattern = /\{\{([^{}#^/!>]+)\}\}/g;
      let innerMatch;
      while ((innerMatch = innerVarPattern.exec(sectionContent)) !== null) {
        const { name: iv } = parseVarToken(innerMatch[1].trim());
        if (iv && !iv.includes('.') && iv !== '&') variables.add(iv);
      }
      continue;
    }

    // each: and bare {{#each}} sections are handled by extractRepeaterBlocks — collect inner vars to exclude them
    if (sectionName.startsWith('each:') || sectionName === 'each') {
      const innerVarPattern = /\{\{([^{}#^/!>]+)\}\}/g;
      let innerMatch;
      while ((innerMatch = innerVarPattern.exec(sectionContent)) !== null) {
        const { name: innerVarName } = parseVarToken(innerMatch[1].trim());
        if (innerVarName) eachInnerVarNames.add(innerVarName);
      }
      continue;
    }

    const isArraySection = ['blocks', 'images', 'features', 'links', 'columns', 'navItems'].includes(sectionName);
    if (!isArraySection && sectionContent) {
      const innerVarPattern = /\{\{([^{}#^/!>]+)\}\}/g;
      let innerMatch;
      const innerVars = [];
      while ((innerMatch = innerVarPattern.exec(sectionContent)) !== null) {
        const { name: innerVarName } = parseVarToken(innerMatch[1].trim());
        if (innerVarName && !innerVarName.includes('.') && innerVarName !== '&') {
          innerVars.push(innerVarName);
        }
      }
      if (innerVars.length > 0) {
        nestedSections.set(sectionName, innerVars);
      }
    }
  }

  const simplePattern = /\{\{([^{}#^/!>]+)\}\}/g;
  let match;
  while ((match = simplePattern.exec(code)) !== null) {
    const raw = match[1].trim();
    if (raw && raw !== '&' && !raw.includes('navigation:') && !raw.includes('template:') && !raw.startsWith('nav:') && !raw.startsWith('each:') && !raw.startsWith('if:')) {
      const { name: varName } = parseVarToken(raw);
      if (varName.includes('.')) {
        variables.add(varName);
        continue;
      }
      // Skip vars that only appear inside each: sections
      if (eachInnerVarNames.has(varName)) continue;
      let isNested = false;
      for (const [, vars] of nestedSections) {
        if (vars.includes(varName)) { isNested = true; break; }
      }
      if (!isNested) {
        variables.add(varName);
      }
    }
  }

  for (const [section, vars] of nestedSections) {
    for (const v of vars) {
      variables.add(`${section}.${v}`);
    }
  }

  const ARRAY_NAMES = ['blocks', 'images', 'features', 'links', 'columns', 'navItems'];
  return Array.from(variables).filter(v => !ARRAY_NAMES.includes(v));
}

/**
 * Wie extractTemplateVariables, gibt aber zusätzlich den expliziten Typ zurück.
 * z.B. "{{header:number}}" → { varName: "header", explicitType: "number" }
 *      "{{title}}"         → { varName: "title",  explicitType: null }
 */
export function extractTypedVariables(templateCode) {
  if (!templateCode) return [];
  const code = String(templateCode);
  const seen = new Map(); // varName → explicitType

  // Collect var names inside {{#each:...}} and bare {{#each}} sections to exclude them from flat list
  const eachInnerVarNames = new Set();
  const eachSectionRe = /\{\{#each:([^{}]+)\}\}([\s\S]*?)\{\{\/each:\1\}\}/g;
  let em;
  while ((em = eachSectionRe.exec(code)) !== null) {
    const innerCode = em[2];
    const innerVarRe = /\{\{([^{}#^/!>]+)\}\}/g;
    let im;
    while ((im = innerVarRe.exec(innerCode)) !== null) {
      const { name } = parseVarToken(im[1].trim());
      if (name) eachInnerVarNames.add(name);
    }
  }
  // Also collect inner vars of bare {{#each}}...{{/each}}
  const bareEachRe = /\{\{#each\}\}([\s\S]*?)\{\{\/each\}\}/g;
  let bem;
  while ((bem = bareEachRe.exec(code)) !== null) {
    const innerVarRe = /\{\{([^{}#^/!>]+)\}\}/g;
    let im;
    while ((im = innerVarRe.exec(bem[1])) !== null) {
      const { name } = parseVarToken(im[1].trim());
      if (name) eachInnerVarNames.add(name);
    }
  }

  const allTokenPattern = /\{\{([^{}#^/!>]+)\}\}/g;
  let m;
  while ((m = allTokenPattern.exec(code)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw === '&' || raw.includes('navigation:') || raw.includes('template:') || raw.startsWith('nav:') || raw.startsWith('each:') || raw.startsWith('if:')) continue;
    const { name, explicitType } = parseVarToken(raw);
    if (eachInnerVarNames.has(name)) continue;
    if (!seen.has(name)) seen.set(name, explicitType);
    else if (explicitType && !seen.get(name)) seen.set(name, explicitType);
  }

  const ARRAY_NAMES = new Set(['blocks', 'images', 'features', 'links', 'columns', 'navItems']);
  const results = [];
  for (const [varName, explicitType] of seen) {
    if (!ARRAY_NAMES.has(varName)) results.push({ varName, explicitType });
  }
  return results;
}

/**
 * Bestimmt den Eingabetyp basierend auf dem Variablennamen
 * Unterstützt auch verschachtelte Felder wie "button.url"
 */
export function guessInputType(varName) {
  const lower = varName.toLowerCase();
  
  // Für verschachtelte Felder, benutze nur den Feldnamen nach dem Punkt
  const fieldName = varName.includes('.') ? varName.split('.').pop() : varName;
  const lowerField = fieldName.toLowerCase();
  
  if (lowerField.includes('image') || lowerField.includes('img') || lowerField.includes('avatar') || lowerField.includes('src')) {
    return 'image';
  }
  if (lowerField.includes('url') || lowerField.includes('link') || lowerField.includes('href')) {
    return 'url';
  }
  if (lowerField.includes('date') || lowerField.includes('year')) {
    return 'date';
  }
  if (lowerField.includes('price') || lowerField.includes('cost')) {
    return 'number';
  }
  if (lowerField.includes('content') || lowerField.includes('description') || lowerField.includes('text') || lowerField.includes('bio')) {
    return 'textarea';
  }
  if (lowerField.includes('features') || lowerField.includes('items') || lowerField.includes('links') || lowerField.includes('columns')) {
    return 'array';
  }
  
  return 'text';
}

/**
 * Generiert Standard-Props für ein Template
 * Unterstützt verschachtelte Felder wie "button.url" -> { button: { url: '' } }
 */
export function generateDefaultProps(templateCode) {
  const variables = extractTemplateVariables(templateCode);
  const props = {};
  
  variables.forEach(varName => {
    const inputType = guessInputType(varName);
    let defaultValue;
    
    switch (inputType) {
      case 'image':
        defaultValue = '';
        break;
      case 'array':
        defaultValue = [];
        break;
      case 'number':
        defaultValue = 0;
        break;
      default:
        defaultValue = '';
    }
    
    // Verschachtelte Felder behandeln (z.B. "button.url")
    if (varName.includes('.')) {
      const parts = varName.split('.');
      let current = props;
      
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }

      
      current[parts[parts.length - 1]] = defaultValue;
    } else {
      props[varName] = defaultValue;
    }
  });

  // Initialize {{#each:name}} repeater sections as empty arrays
  const repeaterBlocks = extractRepeaterBlocks(templateCode);
  for (const { sectionName } of repeaterBlocks) {
    if (!(sectionName in props)) {
      props[sectionName] = [];
    }
  }

  return props;
}

/**
 * Analysiert die HTML-Struktur eines Templates und gruppiert Variablen,
 * die sich im selben DOM-Container befinden.
 *
 * Rückgabe: Array von Gruppen { label: string|null, vars: string[], isGroup: boolean }
 *   - isGroup: true wenn 2+ Vars im selben Container (visuell zusammenfassen)
 *   - label: erster CSS-Klassenname des Containers (oder null)
 */
export function extractFieldGroups(templateCode) {
  if (!templateCode) return [];

  const ARRAY_NAMES = new Set(['blocks', 'images', 'features', 'links', 'columns', 'navItems']);
  const VOID_TAGS_SET = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const BLOCK_TAGS = new Set(['div', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'main', 'form', 'fieldset', 'figure', 'figcaption', 'details', 'summary', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']);

  // Tokenize: HTML open/close tags + mustache vars
  const tokens = [];
  const tokenRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(\b[^>]*)\/?>|\{\{([^{}#^/!>]+)\}\}/g;
  let m;
  while ((m = tokenRe.exec(templateCode)) !== null) {
    if (m[0].startsWith('<')) {
      const closing = m[1] === '/';
      const tag = m[2].toLowerCase();
      const attrs = m[3] || '';
      if (VOID_TAGS_SET.has(tag)) {
        // Extract vars from attributes (e.g. src="{{logo:image}}")
        const attrRe = /\{\{([^{}#^/!>]+)\}\}/g;
        let av;
        while ((av = attrRe.exec(attrs)) !== null) {
          const { name, explicitType } = parseVarToken(av[1].trim());
          if (name && !ARRAY_NAMES.has(name) && name !== '&')
            tokens.push({ type: 'var', name, explicitType });
        }
      } else {
        if (closing) {
          tokens.push({ type: 'close', tag });
        } else {
          const classMatch = attrs.match(/class="([^"]*)"/);
          tokens.push({
            type: 'open',
            tag,
            className: classMatch ? classMatch[1] : '',
            isBlock: BLOCK_TAGS.has(tag),
          });
        }
      }
    } else {
      const { name, explicitType } = parseVarToken(m[4].trim());
      if (name && !ARRAY_NAMES.has(name) && name !== '&')
        tokens.push({ type: 'var', name, explicitType });
    }
  }

  // Build a simple tree
  function createNode(tag, className, isBlock) {
    return { tag, className, isBlock, children: [] };
  }
  const root = createNode('__root__', '', true);
  const stack = [root];
  for (const token of tokens) {
    const top = stack[stack.length - 1];
    if (token.type === 'open') {
      const node = createNode(token.tag, token.className, token.isBlock);
      top.children.push(node);
      stack.push(node);
    } else if (token.type === 'close') {
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tag === token.tag) {
          stack.length = i; // pop down to i (exclusive)
          break;
        }
      }
    } else {
      top.children.push({ type: 'var', name: token.name, explicitType: token.explicitType });
    }
  }

  // Collect all var entries from a node's subtree
  function collectVars(node) {
    const seen = new Map();
    const walk = (n) => {
      for (const c of (n.children || [])) {
        if (c.type === 'var') {
          if (!seen.has(c.name)) seen.set(c.name, c.explicitType);
        } else if (c.children) {
          walk(c);
        }
      }
    };
    walk(node);
    return seen; // Map<name, explicitType>
  }

  // Recursively build groups.
  // alreadyGrouped: Set<string> — var names already assigned to a group
  function buildGroups(node, alreadyGrouped) {
    const result = [];
    const allVars = collectVars(node);
    if (allVars.size === 0) return result;

    const groupedByBlockChild = new Set();

    // First pass: recurse into block-level children that contain 2+ vars
    for (const child of (node.children || [])) {
      if (!child.children || !child.isBlock) continue;
      const childVars = collectVars(child);
      if (childVars.size >= 2) {
        const subGroups = buildGroups(child, alreadyGrouped);
        result.push(...subGroups);
        childVars.forEach((_, n) => groupedByBlockChild.add(n));
      }
    }

    // Remaining vars at this level (not handled by block children)
    const remaining = [];
    for (const [name, explicitType] of allVars) {
      if (!groupedByBlockChild.has(name) && !alreadyGrouped.has(name))
        remaining.push({ name, explicitType });
    }
    remaining.forEach(v => alreadyGrouped.add(v.name));

    if (remaining.length >= 2) {
      const rawClass = node.className || '';
      const label = rawClass.split(/\s+/).find(c => c.length > 2) || null;
      result.push({ label, vars: remaining.map(v => v.name), isGroup: true });
    } else if (remaining.length === 1) {
      result.push({ label: null, vars: [remaining[0].name], isGroup: false });
    }
    return result;
  }

  const grouped = new Set();
  const groups = buildGroups(root, grouped);

  // Sort groups by first-occurrence of their first var in the original template
  // so the editor order matches the template top-to-bottom order
  const posOf = (varName) => {
    const re = new RegExp(`\\{\\{[{]?\\s*${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s:}]`);
    const idx = templateCode.search(re);
    return idx === -1 ? Infinity : idx;
  };
  groups.sort((a, b) => posOf(a.vars[0]) - posOf(b.vars[0]));

  return groups;
}

/**
 * Extracts {{#each:name}}...{{/each:name}} repeater blocks from a template.
 * Returns [{ sectionName: string, subFields: [{ name: string, type: string }] }]
 */
export function extractRepeaterBlocks(templateCode) {
  if (!templateCode) return [];
  const code = String(templateCode);
  const results = [];

  const collectSubFields = (innerCode) => {
    const innerVarRe = /\{\{([^{}#^/!>]+)\}\}/g;
    const subFields = [];
    const seenSf = new Set();
    let im;
    while ((im = innerVarRe.exec(innerCode)) !== null) {
      const raw = im[1].trim();
      if (!raw || raw === '.' || raw.startsWith('nav:')) continue;
      const { name, explicitType } = parseVarToken(raw);
      if (name && !seenSf.has(name)) {
        seenSf.add(name);
        subFields.push({ name, type: explicitType || guessInputType(name) });
      }
    }
    return subFields;
  };

  // Match {{#each:name}}...{{/each:name}} (explicit repeater syntax)
  const sectionRe = /\{\{#each:([^{}]+)\}\}([\s\S]*?)\{\{\/each:\1\}\}/g;
  let m;
  while ((m = sectionRe.exec(code)) !== null) {
    const sectionName = m[1].trim();
    const subFields = collectSubFields(m[2]);
    if (subFields.length > 0) {
      results.push({ sectionName, subFields });
    }
  }

  // Also match bare {{#each}}...{{/each}} (implicit repeater — section literally named 'each')
  const bareEachRe = /\{\{#each\}\}([\s\S]*?)\{\{\/each\}\}/g;
  let bm;
  while ((bm = bareEachRe.exec(code)) !== null) {
    const subFields = collectSubFields(bm[1]);
    if (subFields.length > 0 && !results.find(r => r.sectionName === 'each')) {
      results.push({ sectionName: 'each', subFields });
    }
  }

  return results;
}

export function extractBlockTargets(templateCode) {
  if (!templateCode || typeof templateCode !== 'string') return [];

  const tokenRegex = /<\/?[a-zA-Z][^>]*>|\{\{\{[^}]+\}\}\}|\{\{[^}]+\}\}/g;
  const tokens = String(templateCode).match(tokenRegex) || [];
  const stack = [];
  const targets = [];
  const implicitCounts = {};

  for (const token of tokens) {
    if (/^<\//.test(token)) {
      if (stack.length > 0) stack.pop();
      continue;
    }

    if (/^</.test(token)) {
      const tagMatch = token.match(/^<\s*([a-zA-Z0-9-]+)/);
      if (!tagMatch) continue;
      const tagName = tagMatch[1].toLowerCase();
      const selfClosing = /\/>$/.test(token) || VOID_TAGS.has(tagName);
      if (!selfClosing) stack.push(tagName);
      continue;
    }

    const explicitSlotMatch = token.match(/^\{\{\{\s*blockSlot:([^}]+?)\s*\}\}\}$/);
    if (explicitSlotMatch) {
      const name = String(explicitSlotMatch[1] || '').trim();
      if (name) {
        targets.push({
          name,
          implicit: false,
          placeholder: 'blockSlot',
          tagName: stack[stack.length - 1] || ''
        });
      }
      continue;
    }

    if (/^\{\{\{?\s*blocks?\s*\}?\}\}$/.test(token)) {
      const tagName = stack[stack.length - 1] || 'content';
      const nextCount = (implicitCounts[tagName] || 0) + 1;
      implicitCounts[tagName] = nextCount;
      const name = nextCount === 1 ? tagName : `${tagName}-${nextCount}`;
      targets.push({
        name,
        implicit: true,
        placeholder: /blocks/.test(token) ? 'blocks' : 'block',
        tagName
      });
    }
  }

  return targets;
}
