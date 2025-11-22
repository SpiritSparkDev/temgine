const fs = require('fs');
const path = require('path');

test('snippets.json exists and contains expected keys', () => {
  const filePath = path.join(process.cwd(), 'data', 'snippets.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const arr = JSON.parse(raw);
  expect(Array.isArray(arr)).toBe(true);
  const labels = arr.map(s => String(s.label).toLowerCase());
  const has = (opts) => opts.some(o => labels.includes(o));
  expect(has(['title','titel'])).toBe(true);
  expect(has(['text'])).toBe(true);
  expect(has(['images','image'])).toBe(true);
});
