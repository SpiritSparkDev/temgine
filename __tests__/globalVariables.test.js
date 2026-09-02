const { resolveGlobalValue, buildGlobalContext } = require('../lib/globalVariables');

describe('resolveGlobalValue', () => {
  it('returns the string value for STRING type', () => {
    expect(resolveGlobalValue({ type: 'STRING', value: 'Temgine' })).toBe('Temgine');
  });
  it('falls back when value is empty', () => {
    expect(resolveGlobalValue({ type: 'STRING', value: '', fallback: 'Fallback' })).toBe('Fallback');
  });
  it('returns empty string when both value and fallback are empty', () => {
    expect(resolveGlobalValue({ type: 'STRING', value: '', fallback: '' })).toBe('');
  });
  it('parses NUMBER', () => {
    expect(resolveGlobalValue({ type: 'NUMBER', value: '42' })).toBe(42);
  });
  it('returns empty string for invalid NUMBER', () => {
    expect(resolveGlobalValue({ type: 'NUMBER', value: 'abc' })).toBe('');
  });
  it('parses BOOLEAN', () => {
    expect(resolveGlobalValue({ type: 'BOOLEAN', value: 'true' })).toBe(true);
    expect(resolveGlobalValue({ type: 'BOOLEAN', value: 'false' })).toBe(false);
  });
  it('parses ARRAY JSON', () => {
    expect(resolveGlobalValue({ type: 'ARRAY', value: '[{"label":"A","url":"/a"}]' })).toEqual([{ label: 'A', url: '/a' }]);
  });
  it('returns empty array for malformed ARRAY JSON', () => {
    expect(resolveGlobalValue({ type: 'ARRAY', value: 'not json' })).toEqual([]);
  });
});

describe('buildGlobalContext', () => {
  it('builds a flat key->value map from active rows only', () => {
    const rows = [
      { key: 'companyName', type: 'STRING', value: 'Temgine', isActive: true },
      { key: 'hidden', type: 'STRING', value: 'x', isActive: false },
    ];
    expect(buildGlobalContext(rows)).toEqual({ companyName: 'Temgine' });
  });
});
