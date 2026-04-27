/**
 * lib/validate.js
 *
 * Leichtgewichtiger Schema-Validator für API-Eingabepfade.
 *
 * Verwendung:
 *   import { validate, rules } from '../../lib/validate';
 *
 *   const [ok, errors] = validate(req.body, {
 *     title:  [rules.required(), rules.string(), rules.maxLen(200)],
 *     status: [rules.oneOf(['DRAFT','PUBLISHED'])],
 *     email:  [rules.required(), rules.email()],
 *   });
 *   if (!ok) return res.status(400).json({ error: 'Ungültige Eingabe', code: 'VALIDATION_ERROR', details: errors });
 */

// ── Einzel-Regel-Konstruktoren ──────────────────────────────────────────────

/**
 * Feld ist Pflichtfeld (nicht null / undefined / leer-string).
 */
function required(msg) {
  return (value, field) => {
    if (value === undefined || value === null || value === '') {
      return msg || `${field} ist erforderlich`;
    }
    return null;
  };
}

/**
 * Wert muss ein String sein (wenn vorhanden).
 */
function string(msg) {
  return (value, field) => {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return msg || `${field} muss ein Text sein`;
    }
    return null;
  };
}

/**
 * Wert muss eine Zahl sein (wenn vorhanden).
 */
function number(msg) {
  return (value, field) => {
    if (value !== undefined && value !== null && typeof value !== 'number') {
      return msg || `${field} muss eine Zahl sein`;
    }
    return null;
  };
}

/**
 * Wert muss ein Boolean sein (wenn vorhanden).
 */
function boolean(msg) {
  return (value, field) => {
    if (value !== undefined && value !== null && typeof value !== 'boolean') {
      return msg || `${field} muss true oder false sein`;
    }
    return null;
  };
}

/**
 * Maximale String-Länge.
 */
function maxLen(max, msg) {
  return (value, field) => {
    if (typeof value === 'string' && value.length > max) {
      return msg || `${field} darf maximal ${max} Zeichen lang sein`;
    }
    return null;
  };
}

/**
 * Minimale String-Länge (nur wenn vorhanden).
 */
function minLen(min, msg) {
  return (value, field) => {
    if (typeof value === 'string' && value.length < min) {
      return msg || `${field} muss mindestens ${min} Zeichen lang sein`;
    }
    return null;
  };
}

/**
 * Wert muss einem der erlaubten Werte entsprechen.
 */
function oneOf(allowed, msg) {
  return (value, field) => {
    if (value !== undefined && value !== null && !allowed.includes(value)) {
      return msg || `${field} muss einer der folgenden Werte sein: ${allowed.join(', ')}`;
    }
    return null;
  };
}

/**
 * Wert muss eine gültige E-Mail-Adresse sein.
 */
function email(msg) {
  return (value, field) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
      return msg || `${field} muss eine gültige E-Mail-Adresse sein`;
    }
    return null;
  };
}

/**
 * Wert muss ein gültiger URL-Slug sein (Kleinbuchstaben, Ziffern, Bindestriche).
 */
function slug(msg) {
  return (value, field) => {
    if (value && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value))) {
      return msg || `${field} darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten`;
    }
    return null;
  };
}

/**
 * Wert muss dem ISO-8601-Format entsprechen (wenn vorhanden).
 */
function isoDate(msg) {
  return (value, field) => {
    if (value && isNaN(Date.parse(String(value)))) {
      return msg || `${field} muss ein gültiges Datum sein (ISO 8601)`;
    }
    return null;
  };
}

/**
 * Wert darf keine HTML/Script-Tags enthalten.
 */
function noHtml(msg) {
  return (value, field) => {
    if (typeof value === 'string' && /<[a-z][\s\S]*>/i.test(value)) {
      return msg || `${field} darf keine HTML-Tags enthalten`;
    }
    return null;
  };
}

/**
 * Wert muss positiv sein (Zahl > 0).
 */
function positive(msg) {
  return (value, field) => {
    if (value !== undefined && value !== null && (typeof value !== 'number' || value <= 0)) {
      return msg || `${field} muss eine positive Zahl sein`;
    }
    return null;
  };
}

// ── Validator ───────────────────────────────────────────────────────────────

/**
 * Validiert ein Datenobjekt gegen ein Schema.
 *
 * @param {object}   data     – Eingabe-Objekt (z.B. req.body)
 * @param {object}   schema   – { fieldName: [rule1, rule2, ...] }
 * @returns {[boolean, object]} [ok, errors]  — errors: { fieldName: 'Fehlermeldung' }
 */
function validate(data, schema) {
  const errors = {};
  const source = data && typeof data === 'object' ? data : {};

  for (const [field, ruleFns] of Object.entries(schema)) {
    if (!Array.isArray(ruleFns)) continue;
    for (const fn of ruleFns) {
      if (typeof fn !== 'function') continue;
      const err = fn(source[field], field);
      if (err) {
        errors[field] = err;
        break; // Nur der erste Fehler pro Feld
      }
    }
  }

  return [Object.keys(errors).length === 0, errors];
}

// ── Exports ──────────────────────────────────────────────────────────────────

export const rules = {
  required,
  string,
  number,
  boolean,
  maxLen,
  minLen,
  oneOf,
  email,
  slug,
  isoDate,
  noHtml,
  positive,
};

export { validate };
export default validate;
