const STANDARD_BLOG_VARS = new Set([
  'title',
  'slug',
  'excerpt',
  'body',
  'coverImage',
  'author',
  'publishedAt',
  'channelSlug',
  'channelUrl',
  'postUrl',
]);

export function extractTemplatePlaceholders(code) {
  if (!code) return new Set();
  const found = new Set();
  const re = /\{\{([^{}#^/!>]+?)\}\}/g;
  let m;
  while ((m = re.exec(String(code))) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith('nav:') || raw.startsWith('each:') || raw.startsWith('if:') || raw.startsWith('navigation:')) {
      continue;
    }
    const colon = raw.indexOf(':');
    const name = colon !== -1 ? raw.slice(0, colon).trim() : raw;
    if (name) found.add(name);
  }
  return found;
}

export function validatePreviewSubset(previewCode, masterCode) {
  const previewVars = extractTemplatePlaceholders(previewCode);
  const masterVars = extractTemplatePlaceholders(masterCode);
  const allowed = new Set([...masterVars, ...STANDARD_BLOG_VARS]);

  const invalid = [];
  for (const v of previewVars) {
    if (!allowed.has(v)) invalid.push(v);
  }

  return {
    ok: invalid.length === 0,
    invalid,
    previewVars: Array.from(previewVars),
    masterVars: Array.from(masterVars),
  };
}
