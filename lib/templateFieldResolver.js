import { extractFieldGroups, extractTypedVariables, guessInputType } from './templateParser';

const DEFAULT_FIXED_FIELDS = [
  'title',
  'slug',
  'excerpt',
  'body',
  'coverImage',
  'author',
  'status',
  'publishAt',
  'publishedAt',
  'channelSlug',
  'channelUrl',
  'postUrl',
  'id',
  'channelId',
  'createdAt',
  'updatedAt',
];

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function makeFieldType(explicitType, name) {
  const explicit = String(explicitType || '').trim().toLowerCase();
  return explicit || guessInputType(name);
}

export function resolveTemplateFields(templateCode, options = {}) {
  const fixedFieldNames = Array.isArray(options.fixedFieldNames) && options.fixedFieldNames.length > 0
    ? options.fixedFieldNames
    : DEFAULT_FIXED_FIELDS;

  const fixedSet = new Set(fixedFieldNames.map(normalizeName));
  const typedVars = extractTypedVariables(templateCode);

  const allFields = typedVars
    .map((entry) => {
      const name = String(entry?.varName || '').trim();
      if (!name) return null;
      const key = normalizeName(name);
      return {
        name,
        key,
        explicitType: String(entry?.explicitType || '').trim().toLowerCase() || null,
        inputType: makeFieldType(entry?.explicitType, name),
        isFixed: fixedSet.has(key),
      };
    })
    .filter(Boolean);

  const fixedFields = allFields.filter((field) => field.isFixed);
  const customFields = allFields.filter((field) => !field.isFixed);

  const customFieldTypeByName = new Map(
    customFields.map((field) => [field.key, field.inputType || 'text'])
  );

  const byLowerName = new Map(customFields.map((field) => [field.key, field.name]));
  const consumed = new Set();
  const customGroups = [];

  const domGroups = extractFieldGroups(templateCode);
  domGroups.forEach((group, index) => {
    const fields = [];
    (group?.vars || []).forEach((rawVar) => {
      const key = normalizeName(rawVar);
      const original = byLowerName.get(key);
      if (!original || consumed.has(key)) return;
      consumed.add(key);
      fields.push(original);
    });

    if (fields.length === 0) return;
    customGroups.push({
      key: `dom-${index}`,
      label: group?.isGroup ? String(group?.label || '').trim() : '',
      fields,
    });
  });

  const leftovers = customFields
    .map((field) => field.name)
    .filter((name) => !consumed.has(normalizeName(name)));

  if (leftovers.length > 0) {
    customGroups.push({ key: 'dom-leftovers', label: '', fields: leftovers });
  }

  const fieldNames = allFields.map((field) => field.name);
  const fieldSet = new Set(fieldNames);

  return {
    allFields,
    fixedFields,
    customFields,
    customGroups,
    customFieldTypeByName,
    fieldNames,
    fieldSet,
  };
}

export { DEFAULT_FIXED_FIELDS };
