const { findCatalogServicesForJs, findCatalogServiceForIframe, extractHostname } = require('../lib/cookieCatalog');

describe('cookieCatalog', () => {
  test('detects Google Analytics from a gtag snippet', () => {
    const matches = findCatalogServicesForJs('window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("config","G-XXXX");');
    expect(matches.map(m => m.id)).toContain('google-analytics');
  });

  test('detects Meta Pixel from an fbq snippet', () => {
    const matches = findCatalogServicesForJs('fbq("init","12345");fbq("track","PageView");');
    expect(matches.map(m => m.id)).toContain('meta-pixel');
  });

  test('returns no matches for unrelated JS', () => {
    expect(findCatalogServicesForJs('console.log("hello world");')).toEqual([]);
  });

  test('detects a YouTube embed by iframe src domain', () => {
    expect(findCatalogServiceForIframe('https://www.youtube.com/embed/abc123')?.id).toBe('youtube');
  });

  test('detects a Google Maps embed by src substring', () => {
    expect(findCatalogServiceForIframe('https://www.google.com/maps/embed?pb=abc')?.id).toBe('google-maps');
  });

  test('returns null for an unknown iframe domain', () => {
    expect(findCatalogServiceForIframe('https://example.com/embed')).toBeNull();
  });

  test('extractHostname handles a normal URL and an invalid string', () => {
    expect(extractHostname('https://vimeo.com/123')).toBe('vimeo.com');
    expect(extractHostname('not a url')).toBe('');
  });
});
