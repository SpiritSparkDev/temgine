// marked ist ESM-only (siehe __tests__/templateEngine.test.js) — stub.
jest.mock('marked', () => ({ marked: { parse: (s) => s, setOptions: () => {} } }));

const { renderPage, renderTemplate, collectPicgineSlugs } = require('../lib/templateEngine');
const { extractPicgineBlocks, extractTemplateVariables, extractTypedVariables, generateDefaultProps } = require('../lib/templateParser');

const GALLERY_TPL = [
  '<section>{{#picgine:galerie}}<h2>{{title}}</h2>',
  '{{#locked}}<form data-picgine-unlock="{{slug}}">{{#lockLogin}}<input name="email">{{/lockLogin}}{{#lockPassword}}PW{{/lockPassword}}</form>{{/locked}}',
  '{{^locked}}{{#images}}<img src="{{thumb}}" srcset="{{srcset}}" data-index="{{index}}">{{/images}}{{/locked}}',
  '{{/picgine:galerie}}<p>{{intro}}</p></section>',
].join('');

const publicGallery = {
  slug: 'hochzeit', title: 'Hochzeit <b>M</b>', locked: false, lockMode: null, imageCount: 2,
  cover: { thumb: 'c.webp' },
  images: [
    { id: 'a', thumb: 'https://p/img/a/thumb.webp?exp=1&sig=x', srcset: 'https://p/a 400w, https://p/a2 1200w' },
    { id: 'b', thumb: 'https://p/img/b/thumb.webp' },
  ],
  children: [],
};
const lockedGallery = { slug: 'privat', title: 'Privat', locked: true, lockMode: 'users', imageCount: 5, images: [{ id: 'leak' }], cover: { thumb: 'x' }, children: [] };

const page = (props, template = 'Galerie') => ({ title: 'P', slug: 'p', blocks: [{ template, props }] });

describe('extractPicgineBlocks', () => {
  it('finds editor-picked and fixed-slug sections', () => {
    const code = '{{#picgine:links}}a{{/picgine:links}}{{#picgine:rechts=hochzeit-mueller}}b{{/picgine:rechts}}{{#picgine:x=y}}c{{/picgine:x=y}}';
    expect(extractPicgineBlocks(code)).toEqual([
      { sectionName: 'links', fixedSlug: null },
      { sectionName: 'rechts', fixedSlug: 'hochzeit-mueller' },
      { sectionName: 'x', fixedSlug: 'y' },
    ]);
  });

  it('excludes picgine section content from editable variables', () => {
    expect(extractTemplateVariables(GALLERY_TPL)).toEqual(['intro']);
    expect(extractTypedVariables(GALLERY_TPL).map((v) => v.varName)).toEqual(['intro']);
    expect(generateDefaultProps(GALLERY_TPL)).toEqual({ intro: '', galerie: '' });
    expect(generateDefaultProps('{{#picgine:g=fest}}{{title}}{{/picgine:g}}')).toEqual({});
  });
});

describe('collectPicgineSlugs', () => {
  it('collects picked and fixed slugs over nested blocks, skipping empty picks', () => {
    const templates = { Galerie: GALLERY_TPL, Fest: '{{#picgine:g=fest}}{{title}}{{/picgine:g}}' };
    const blocks = [
      { template: 'Galerie', props: { galerie: 'hochzeit' } },
      { template: 'Galerie', props: { galerie: '' }, children: [
        { template: 'Fest', props: {} },
        { template: 'Galerie', props: { galerie: 'hochzeit' } },
      ] },
    ];
    expect(collectPicgineSlugs(blocks, templates).sort()).toEqual(['fest', 'hochzeit']);
  });
});

describe('renderPage with picgineContents', () => {
  const templates = { Galerie: GALLERY_TPL };

  it('renders a public gallery with escaped strings and 1-based index', () => {
    const html = renderPage(page({ galerie: 'hochzeit', intro: 'Hallo' }), templates, { picgineContents: { hochzeit: publicGallery } });
    expect(html).toContain('<h2>Hochzeit &lt;b&gt;M&lt;&#x2F;b&gt;</h2>');
    expect(html).toContain('src="https:&#x2F;&#x2F;p&#x2F;img&#x2F;a&#x2F;thumb.webp?exp&#x3D;1&amp;sig&#x3D;x"');
    expect(html).toContain('srcset="https:&#x2F;&#x2F;p&#x2F;a 400w, https:&#x2F;&#x2F;p&#x2F;a2 1200w"');
    expect(html).toContain('data-index="1"');
    expect(html).toContain('data-index="2"');
    expect(html).not.toContain('<form');
  });

  it('keeps gallery strings escaped even when a block prop of the same name holds HTML', () => {
    const tpl = '<div>{{title}}</div>{{#picgine:galerie}}<h2>{{title}}</h2>{{/picgine:galerie}}';
    const html = renderPage(page({ galerie: 'hochzeit', title: '<em>Block</em>' }), { Galerie: tpl }, { picgineContents: { hochzeit: publicGallery } });
    expect(html).toContain('<div><em>Block</em></div>');
    expect(html).toContain('<h2>Hochzeit &lt;b&gt;');
  });

  it('renders a locked gallery as unlock form without images and with lock flags', () => {
    const html = renderPage(page({ galerie: 'privat' }), templates, { picgineContents: { privat: lockedGallery } });
    expect(html).toContain('data-picgine-unlock="privat"');
    expect(html).toContain('<input name="email">');
    expect(html).not.toContain('PW');
    expect(html).not.toContain('<img');
  });

  it('renders nothing for the section when no gallery is picked or data is missing', () => {
    const empty = renderPage(page({ galerie: '', intro: 'Hallo' }), templates, { picgineContents: { hochzeit: publicGallery } });
    expect(empty).toBe('<section><p>Hallo</p></section>');
    const missing = renderPage(page({ galerie: 'weg', intro: 'Hallo' }), templates);
    expect(missing).toBe('<section><p>Hallo</p></section>');
  });

  it('uses the fixed slug from {{#picgine:name=slug}}', () => {
    const tpl = '{{#picgine:g=hochzeit}}{{#images}}[{{id}}]{{/images}}{{/picgine:g}}';
    const html = renderPage(page({}, 'Fest'), { Fest: tpl }, { picgineContents: { hochzeit: publicGallery } });
    expect(html).toBe('[a][b]');
  });
});

describe('renderTemplate picgine expansion', () => {
  it('expands {{#picgine:name=slug}} and accepts {{/picgine:name}} as closing tag', () => {
    expect(renderTemplate('{{#picgine:g=x}}{{title}}{{/picgine:g}}', {}, { g: { title: 'T' } })).toBe('T');
    expect(renderTemplate('{{#picgine:g=x}}{{title}}{{/picgine:g=x}}', {}, { g: { title: 'T' } })).toBe('T');
  });
});

describe('Phase 5: Kontext-Durchreichung und Unterordner-Navigation', () => {
  const { toPicgineContext } = require('../lib/templateEngine');
  const { loadPicgineContents, readPicgineParam } = require('../lib/picgineRuntime');

  // Unterordner "kirche" liegt in welt > hochzeit > kirche; im Block gewählt ist "hochzeit"
  const sub = {
    slug: 'kirche', title: 'Kirche', locked: false, parentSlug: 'hochzeit',
    breadcrumb: [{ slug: 'welt', title: 'Welt' }, { slug: 'hochzeit', title: 'Hochzeit' }],
    allowDownload: true, zip: 'https://p/dl/zip/kirche',
    images: [{ id: 'a', download: 'https://p/dl/a' }],
    children: [{ slug: 'altar', title: 'Altar' }],
  };

  it('passes allowDownload, zip, images[].download, parentSlug through', () => {
    const ctx = toPicgineContext(sub, 'hochzeit', '/fotos');
    expect(ctx.allowDownload).toBe(true);
    expect(ctx.zip).toBe('https://p/dl/zip/kirche');
    expect(ctx.images[0].download).toBe('https://p/dl/a');
    expect(ctx.parentSlug).toBe('hochzeit');
  });

  it('restricts breadcrumb/parentUrl to the selected subtree and builds child URLs', () => {
    const ctx = toPicgineContext(sub, 'hochzeit', '/fotos');
    expect(ctx.breadcrumb).toEqual([{ slug: 'hochzeit', title: 'Hochzeit', url: '/fotos' }]);
    expect(ctx.parentUrl).toBe('/fotos');
    expect(ctx.children[0].url).toBe('/fotos?picgine=altar');

    const deeper = toPicgineContext({ ...sub, slug: 'altar', parentSlug: 'kirche', breadcrumb: [...sub.breadcrumb, { slug: 'kirche', title: 'Kirche' }] }, 'hochzeit', '/fotos');
    expect(deeper.breadcrumb.map((c) => c.url)).toEqual(['/fotos', '/fotos?picgine=kirche']);
    expect(deeper.parentUrl).toBe('/fotos?picgine=kirche');
  });

  it('has no breadcrumb/parentUrl at the selected root', () => {
    const ctx = toPicgineContext({ ...sub, slug: 'hochzeit', parentSlug: 'welt', breadcrumb: [{ slug: 'welt', title: 'Welt' }] }, 'hochzeit', '/fotos');
    expect(ctx.breadcrumb).toEqual([]);
    expect(ctx.parentUrl).toBeNull();
  });

  it('renders the links via renderPage with picgineBasePath', () => {
    const tpl = '{{#picgine:galerie}}{{#breadcrumb}}<a href="{{url}}">{{title}}</a>{{/breadcrumb}}{{#children}}<a href="{{url}}">{{title}}</a>{{/children}}{{/picgine:galerie}}';
    const html = renderPage(page({ galerie: 'hochzeit' }), { Galerie: tpl }, { picgineBasePath: '/fotos', picgineContents: { hochzeit: sub } });
    expect(html).toContain('href="&#x2F;fotos">Hochzeit</a>');
    expect(html).toContain('href="&#x2F;fotos?picgine&#x3D;altar">Altar</a>');
    expect(html).not.toContain('Welt');
  });

  it('readPicgineParam validates the slug', () => {
    expect(readPicgineParam('?picgine=kirche&x=1')).toBe('kirche');
    expect(readPicgineParam('?picgine=..%2Fadmin')).toBeNull();
    expect(readPicgineParam('')).toBeNull();
  });

  it('loadPicgineContents uses the subfolder only where ?within= accepts it', async () => {
    const json = (status, body) => ({ ok: status === 200, status, json: async () => body });
    global.fetch = jest.fn(async (url) => {
      if (url === '/api/picgine/galleries/kirche?within=hochzeit') return json(200, sub);
      if (url === '/api/picgine/galleries/kirche?within=andere') return json(404, {});
      if (url === '/api/picgine/galleries/andere') return json(200, { slug: 'andere' });
      return json(500, {});
    });
    const out = await loadPicgineContents(['hochzeit', 'andere'], 'kirche');
    expect(out.hochzeit.slug).toBe('kirche');
    expect(out.andere.slug).toBe('andere');
  });
});
