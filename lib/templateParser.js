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
    if (raw && raw !== '&' && !raw.includes('navigation:') && !raw.includes('template:') && !raw.startsWith('nav:') && !raw.startsWith('each:')) {
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
    if (!raw || raw === '&' || raw.includes('navigation:') || raw.includes('template:') || raw.startsWith('nav:') || raw.startsWith('each:')) continue;
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
