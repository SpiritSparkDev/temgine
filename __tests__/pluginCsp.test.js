const { originFromSettings, addOriginToCsp } = require('../lib/pluginCsp');

describe('pluginCsp', () => {
  const csp = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self'; img-src 'self' https:";

  test('adds origin to script-src and connect-src only', () => {
    const out = addOriginToCsp(csp, 'https://m.example.de');
    expect(out).toContain("script-src 'self' https://cdn.jsdelivr.net https://m.example.de");
    expect(out).toContain("connect-src 'self' https://m.example.de");
    expect(out).toContain("default-src 'self';");
    expect(out).toContain("img-src 'self' https:");
  });

  test('adds origin to given directives only (Picgine: img-src)', () => {
    const out = addOriginToCsp(csp, 'http://localhost:3040', ['img-src']);
    expect(out).toContain("img-src 'self' https: http://localhost:3040");
    expect(out).toContain("connect-src 'self';");
  });

  test('does not add the origin twice', () => {
    const once = addOriginToCsp(csp, 'https://m.example.de');
    expect(addOriginToCsp(once, 'https://m.example.de')).toBe(once);
  });

  test('origin only when enabled and url valid', () => {
    expect(originFromSettings({ matomo_enabled: 'true', matomo_url: 'https://m.example.de/sub/' })).toBe('https://m.example.de');
    expect(originFromSettings({ matomo_enabled: 'false', matomo_url: 'https://m.example.de/' })).toBe('');
    expect(originFromSettings({ matomo_enabled: 'true', matomo_url: 'javascript:alert(1)' })).toBe('');
    expect(originFromSettings({ matomo_enabled: 'true', matomo_url: '' })).toBe('');
  });
});
