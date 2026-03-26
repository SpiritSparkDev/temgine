const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const SNIPPET_REFERENCE_REGEX = /\{\{snippet(?:Html)?:([a-zA-Z0-9_\- ]+)\}\}/g;

export function expandSnippetReferences(templateCode, snippetsByKey = {}, seenKeys = new Set()) {
  if (!templateCode) return '';

  return String(templateCode).replace(SNIPPET_REFERENCE_REGEX, (_match, rawKey) => {
    const key = String(rawKey || '').trim();
    if (!key) return '';
    if (seenKeys.has(key)) return '';
    const snippetCode = snippetsByKey?.[key];
    if (!snippetCode) return '';
    const nextSeen = new Set(seenKeys);
    nextSeen.add(key);
    return expandSnippetReferences(String(snippetCode), snippetsByKey, nextSeen);
  });
}

/**
 * Extrahiert alle Platzhalter aus einem Mustache-Template
 * z.B. {{title}}, {{#blocks}}, {{images}}, {{snippetHtml:heading-dynamisch}}
 * Gibt auch verschachtelte Felder zurück wie button.url, button.label
 */
export function extractTemplateVariables(templateCode, snippetsByKey = {}) {
  if (!templateCode) return [];
  const expandedTemplate = expandSnippetReferences(templateCode, snippetsByKey);
  
  const variables = new Set();
  const nestedSections = new Map(); // section -> [variablen darin]
  
  // Extrahiere Legacy-Feldannotation {{snippet:field[Label]}}
  // nur noch für alte Templates, damit bestehende Eingabefelder weiter erkannt werden.
  const snippetPattern = /\{\{snippet:([a-zA-Z0-9_.-]+)(?:\[([^\]]*)\])?\}\}/g;
  let snippetMatch;
  while ((snippetMatch = snippetPattern.exec(expandedTemplate)) !== null) {
    const fieldName = snippetMatch[1].trim();
    if (fieldName) {
      variables.add(fieldName);
    }
  }
  
  // Finde alle {{#section}}...{{/section}} Blöcke mit deren Inhalt
  const sectionBlockPattern = /\{\{#([^{}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let sectionMatch;
  
  while ((sectionMatch = sectionBlockPattern.exec(expandedTemplate)) !== null) {
    const sectionName = sectionMatch[1].trim();
    const sectionContent = sectionMatch[2];
    
    // Ignoriere spezielle Sections wie 'blocks', 'images', etc. (Arrays)
    const isArraySection = ['blocks', 'images', 'features', 'links', 'columns', 'navItems'].includes(sectionName);
    
    if (!isArraySection && sectionContent) {
      // Finde Variablen innerhalb der Section
      const innerVarPattern = /\{\{([^{}#^/!>]+)\}\}/g;
      let innerMatch;
      const innerVars = [];
      
      while ((innerMatch = innerVarPattern.exec(sectionContent)) !== null) {
        const innerVarName = innerMatch[1].trim();
        if (innerVarName && !innerVarName.includes('.') && innerVarName !== '&') {
          innerVars.push(innerVarName);
        }
      }
      
      if (innerVars.length > 0) {
        nestedSections.set(sectionName, innerVars);
      }
    }
  }
  
  // Finde alle {{variable}} Muster auf oberster Ebene
  const simplePattern = /\{\{([^{}#^/!>]+)\}\}/g;
  let match;
  
  while ((match = simplePattern.exec(expandedTemplate)) !== null) {
    const varName = match[1].trim();
    // Ignoriere Mustache-Sonderzeichen und Pfade, sowie Snippet-Referenzen.
    if (varName && varName !== '&' && !varName.includes('snippet:') && !varName.includes('snippetHtml:') && !varName.includes('navigation:') && !varName.includes('template:')) {
      if (varName.includes('.')) {
        variables.add(varName);
        continue;
      }
      // Prüfe ob diese Variable in einem verschachtelten Abschnitt ist
      let isNested = false;
      for (const [section, vars] of nestedSections) {
        if (vars.includes(varName)) {
          isNested = true;
          break;
        }
      }
      
      // Nur hinzufügen wenn nicht in verschachteltem Abschnitt
      if (!isNested) {
        variables.add(varName);
      }
    }
  }
  
  // Füge verschachtelte Variablen als "section.variable" hinzu
  for (const [section, vars] of nestedSections) {
    for (const v of vars) {
      variables.add(`${section}.${v}`);
    }
  }
  
  return Array.from(variables).filter(v => !['blocks', 'images', 'features', 'links', 'columns', 'navItems'].includes(v));
}

/**
 * Extrahiert Label für Legacy-Feldannotation.
 * Beispiel: ein Alt-Template mit benannten Feld-Platzhaltern liefert {title: "Titel"}.
 */
export function extractSnippetLabels(templateCode, snippetsByKey = {}) {
  if (!templateCode) return {};
  const expandedTemplate = expandSnippetReferences(templateCode, snippetsByKey);
  
  const labels = {};
  const snippetPattern = /\{\{snippet:([a-zA-Z0-9_.-]+)(?:\[([^\]]*)\])?\}\}/g;
  let snippetMatch;
  
  while ((snippetMatch = snippetPattern.exec(expandedTemplate)) !== null) {
    const fieldName = snippetMatch[1].trim();
    const label = snippetMatch[2]?.trim() || fieldName;
    labels[fieldName] = label;
  }
  
  return labels;
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
export function generateDefaultProps(templateCode, snippetsByKey = {}) {
  const variables = extractTemplateVariables(templateCode, snippetsByKey);
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
  
  return props;
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
