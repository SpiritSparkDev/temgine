// Render-Snapshot für renderPage: beweist, dass Refactorings (Plugin-System P0ff.)
// das HTML nicht verändern. marked ist ESM-only — stub wie in templateEngine.test.js.
jest.mock('marked', () => ({ marked: { parse: (s) => s, setOptions: () => {} } }));

const { renderPage } = require('../lib/templateEngine');

const templates = {
  Hero: '<header><h1>{{title}}</h1>{{{nav:main}}}<p>{{global.companyName}}</p>{{{text}}}</header>',
  Wrapper: '<section class="wrap">{{{children}}}</section>',
  Gallery: '<ul>{{#folder:bilder}}<li><a href="{{url}}">{{name}}</a></li>{{/folder:bilder}}</ul>',
  Galerie: [
    '<section>{{#picgine:galerie}}<h2>{{title}}</h2>',
    '{{#locked}}<form data-picgine-unlock="{{slug}}">{{#lockLogin}}<input name="email">{{/lockLogin}}</form>{{/locked}}',
    '{{^locked}}{{#images}}<img src="{{thumb}}" data-index="{{index}}">{{/images}}{{/locked}}',
    '{{#children}}<a href="{{url}}">{{title}}</a>{{/children}}',
    '{{/picgine:galerie}}<p>{{intro}}</p></section>',
  ].join(''),
};

const navigations = {
  main: { code: '<nav>{{#pages}}<a href="/{{slug}}">{{title}}</a>{{/pages}}</nav>', data: { pages: [{ slug: 'a', title: 'A' }] } },
  byId: { n1: { name: 'Seiten Nav', code: '<nav class="side">{{global.companyName}}</nav>', data: {} } },
};
const footer = { code: '<footer>{{global.copyrightText}}</footer>', data: {} };
const globalVars = { companyName: 'Temgine <GmbH>', copyrightText: '© 2026' };
const globalPages = { byId: { w1: { code: '<aside>{{global.companyName}}</aside>' } } };
const folderContents = { bilder: [{ name: 'a.jpg', url: '/uploads/bilder/a.jpg' }, { name: 'b <x>.jpg', url: '/uploads/bilder/b.jpg' }] };
const picgineContents = {
  hochzeit: {
    slug: 'hochzeit', title: 'Hochzeit <b>M</b>', locked: false, imageCount: 1,
    images: [{ id: 'a', thumb: 'https://p/img/a/thumb.webp?exp=1&sig=x' }],
    children: [{ slug: 'hochzeit/kirche', title: 'Kirche' }],
  },
  privat: { slug: 'privat', title: 'Privat', locked: true, lockMode: 'users', images: [{ id: 'leak' }], children: [] },
};

const page = {
  title: 'Start', slug: 'start',
  blocks: [
    { template: 'Hero', props: { title: 'Willkommen', text: '<p>Hallo <strong>Welt</strong></p>' } },
    { type: 'navigation', props: { navigationId: 'n1' } },
    { type: 'global-page', props: { globalPageId: 'w1' } },
    { template: 'Wrapper', props: {}, children: [
      { template: 'Gallery', props: { bilder: 'bilder' } },
      { template: 'Galerie', props: { galerie: 'hochzeit', intro: 'Öffentlich' } },
    ] },
    { template: 'Galerie', props: { galerie: 'privat', intro: 'Gesperrt' } },
    { type: 'blog-channel', props: { channelSlug: 'news', templateName: 'Karte', postLimit: 3 } },
    { template: 'Hero', hidden: true, props: { title: 'versteckt' } },
  ],
};

const render = (opts) => renderPage(page, templates, {
  navigations, footer, globalVars, globalPages, sectionData: { folder: folderContents, picgine: picgineContents }, basePath: '/fotos', ...opts,
});

describe('renderPage snapshot (P0 equivalence)', () => {
  it('home page', () => {
    expect(render({ isChild: false })).toMatchSnapshot();
  });

  it('child page', () => {
    expect(render({ isChild: true })).toMatchSnapshot();
  });

  it('without optional data', () => {
    expect(renderPage(page, templates)).toMatchSnapshot();
  });
});
