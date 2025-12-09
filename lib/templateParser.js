/**
 * Extrahiert alle Platzhalter aus einem Mustache-Template
 * z.B. {{title}}, {{#blocks}}, {{images}}, {{snippet:title[Titel]}}
 * Gibt auch verschachtelte Felder zurück wie button.url, button.label
 */
export function extractTemplateVariables(templateCode) {
  if (!templateCode) return [];
  
  const variables = new Set();
  const nestedSections = new Map(); // section -> [variablen darin]
  
  // Extrahiere snippet:fieldname[Label] Muster
  // z.B. {{snippet:title[Titel]}} -> extrahiere "title"
  const snippetPattern = /\{\{snippet:([a-zA-Z0-9_.-]+)(?:\[([^\]]*)\])?\}\}/g;
  let snippetMatch;
  while ((snippetMatch = snippetPattern.exec(templateCode)) !== null) {
    const fieldName = snippetMatch[1].trim();
    if (fieldName) {
      variables.add(fieldName);
    }
  }
  
  // Finde alle {{#section}}...{{/section}} Blöcke mit deren Inhalt
  const sectionBlockPattern = /\{\{#([^{}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let sectionMatch;
  
  while ((sectionMatch = sectionBlockPattern.exec(templateCode)) !== null) {
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
  
  while ((match = simplePattern.exec(templateCode)) !== null) {
    const varName = match[1].trim();
    // Ignoriere Mustache-Sonderzeichen und Pfade, sowie snippet Syntax
    if (varName && !varName.includes('.') && varName !== '&' && !varName.includes('snippet:')) {
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
 * Extrahiert Label für Snippet-Felder
 * z.B. {{snippet:title[Titel]}} -> returns {title: "Titel"}
 */
export function extractSnippetLabels(templateCode) {
  if (!templateCode) return {};
  
  const labels = {};
  const snippetPattern = /\{\{snippet:([a-zA-Z0-9_.-]+)(?:\[([^\]]*)\])?\}\}/g;
  let snippetMatch;
  
  while ((snippetMatch = snippetPattern.exec(templateCode)) !== null) {
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
  
  return props;
}
