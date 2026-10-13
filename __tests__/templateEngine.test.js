// marked ships ESM-only, which this repo's jest config doesn't transform
// (unrelated pre-existing gap — see __tests__/api/auth-admin-login.test.js
// for the same issue with next-auth). Stub it; our test data is already
// HTML, so mdToHtml's "already HTML" branch never actually calls marked.
jest.mock('marked', () => ({ marked: { parse: (s) => s, setOptions: () => {} } }));

const { renderPage, collectNavigationBlockIds, collectGlobalPageBlockIds, collectSectionKeys, navPlaceholderSlug, buildNavPlaceholderKeys, widgetPlaceholderSlug, buildWidgetPlaceholderKeys } = require('../lib/templateEngine');

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
    const html = renderPage(page, blockTemplates, { navigations });
    expect(html).toContain('<nav id="m">Mobile</nav>');
  });

  it('renders an empty slot for {{{nav:mobile}}} when no mobile nav is configured', () => {
    const html = renderPage(page, blockTemplates, {});
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
    const html = renderPage(page, {}, { navigations });
    expect(html).toContain('<nav id="p">Page Nav</nav>');
  });

  it('renders nothing when navigationId does not resolve in navigations.byId', () => {
    const html = renderPage(page, {}, { navigations: { byId: {} } });
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('missing-block');
  });

  it('exposes global.* inside the resolved navigation code', () => {
    const navigations = { byId: { nav1: { code: '<nav>{{global.companyName}}</nav>', data: {} } } };
    const html = renderPage(page, {}, { navigations, globalVars: { companyName: 'Temgine' } });
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
    const html = renderPage(page, {}, { globalPages });
    expect(html).toContain('<aside id="sidebar">Sidebar</aside>');
  });

  it('renders nothing when globalPageId does not resolve in globalPages.byId', () => {
    const html = renderPage(page, {}, { globalPages: { byId: {} } });
    expect(html).not.toContain('<aside');
  });

  it('renders nothing when globalPages is omitted entirely (backward compatible default)', () => {
    const html = renderPage(page, {}, {});
    expect(html).not.toContain('<aside');
  });

  it('exposes global.* inside the resolved widget code', () => {
    const globalPages = { byId: { w1: { code: '<aside>{{global.companyName}}</aside>' } } };
    const html = renderPage(page, {}, { globalVars: { companyName: 'Temgine' }, globalPages });
    expect(html).toContain('<aside>Temgine</aside>');
  });
});

describe('collectFolderBlockPaths', () => {
  const blockTemplates = { Gallery: '<ul>{{#folder}}<li>{{name}}</li>{{/folder}}</ul>' };

  it('collects the chosen folder path from a block using a folder-block template', () => {
    const blocks = [{ template: 'Gallery', props: { folder: 'produkte/bilder' } }];
    expect((collectSectionKeys(blocks, blockTemplates).folder || [])).toEqual(['produkte/bilder']);
  });

  it('collects folder paths from nested children', () => {
    const blocks = [{ template: 'Text', props: {}, children: [{ template: 'Gallery', props: { folder: 'sub' } }] }];
    expect((collectSectionKeys(blocks, blockTemplates).folder || [])).toEqual(['sub']);
  });

  it('ignores blocks with no folder chosen yet (empty string)', () => {
    const blocks = [{ template: 'Gallery', props: { folder: '' } }];
    expect((collectSectionKeys(blocks, blockTemplates).folder || [])).toEqual([]);
  });

  it('dedupes repeated folder paths', () => {
    const blocks = [
      { template: 'Gallery', props: { folder: 'bilder' } },
      { template: 'Gallery', props: { folder: 'bilder' } },
    ];
    expect((collectSectionKeys(blocks, blockTemplates).folder || [])).toEqual(['bilder']);
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
    const html = renderPage(page, blockTemplates, { sectionData: { folder: folderContents } });
    // {{url}} is Mustache-escaped like any other double-brace field (same convention as
    // existing {{ctaUrl:url}}/{{image:image}} template fields) — browsers decode the
    // resulting HTML entities in attribute values, so the link still works correctly.
    expect(html).toContain('<a href="&#x2F;uploads&#x2F;bilder&#x2F;a.jpg">a.jpg</a>');
    expect(html).toContain('<a href="&#x2F;uploads&#x2F;bilder&#x2F;b.jpg">b.jpg</a>');
  });

  it('renders nothing when the chosen folder path is not present in folderContents', () => {
    const html = renderPage(page, blockTemplates, {});
    expect(html).not.toContain('<a href=');
  });

  it('renders nothing when no folder has been chosen', () => {
    const emptyPage = { ...page, blocks: [{ template: 'Gallery', props: { folder: '' } }] };
    const html = renderPage(emptyPage, blockTemplates, { sectionData: { folder: { '': [{ name: 'root.jpg', url: '/uploads/root.jpg' }] } } });
    expect(html).not.toContain('<a href=');
  });

  it('supports named {{#folder:name}} sections independently', () => {
    const namedTemplates = { Gallery: '<ul>{{#folder:bilder}}<li>{{name}}</li>{{/folder:bilder}}</ul><ol>{{#folder:dokumente}}<li>{{name}}</li>{{/folder:dokumente}}</ol>' };
    const namedPage = { ...page, blocks: [{ template: 'Gallery', props: { bilder: 'b', dokumente: 'd' } }] };
    const folderContents = { b: [{ name: 'foto.jpg' }], d: [{ name: 'vertrag.pdf' }] };
    const html = renderPage(namedPage, namedTemplates, { sectionData: { folder: folderContents } });
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
    const html = renderPage(page, blockTemplates, { navigations });
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
    const html = renderPage(page, blockTemplates, { navigations });
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
    const html = renderPage(page, blockTemplates, { footer, globalVars: { companyName: 'Temgine', copyrightText: '© 2026' } });
    expect(html).toContain('<footer class="site-footer">© 2026</footer>');
    expect(html.indexOf('<div>Temgine</div>')).toBeLessThan(html.indexOf('<footer'));
  });

  it('renders nothing when no active footer is passed', () => {
    const html = renderPage(page, blockTemplates, { globalVars: { companyName: 'Temgine' } });
    expect(html).not.toContain('<footer');
  });

  it('exposes global.* inside block templates', () => {
    const html = renderPage(page, blockTemplates, { globalVars: { companyName: 'Temgine' } });
    expect(html).toContain('<div>Temgine</div>');
  });

  it('renders an empty string for a missing global variable instead of crashing', () => {
    const html = renderPage(page, blockTemplates, {});
    expect(html).toContain('<div></div>');
  });

  it('exposes global.* inside navigation templates', () => {
    const navigations = { main: { code: '<nav>{{global.companyName}}</nav>', data: {} } };
    const html = renderPage(page, blockTemplates, { navigations, globalVars: { companyName: 'Temgine' } });
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
    expect(renderPage(page, {}, {})).toContain('<div class="x" style="color:red">Hallo</div>');
  });
});

describe('{{feld:checkbox}}', () => {
  const tpl = { Faq: '{{#each:Fragen}}<details{{#if:Offen}} open{{/if:Offen}}><!-- {{Offen:checkbox}} -->{{Titel:text}}</details>{{/each:Fragen}}' };
  const render = (rows) => renderPage({ title: 'T', slug: 't', blocks: [{ template: 'Faq', props: { Fragen: rows } }] }, tpl, {});

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
    const html = renderPage({ title: 'T', slug: 't', blocks: [{ template: 'Box', props: { align: 'center', Items: [{ Pos: 'unten' }] } }] }, tpl, {});
    expect(html).toContain('<div class="center"><i class="unten"></i></div>');
    expect(html).not.toContain('select');
  });
});

describe('widgetPlaceholderSlug', () => {
  it('slugifies like navPlaceholderSlug but falls back to "widget", not "navigation"', () => {
    expect(widgetPlaceholderSlug('Sidebar CTA')).toBe('sidebar-cta');
    expect(widgetPlaceholderSlug('')).toBe('widget');
    expect(widgetPlaceholderSlug(undefined)).toBe('widget');
  });
});

describe('buildWidgetPlaceholderKeys', () => {
  it('assigns unique slugs, appending -2/-3 on name collisions (deterministic by name then id)', () => {
    const keys = buildWidgetPlaceholderKeys([
      { id: 'w1', name: 'CTA' },
      { id: 'w2', name: 'CTA' },
      { id: 'w3', name: 'CTA' },
    ]);
    expect(Object.values(keys).sort()).toEqual(['cta', 'cta-2', 'cta-3']);
  });
});

describe('renderPage {{{widget.<name>}}} placeholder (direkt im Template-Code, zusätzlich zum global-page-Block)', () => {
  const globalPages = { byId: { w1: { name: 'Sidebar CTA', code: '<aside>Hallo</aside>' } } };

  it('löst {{{widget.<slug>}}} in einem Block-Template auf', () => {
    const tpl = { Seite: '<main>{{{widget.sidebar-cta}}}</main>' };
    const html = renderPage({ title: 'T', slug: 't', blocks: [{ template: 'Seite', props: {} }] }, tpl, { globalPages });
    expect(html).toContain('<main><aside>Hallo</aside></main>');
  });

  it('löst den Platzhalter auch in Navigationen und im Footer auf', () => {
    const page = { title: 'T', slug: 't', blocks: [] };
    const navigations = { main: { code: '{{{widget.sidebar-cta}}}' } };
    const footer = { code: '{{{widget.sidebar-cta}}}' };
    const html = renderPage(page, {}, { globalPages, navigations, footer });
    // Einmal aus dem Footer, einmal aus {{{nav:main}}} (wird automatisch vorangestellt)
    expect(html.match(/<aside>Hallo<\/aside>/g)).toHaveLength(2);
  });

  it('ein Widget bekommt keinen eigenen widget-Kontext (keine Selbst-/Querverweis-Rekursion)', () => {
    const selfReferencing = { byId: { w1: { name: 'A', code: '<a>{{{widget.a}}}</a>' } } };
    const tpl = { Seite: '{{{widget.a}}}' };
    const html = renderPage({ title: 'T', slug: 't', blocks: [{ template: 'Seite', props: {} }] }, tpl, { globalPages: selfReferencing });
    // {{{widget.a}}} innerhalb des Widget-Codes bleibt unaufgelöst (kein widget-Key im Kontext)
    expect(html).toContain('<a></a>');
  });

  it('ohne globalPages bleibt der Platzhalter leer statt zu crashen (backward compatible default)', () => {
    const tpl = { Seite: '<main>{{{widget.sidebar-cta}}}</main>' };
    const html = renderPage({ title: 'T', slug: 't', blocks: [{ template: 'Seite', props: {} }] }, tpl, {});
    expect(html).toContain('<main></main>');
  });
});

// Regression: Navigationen/Footer/Widgets wurden bis 0.46.x direkt per rohem
// Mustache.render() gerendert statt über renderTemplate() wie Block-Templates
// — dadurch funktionierten {{#if:…}}/{{#each:…}}/{{feld:typ}} dort nicht.
describe('{{#if:…}} und {{#each:…}} funktionieren in Navigationen, Footer und Widgets (nicht nur in Blöcken)', () => {
  it('{{#if:…}} in einer Navigation', () => {
    const navigations = { main: { code: '{{#if:zeigeHinweis}}<p>Hinweis</p>{{/if:zeigeHinweis}}', data: { zeigeHinweis: true } } };
    const html = renderPage({ title: 'T', slug: 't', blocks: [] }, {}, { navigations });
    expect(html).toContain('<p>Hinweis</p>');
  });

  it('{{#each:…}} im Footer', () => {
    const footer = { code: '{{#each:Links}}<a>{{label}}</a>{{/each:Links}}', data: { Links: [{ label: 'Impressum' }, { label: 'Datenschutz' }] } };
    const html = renderPage({ title: 'T', slug: 't', blocks: [] }, {}, { footer });
    expect(html).toContain('<a>Impressum</a><a>Datenschutz</a>');
  });

  it('{{#if:…}} in einem Widget', () => {
    const globalPages = { byId: { w1: { code: '{{#if:aktiv}}<b>An</b>{{/if:aktiv}}' } } };
    const page = { title: 'T', slug: 't', blocks: [{ type: 'global-page', props: { globalPageId: 'w1' } }] };
    const html = renderPage(page, {}, { globalPages, globalVars: {} });
    // Das global-page-Widget selbst bekommt keine Block-Props — "aktiv" ist hier leer/false, prüft nur, dass die #if-Syntax überhaupt ausgewertet (nicht wörtlich ausgegeben) wird.
    expect(html).not.toContain('{{#if:aktiv}}');
  });
});

describe('renderPage instrumentPaths (Editor-Split-Vorschau: data-temgine-block Wrapper)', () => {
  const tpl = {
    Wrapper: '<section>{{titel}}<div class="inner">{{{inner}}}</div></section>',
    Karte: '{{#each:Punkte}}<li>{{label}}</li>{{/each:Punkte}}',
  };
  const nestedPage = {
    title: 'T', slug: 't',
    blocks: [{
      template: 'Wrapper', props: { titel: 'Außen' },
      children: [{
        template: 'Karte', props: { Punkte: [{ label: 'A' }] },
        children: [{ template: 'Karte', props: { Punkte: [{ label: 'B' }] } }],
      }],
    }],
  };

  it('ohne instrumentPaths erscheint kein data-temgine-block Attribut (Produktions-Rendering unverändert)', () => {
    const html = renderPage(nestedPage, tpl, {});
    expect(html).not.toContain('data-temgine-block');
  });

  it('mit instrumentPaths:true bekommt jeder Block — auch 2 Ebenen tief verschachtelt — seinen Pfad', () => {
    const html = renderPage(nestedPage, tpl, { instrumentPaths: true });
    expect(html).toContain('data-temgine-block="0"');
    expect(html).toContain('data-temgine-block="0.0"');
    expect(html).toContain('data-temgine-block="0.0.0"');
  });

  it('der Inhalt (inkl. Repeater in verschachtelten Blöcken) bleibt bei instrumentPaths:true vollständig erhalten', () => {
    const plain = renderPage(nestedPage, tpl, {});
    const instrumented = renderPage(nestedPage, tpl, { instrumentPaths: true });
    // Gleicher Textinhalt in beiden Modi — instrumentPaths fügt nur Wrapper-Divs hinzu, ändert nichts am Inhalt.
    const textOnly = (html) => html.replace(/<[^>]+>/g, '');
    expect(textOnly(instrumented)).toBe(textOnly(plain));
    // "Karte" hat kein {{{inner}}} im Template, daher wird block-children vor
    // dem schließenden Tag des einzigen Wurzelelements eingefügt (bestehendes
    // Verhalten, siehe renderPage) — B (ohne eigene Kinder) bleibt unverändert.
    expect(instrumented).toContain('<li>A<div class="block-children">');
    expect(instrumented).toContain('<li>B</li>');
  });

  it('ein fehlendes Template bekommt im instrumentierten Modus ebenfalls einen Pfad-Wrapper', () => {
    const html = renderPage(
      { title: 'T', slug: 't', blocks: [{ template: 'DoesNotExist', props: {} }] },
      {},
      { instrumentPaths: true }
    );
    expect(html).toContain('data-temgine-block="0"');
    expect(html).toContain('Missing template: DoesNotExist');
  });
});
