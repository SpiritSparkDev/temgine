// marked ships ESM-only, which this repo's jest config doesn't transform
// (unrelated pre-existing gap — see __tests__/api/auth-admin-login.test.js
// for the same issue with next-auth). Stub it; our test data is already
// HTML, so mdToHtml's "already HTML" branch never actually calls marked.
jest.mock('marked', () => ({ marked: { parse: (s) => s, setOptions: () => {} } }));

const { renderPage, collectNavigationBlockIds, collectGlobalPageBlockIds, collectFolderBlockPaths, navPlaceholderSlug, buildNavPlaceholderKeys } = require('../lib/templateEngine');

describe('collectNavigationBlockIds', () => {
  it('collects navigationId from top-level navigation blocks', () => {
    const blocks = [{ type: 'navigation', props: { navigationId: 'nav1' } }, { template: 'Text', props: {} }];
    expect(collectNavigationBlockIds(blocks)).toEqual(['nav1']);
  });

  it('collects navigationId from nested children', () => {
    const blocks = [{ template: 'Wrapper', props: {}, children: [{ type: 'navigation', props: { navigationId: 'nav2' } }] }];
    expect(collectNavigationBlockIds(blocks)).toEqual(['nav2']);
  });

  it('dedupes repeated navigationIds and ignores blocks without one', () => {
    const blocks = [
      { type: 'navigation', props: { navigationId: 'nav1' } },
      { type: 'navigation', props: { navigationId: 'nav1' } },
      { type: 'navigation', props: {} },
    ];
    expect(collectNavigationBlockIds(blocks)).toEqual(['nav1']);
  });

  it('returns an empty array for no blocks', () => {
    expect(collectNavigationBlockIds([])).toEqual([]);
    expect(collectNavigationBlockIds(undefined)).toEqual([]);
  });
});

describe('renderPage navigation slots', () => {
  const page = {
    title: 'Test',
    slug: 'test',
    blocks: [
      { template: 'Text', props: {} },
    ],
  };
  // {{{nav:mobile}}} must be in the template code itself — navHtml is merged
  // onto blockData before rendering, it isn't interpolated into prop values.
  const blockTemplates = { Text: '<div class="mobile-nav-slot">{{{nav:mobile}}}</div>' };

  it('renders {{{nav:mobile}}} when a mobile nav is provided', () => {
    const navigations = { mobile: { code: '<nav id="m">Mobile</nav>', data: {} } };
    const html = renderPage(page, blockTemplates, {}, navigations);
    expect(html).toContain('<nav id="m">Mobile</nav>');
  });

  it('renders an empty slot for {{{nav:mobile}}} when no mobile nav is configured', () => {
    const html = renderPage(page, blockTemplates, {}, {});
    expect(html).toContain('<div class="mobile-nav-slot"></div>');
  });
});

describe('renderPage navigation blocks (type: navigation)', () => {
  const page = {
    title: 'Test',
    slug: 'test',
    blocks: [
      { type: 'navigation', props: { navigationId: 'nav1' } },
    ],
  };

  it('renders the navigation code looked up by navigationId from navigations.byId', () => {
    const navigations = { byId: { nav1: { code: '<nav id="p">Page Nav</nav>', data: {} } } };
    const html = renderPage(page, {}, {}, navigations);
    expect(html).toContain('<nav id="p">Page Nav</nav>');
  });

  it('renders nothing when navigationId does not resolve in navigations.byId', () => {
    const html = renderPage(page, {}, {}, { byId: {} });
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('missing-block');
  });

  it('exposes global.* inside the resolved navigation code', () => {
    const navigations = { byId: { nav1: { code: '<nav>{{global.companyName}}</nav>', data: {} } } };
    const html = renderPage(page, {}, {}, navigations, null, { companyName: 'Temgine' });
    expect(html).toContain('<nav>Temgine</nav>');
  });
});

describe('collectGlobalPageBlockIds', () => {
  it('collects globalPageId from top-level global-page blocks', () => {
    const blocks = [{ type: 'global-page', props: { globalPageId: 'w1' } }, { template: 'Text', props: {} }];
    expect(collectGlobalPageBlockIds(blocks)).toEqual(['w1']);
  });

  it('collects globalPageId from nested children', () => {
    const blocks = [{ template: 'Wrapper', props: {}, children: [{ type: 'global-page', props: { globalPageId: 'w2' } }] }];
    expect(collectGlobalPageBlockIds(blocks)).toEqual(['w2']);
  });

  it('dedupes repeated globalPageIds and ignores blocks without one', () => {
    const blocks = [
      { type: 'global-page', props: { globalPageId: 'w1' } },
      { type: 'global-page', props: { globalPageId: 'w1' } },
      { type: 'global-page', props: {} },
    ];
    expect(collectGlobalPageBlockIds(blocks)).toEqual(['w1']);
  });

  it('returns an empty array for no blocks', () => {
    expect(collectGlobalPageBlockIds([])).toEqual([]);
    expect(collectGlobalPageBlockIds(undefined)).toEqual([]);
  });

  it('does not pick up navigation blocks', () => {
    const blocks = [{ type: 'navigation', props: { navigationId: 'nav1' } }];
    expect(collectGlobalPageBlockIds(blocks)).toEqual([]);
  });
});

describe('renderPage widget blocks (type: global-page)', () => {
  const page = {
    title: 'Test',
    slug: 'test',
    blocks: [
      { type: 'global-page', props: { globalPageId: 'w1' } },
    ],
  };

  it('renders the widget code looked up by globalPageId from globalPages.byId', () => {
    const globalPages = { byId: { w1: { code: '<aside id="sidebar">Sidebar</aside>' } } };
    const html = renderPage(page, {}, {}, {}, null, {}, {}, globalPages);
    expect(html).toContain('<aside id="sidebar">Sidebar</aside>');
  });

  it('renders nothing when globalPageId does not resolve in globalPages.byId', () => {
    const html = renderPage(page, {}, {}, {}, null, {}, {}, { byId: {} });
    expect(html).not.toContain('<aside');
  });

  it('renders nothing when globalPages is omitted entirely (backward compatible default)', () => {
    const html = renderPage(page, {}, {});
    expect(html).not.toContain('<aside');
  });

  it('exposes global.* inside the resolved widget code', () => {
    const globalPages = { byId: { w1: { code: '<aside>{{global.companyName}}</aside>' } } };
    const html = renderPage(page, {}, {}, {}, null, { companyName: 'Temgine' }, {}, globalPages);
    expect(html).toContain('<aside>Temgine</aside>');
  });
});

describe('collectFolderBlockPaths', () => {
  const blockTemplates = { Gallery: '<ul>{{#folder}}<li>{{name}}</li>{{/folder}}</ul>' };

  it('collects the chosen folder path from a block using a folder-block template', () => {
    const blocks = [{ template: 'Gallery', props: { folder: 'produkte/bilder' } }];
    expect(collectFolderBlockPaths(blocks, blockTemplates)).toEqual(['produkte/bilder']);
  });

  it('collects folder paths from nested children', () => {
    const blocks = [{ template: 'Text', props: {}, children: [{ template: 'Gallery', props: { folder: 'sub' } }] }];
    expect(collectFolderBlockPaths(blocks, blockTemplates)).toEqual(['sub']);
  });

  it('ignores blocks with no folder chosen yet (empty string)', () => {
    const blocks = [{ template: 'Gallery', props: { folder: '' } }];
    expect(collectFolderBlockPaths(blocks, blockTemplates)).toEqual([]);
  });

  it('dedupes repeated folder paths', () => {
    const blocks = [
      { template: 'Gallery', props: { folder: 'bilder' } },
      { template: 'Gallery', props: { folder: 'bilder' } },
    ];
    expect(collectFolderBlockPaths(blocks, blockTemplates)).toEqual(['bilder']);
  });
});

describe('renderPage folder blocks ({{#folder}})', () => {
  const page = {
    title: 'Test',
    slug: 'test',
    blocks: [
      { template: 'Gallery', props: { folder: 'bilder' } },
    ],
  };
  const blockTemplates = { Gallery: '<ul>{{#folder}}<li><a href="{{url}}">{{name}}</a></li>{{/folder}}</ul>' };

  it('iterates over the pre-resolved items for the chosen folder path', () => {
    const folderContents = { bilder: [{ name: 'a.jpg', url: '/uploads/bilder/a.jpg' }, { name: 'b.jpg', url: '/uploads/bilder/b.jpg' }] };
    const html = renderPage(page, blockTemplates, {}, {}, null, {}, folderContents);
    // {{url}} is Mustache-escaped like any other double-brace field (same convention as
    // existing {{ctaUrl:url}}/{{image:image}} template fields) — browsers decode the
    // resulting HTML entities in attribute values, so the link still works correctly.
    expect(html).toContain('<a href="&#x2F;uploads&#x2F;bilder&#x2F;a.jpg">a.jpg</a>');
    expect(html).toContain('<a href="&#x2F;uploads&#x2F;bilder&#x2F;b.jpg">b.jpg</a>');
  });

  it('renders nothing when the chosen folder path is not present in folderContents', () => {
    const html = renderPage(page, blockTemplates, {}, {}, null, {}, {});
    expect(html).not.toContain('<a href=');
  });

  it('renders nothing when no folder has been chosen', () => {
    const emptyPage = { ...page, blocks: [{ template: 'Gallery', props: { folder: '' } }] };
    const html = renderPage(emptyPage, blockTemplates, {}, {}, null, {}, { '': [{ name: 'root.jpg', url: '/uploads/root.jpg' }] });
    expect(html).not.toContain('<a href=');
  });

  it('supports named {{#folder:name}} sections independently', () => {
    const namedTemplates = { Gallery: '<ul>{{#folder:bilder}}<li>{{name}}</li>{{/folder:bilder}}</ul><ol>{{#folder:dokumente}}<li>{{name}}</li>{{/folder:dokumente}}</ol>' };
    const namedPage = { ...page, blocks: [{ template: 'Gallery', props: { bilder: 'b', dokumente: 'd' } }] };
    const folderContents = { b: [{ name: 'foto.jpg' }], d: [{ name: 'vertrag.pdf' }] };
    const html = renderPage(namedPage, namedTemplates, {}, {}, null, {}, folderContents);
    expect(html).toContain('<li>foto.jpg</li>');
    expect(html).toContain('<li>vertrag.pdf</li>');
  });
});

describe('navPlaceholderSlug', () => {
  it('lowercases and hyphenates a navigation name', () => {
    expect(navPlaceholderSlug('Künstler Übersicht')).toBe('k-nstler-bersicht');
  });

  it('falls back to "navigation" for an empty/missing name', () => {
    expect(navPlaceholderSlug('')).toBe('navigation');
    expect(navPlaceholderSlug(undefined)).toBe('navigation');
  });
});

describe('buildNavPlaceholderKeys', () => {
  it('produces a stable nav:<slug> key per id, sorted by name', () => {
    const keys = buildNavPlaceholderKeys([
      { id: 'b', name: 'Breadcrumb' },
      { id: 'a', name: 'Anchor Sidebar' },
    ]);
    expect(keys).toEqual({ a: 'nav:anchor-sidebar', b: 'nav:breadcrumb' });
  });

  it('disambiguates two navigations that slugify to the same key', () => {
    const keys = buildNavPlaceholderKeys([
      { id: 'x', name: 'TOC!' },
      { id: 'y', name: 'TOC?' },
    ]);
    expect(new Set(Object.values(keys)).size).toBe(2);
    expect(Object.values(keys)).toEqual(['nav:toc', 'nav:toc-2']);
  });

  it('avoids colliding with the reserved main/page/mobile/auto keys', () => {
    const keys = buildNavPlaceholderKeys([{ id: 'x', name: 'Page' }]);
    expect(keys.x).toBe('nav:page-nav');
  });
});

describe('renderPage named navigation placeholders ({{{nav:<name>}}})', () => {
  const page = { title: 'Test', slug: 'test', blocks: [{ template: 'Text', props: {} }] };

  it('resolves a navigation by its slugified name, independent of any block', () => {
    const blockTemplates = { Text: '<div>{{{nav:breadcrumb}}}</div>' };
    const navigations = { byId: { nav1: { name: 'Breadcrumb', code: '<nav id="bc">Crumbs</nav>', data: {} } } };
    const html = renderPage(page, blockTemplates, {}, navigations);
    expect(html).toContain('<nav id="bc">Crumbs</nav>');
  });

  it('keeps both navigations addressable when two ids share a name collision', () => {
    const blockTemplates = { Text: '<div>{{{nav:toc}}}|{{{nav:toc-2}}}</div>' };
    const navigations = {
      byId: {
        x: { name: 'TOC!', code: 'A', data: {} },
        y: { name: 'TOC?', code: 'B', data: {} },
      },
    };
    const html = renderPage(page, blockTemplates, {}, navigations);
    expect(html).toContain('A|B');
  });
});

describe('renderPage HTML-value auto-upgrade (double → triple brace)', () => {
  it('still upgrades a plain {{key}} reference when its value contains HTML', () => {
    const page = { title: 'Test', slug: 'test', blocks: [{ template: 'Text', props: { body: '<strong>bold</strong>' } }] };
    const blockTemplates = { Text: '<div>{{body}}</div>' };
    const html = renderPage(page, blockTemplates, {});
    // Unescaped: the raw <strong> tag must survive, not become &lt;strong&gt;
    expect(html).toContain('<div><strong>bold</strong></div>');
  });

  it('does not corrupt an already-triple {{{key}}} reference into {{{{key}}}}', () => {
    const page = { title: 'Test', slug: 'test', blocks: [{ template: 'Text', props: { body: '<strong>bold</strong>' } }] };
    const blockTemplates = { Text: '<div>{{{body}}}</div>' };
    const html = renderPage(page, blockTemplates, {});
    expect(html).toContain('<div><strong>bold</strong></div>');
    expect(html).not.toContain('{{{');
    expect(html).not.toContain('}}}');
  });
});

describe('renderPage footer + global variables', () => {
  const page = { title: 'Test', slug: 'test', blocks: [{ template: 'Text', props: {} }] };
  const blockTemplates = { Text: '<div>{{global.companyName}}</div>' };

  it('appends active footer HTML after blocks content', () => {
    const footer = { code: '<footer class="site-footer">{{global.copyrightText}}</footer>', data: {} };
    const html = renderPage(page, blockTemplates, {}, {}, footer, { companyName: 'Temgine', copyrightText: '© 2026' });
    expect(html).toContain('<footer class="site-footer">© 2026</footer>');
    expect(html.indexOf('<div>Temgine</div>')).toBeLessThan(html.indexOf('<footer'));
  });

  it('renders nothing when no active footer is passed', () => {
    const html = renderPage(page, blockTemplates, {}, {}, null, { companyName: 'Temgine' });
    expect(html).not.toContain('<footer');
  });

  it('exposes global.* inside block templates', () => {
    const html = renderPage(page, blockTemplates, {}, {}, null, { companyName: 'Temgine' });
    expect(html).toContain('<div>Temgine</div>');
  });

  it('renders an empty string for a missing global variable instead of crashing', () => {
    const html = renderPage(page, blockTemplates, {}, {}, null, {});
    expect(html).toContain('<div></div>');
  });

  it('exposes global.* inside navigation templates', () => {
    const navigations = { main: { code: '<nav>{{global.companyName}}</nav>', data: {} } };
    const html = renderPage(page, blockTemplates, {}, navigations, null, { companyName: 'Temgine' });
    expect(html).toContain('<nav>Temgine</nav>');
  });
});

describe('|Gruppe annotation rendering', () => {
  test('is stripped before rendering', () => {
    const { renderTemplate } = require('../lib/templateEngine');
    expect(renderTemplate('<p>{{a:text|Inhalt}}-{{{b:textarea|X}}}-{{c|Y}}</p>', { a: '1', b: '2', c: '3' })).toBe('<p>1-2-3</p>');
  });
});

describe('Block ohne Template = freies HTML-Feld', () => {
  test('props.html wird unverändert ausgegeben', () => {
    const { renderPage } = require('../lib/templateEngine');
    const page = { title: 'T', slug: 't', blocks: [{ type: 'content', template: '', props: { html: '<div class="x" style="color:red">Hallo</div>' } }] };
    expect(renderPage(page, {}, {}, {})).toContain('<div class="x" style="color:red">Hallo</div>');
  });
});

describe('{{feld:checkbox}}', () => {
  const tpl = { Faq: '{{#each:Fragen}}<details{{#if:Offen}} open{{/if:Offen}}><!-- {{Offen:checkbox}} -->{{Titel:text}}</details>{{/each:Fragen}}' };
  const render = (rows) => renderPage({ title: 'T', slug: 't', blocks: [{ template: 'Faq', props: { Fragen: rows } }] }, tpl, {}, {});

  it('annotation is stripped and #if:… reacts to true / "" / "true"', () => {
    const html = render([{ Offen: true, Titel: 'A' }, { Offen: '', Titel: 'B' }, { Offen: 'true', Titel: 'C' }]);
    expect(html).not.toContain(':checkbox');
    expect(html).toContain('<details open><!-- true -->A</details>');
    expect(html).toContain('<details><!--  -->B</details>');
    expect(html).toContain('<details open><!-- true -->C</details>');
  });
});

describe('{{feld:select(...)}}', () => {
  it('Annotation samt Optionsliste wird entfernt, nur der Wert wird ausgegeben', () => {
    const tpl = { Box: '<div class="{{align:select(Links=left, Mitte=center)}}">{{#each:Items}}<i class="{{Pos:select(oben, unten)}}"></i>{{/each:Items}}</div>' };
    const html = renderPage({ title: 'T', slug: 't', blocks: [{ template: 'Box', props: { align: 'center', Items: [{ Pos: 'unten' }] } }] }, tpl, {}, {});
    expect(html).toContain('<div class="center"><i class="unten"></i></div>');
    expect(html).not.toContain('select');
  });
});
