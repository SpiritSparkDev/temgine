const { extractIframeSrcs, matchServicesInSources } = require('../lib/cookieScanner');

describe('extractIframeSrcs', () => {
  test('extracts iframe src attributes from HTML with mixed quotes', () => {
    const html = '<div><iframe src="https://www.youtube.com/embed/abc"></iframe><p>text</p>'
      + '<iframe title="x" src=\'https://player.vimeo.com/video/1\'></iframe></div>';
    expect(extractIframeSrcs(html)).toEqual([
      'https://www.youtube.com/embed/abc',
      'https://player.vimeo.com/video/1',
    ]);
  });

  test('returns an empty array when no iframe is present', () => {
    expect(extractIframeSrcs('<p>no embeds here</p>')).toEqual([]);
  });
});

describe('matchServicesInSources', () => {
  test('finds Google Analytics in a JS source', () => {
    const jsSources = [{ id: 'extern_js/ga.js', content: 'gtag("config", "G-XXXX");' }];
    const matches = matchServicesInSources(jsSources, []);
    expect(matches).toHaveLength(1);
    expect(matches[0].service.id).toBe('google-analytics');
    expect(matches[0].matchedJsFiles).toEqual(['extern_js/ga.js']);
  });

  test('finds a YouTube embed in a text source and records the source label', () => {
    const textSources = [{ label: 'Seite: home', text: '<iframe src="https://www.youtube.com/embed/xyz"></iframe>' }];
    const matches = matchServicesInSources([], textSources);
    expect(matches).toHaveLength(1);
    expect(matches[0].service.id).toBe('youtube');
    expect(matches[0].matchedIframeSources).toEqual(['https://www.youtube.com/embed/xyz']);
  });

  test('merges matches for the same service found across multiple sources', () => {
    const jsSources = [{ id: 'extern_js/a.js', content: 'fbq("init", "1");' }];
    const textSources = [{ label: 'Seite: kontakt', text: 'fbq("track", "PageView");' }];
    const matches = matchServicesInSources(jsSources, textSources);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedJsFiles).toEqual(['extern_js/a.js']);
    expect(matches[0].matchedIframeSources).toEqual([]);
  });

  test('returns an empty array when nothing matches', () => {
    expect(matchServicesInSources([{ id: 'x.js', content: 'console.log(1)' }], [])).toEqual([]);
  });
});

describe('collectScanSources (JSON-stringified DB content)', () => {
  afterEach(() => {
    jest.dontMock('../lib/prisma');
    jest.resetModules();
  });

  test('iframes inside Page.blocks / BlogPost.templateData JSON are detected', async () => {
    jest.resetModules();
    jest.doMock('../lib/prisma', () => ({
      prisma: {
        page: {
          findMany: async () => [{
            slug: 'home',
            blocks: [{ html: '<iframe src="https://www.youtube.com/embed/x"></iframe>' }],
            data: {},
          }],
        },
        blogPost: {
          findMany: async () => [{
            slug: 'p',
            body: '',
            templateData: { embed: '<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>' },
          }],
        },
      },
    }));
    const scanner = require('../lib/cookieScanner');
    const { textSources } = await scanner.collectScanSources();
    const matches = scanner.matchServicesInSources([], textSources);
    const byId = Object.fromEntries(matches.map((m) => [m.service.id, m.matchedIframeSources]));
    expect(byId.youtube).toEqual(['https://www.youtube.com/embed/x']);
    expect(byId['google-maps']).toEqual(['https://www.google.com/maps/embed?pb=1']);
  });
});
