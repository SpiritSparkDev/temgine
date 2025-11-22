const { getFieldsForTemplate } = require('../lib/templateFields');

test('returns fields for StandardTemplate', () => {
  expect(getFieldsForTemplate('StandardTemplate')).toEqual(['title', 'text', 'images']);
});

test('returns fields for MinimalTemplate', () => {
  expect(getFieldsForTemplate('MinimalTemplate')).toEqual(['title']);
});

test('default returns sensible fields', () => {
  expect(getFieldsForTemplate('Unknown')).toEqual(['title', 'text', 'images']);
});
