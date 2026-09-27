const { buildMatomoSnippet, isValidMatomoConfig } = require('../lib/matomo');

test('rejects invalid config', () => {
  expect(isValidMatomoConfig({ matomoUrl: '', siteId: '1' })).toBe(false);
  expect(isValidMatomoConfig({ matomoUrl: 'https://analytics.example.com', siteId: '' })).toBe(false);
  expect(isValidMatomoConfig({ matomoUrl: 'javascript:alert(1)', siteId: '1' })).toBe(false);
  expect(isValidMatomoConfig({ matomoUrl: 'https://analytics.example.com', siteId: 'abc' })).toBe(false);
});

test('accepts a valid config', () => {
  expect(isValidMatomoConfig({ matomoUrl: 'https://analytics.example.com', siteId: '3' })).toBe(true);
});

test('buildMatomoSnippet returns empty string for invalid config', () => {
  expect(buildMatomoSnippet({ matomoUrl: '', siteId: '1' })).toBe('');
  expect(buildMatomoSnippet({ matomoUrl: 'https://analytics.example.com', siteId: 'abc' })).toBe('');
});

test('buildMatomoSnippet embeds url and site id safely', () => {
  const snippet = buildMatomoSnippet({ matomoUrl: 'https://analytics.example.com', siteId: '3' });
  expect(snippet).toContain("setSiteId', \"3\"");
  expect(snippet).toContain('analytics.example.com/');
  expect(snippet).not.toContain('disableCookies');
  expect(snippet).not.toContain('setDoNotTrack');
});

test('buildMatomoSnippet adds opt-in flags when requested', () => {
  const snippet = buildMatomoSnippet({ matomoUrl: 'https://analytics.example.com', siteId: '3', trackWithoutCookies: true, respectDnt: true });
  expect(snippet).toContain("_paq.push(['disableCookies']);");
  expect(snippet).toContain("_paq.push(['setDoNotTrack', true]);");
});

test('buildMatomoSnippet escapes quotes in the URL so it cannot break out of the string literal', () => {
  const malicious = "https://example.com/\"); alert(1); (\"";
  const snippet = buildMatomoSnippet({ matomoUrl: malicious, siteId: '1' });
  // JSON.stringify escapes the embedded quote, so it never closes the JS string literal early.
  expect(snippet).toContain('\\"');
});
