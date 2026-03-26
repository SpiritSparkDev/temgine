const fs = require('fs');
const path = require('path');

test('snippets.json exists and contains expected keys', () => {
  const filePath = path.join(process.cwd(), 'data', 'snippets.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const arr = JSON.parse(raw);
  expect(Array.isArray(arr)).toBe(true);
  const keys = arr.map(s => String(s.key || '').toLowerCase());
  expect(keys).toContain('text-section');
  expect(keys).toContain('section-heading');
  expect(keys).toContain('article-text');
  expect(keys).toContain('article-with-image');
  expect(keys).toContain('excerpt-text');
  expect(keys).toContain('cta-link');
  expect(keys).not.toContain('blocks');
  expect(keys).not.toContain('titel');
  expect(keys).not.toContain('slug');
  expect(keys).not.toContain('text');
  expect(keys).not.toContain('image');
  expect(keys).not.toContain('rich-text');
  expect(keys).not.toContain('download-link');
});
