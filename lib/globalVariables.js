export const VALID_GLOBAL_TYPES = ['STRING', 'NUMBER', 'URL', 'IMAGE', 'DATE', 'BOOLEAN', 'ARRAY', 'HTML'];

// Resolve one GlobalVariable row to its usable render value, applying the
// type conversion and falling back to `fallback` when `value` is empty.
export function resolveGlobalValue(row) {
  const hasValue = row.value !== undefined && row.value !== null && String(row.value).trim() !== '';
  const raw = hasValue ? row.value : row.fallback;
  if (raw === undefined || raw === null || String(raw).trim() === '') return '';
  switch (row.type) {
    case 'NUMBER': {
      const n = Number(raw);
      return Number.isNaN(n) ? '' : n;
    }
    case 'BOOLEAN':
      return String(raw).trim().toLowerCase() === 'true';
    case 'ARRAY':
      try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    default:
      return String(raw);
  }
}

// Build the flat { key: value } map merged into the template render context as `global`.
export function buildGlobalContext(rows) {
  const ctx = {};
  for (const row of rows || []) {
    if (row.isActive === false) continue;
    ctx[row.key] = resolveGlobalValue(row);
  }
  return ctx;
}
