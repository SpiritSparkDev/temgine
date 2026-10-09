// Section-Provider-Mechanismus (Plugin-System P2, Spezifikation §4) mit einem Fake-Provider.
// marked ist ESM-only (siehe __tests__/templateEngine.test.js) — stub.
jest.mock('marked', () => ({ marked: { parse: (s) => s, setOptions: () => {} } }));

const { _setClientPlugins } = require('../lib/plugins/client');
const { getSectionProviders, loadSections, loadSectionDataClient, sectionsRequireDynamic } = require('../lib/sections');
const { extractSectionBlocks, extractEditorSections, extractTemplateVariables, generateDefaultProps } = require('../lib/templateParser');
const { renderPage, collectSectionKeys } = require('../lib/templateEngine');

const FakeField = () => null;
const fake = {
  editorType: 'select',
  editorFieldLabel: 'Fake',
  EditorField: FakeField,
  trusted: true, // darf ein Plugin nicht setzen — wird überschrieben
  loadClient: jest.fn(async (keys) => Object.fromEntries(keys.map((k) => [k, { title: `T-${k}` }]))),
  toContext: jest.fn((data, ctx) => (data ? { ...data, ctx } : null)),
  requiresDynamic: ({ html, query }) => html.includes('data-fake-lock') || 'fake' in query,
};

const TPL = '<div>{{#fake:feld}}<h2>{{title}}</h2><p>{{text}}</p>{{/fake:feld}}{{#fake:fest=abc}}{{title}}{{/fake:fest}}<em>{{intro}}</em></div>';

let errorSpy;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  _setClientPlugins({ fakeplugin: { sections: { fake, each: { toContext: () => 1 }, folder: { toContext: () => 2 } } } });
});
afterEach(() => {
  jest.restoreAllMocks();
  _setClientPlugins({});
});

describe('registry', () => {
  it('registers plugin providers after the core ones, never trusted', () => {
    const providers = getSectionProviders();
    expect(Object.keys(providers)).toEqual(['folder', 'picgine', 'fake']);
    expect(providers.fake.trusted).toBe(false);
    expect(providers.fake.pluginId).toBe('fakeplugin');
  });

  it('rejects reserved and core prefixes', () => {
    const providers = getSectionProviders();
    expect(providers.each).toBeUndefined();
    expect(providers.folder.toContext({ a: 1 })).toEqual({ a: 1 }); // Kern-Provider, nicht das Plugin
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"each" ist reserviert'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('"folder" ist reserviert'));
  });
});

describe('parser', () => {
  it('finds sections with picked and fixed values', () => {
    expect(extractSectionBlocks(TPL)).toEqual([
      { prefix: 'fake', sectionName: 'feld', fixedValue: null },
      { prefix: 'fake', sectionName: 'fest', fixedValue: 'abc' },
    ]);
  });

  it('excludes section content from editable variables, default prop only for picked sections', () => {
    expect(extractTemplateVariables(TPL)).toEqual(['intro']);
    expect(generateDefaultProps(TPL)).toEqual({ intro: '', feld: '' });
  });

  it('selects the EditorField per provider (fixed values get no field)', () => {
    const code = `${TPL}{{#folder:bilder}}{{name}}{{/folder:bilder}}{{#picgine:galerie}}{{title}}{{/picgine:galerie}}`;
    const sections = extractEditorSections(code);
    expect(sections.map((s) => [s.prefix, s.sectionName])).toEqual([['folder', 'bilder'], ['picgine', 'galerie'], ['fake', 'feld']]);
    expect(sections[2].provider.EditorField).toBe(FakeField);
    expect(sections.map((s) => s.provider.editorType)).toEqual(['folder', 'gallery', 'select']);
    expect(sections.map((s) => s.provider.editorFieldLabel)).toEqual([undefined, 'Picgine-Galerie', 'Fake']);
  });

  it('collects section keys per prefix over nested blocks', () => {
    const blocks = [
      { template: 'T', props: { feld: 'x' } },
      { template: 'T', props: { feld: '' }, children: [{ template: 'T', props: { feld: 'y' } }] },
    ];
    expect(collectSectionKeys(blocks, { T: TPL })).toEqual({ fake: ['x', 'abc', 'y'] });
  });
});

describe('loading', () => {
  it('loads providers in parallel; error and timeout leave the section empty', async () => {
    jest.useFakeTimers();
    const pending = loadSections({
      ok: async (keys) => ({ [keys[0]]: 1 }),
      broken: async () => { throw new Error('kaputt'); },
      slow: () => new Promise(() => {}),
    }, { ok: ['a'], broken: ['b'], slow: ['c'], unknown: ['d'] });
    await jest.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toEqual({ ok: { a: 1 }, broken: {}, slow: {} });
    jest.useRealTimers();
  });

  it('loadClient runs only for active plugins', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ plugins: {} }) }));
    await expect(loadSectionDataClient({ fake: ['x'] }, {})).resolves.toEqual({});
    _setClientPlugins({ fakeplugin: { sections: { fake } } });
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ plugins: { fakeplugin: {} } }) }));
    await expect(loadSectionDataClient({ fake: ['x'] }, { query: { q: '1' } })).resolves.toEqual({ fake: { x: { title: 'T-x' } } });
    expect(fake.loadClient).toHaveBeenLastCalledWith(['x'], { query: { q: '1' } });
  });
});

describe('render', () => {
  const page = (props) => ({ title: 'P', slug: 'p', blocks: [{ template: 'T', props }] });

  it('builds the context via toContext with { fieldName, value, basePath, query }', () => {
    const html = renderPage(page({ feld: 'x', intro: 'Hi' }), { T: TPL }, {
      sectionData: { fake: { x: { title: 'Eins' }, abc: { title: 'Fest' } } }, basePath: '/s', query: { a: '1' },
    });
    expect(html).toBe('<div><h2>Eins</h2><p></p>Fest<em>Hi</em></div>');
    expect(fake.toContext).toHaveBeenCalledWith({ title: 'Eins' }, { fieldName: 'feld', value: 'x', basePath: '/s', query: { a: '1' } });
  });

  it('missing data renders an empty section', () => {
    const html = renderPage(page({ feld: 'x', intro: 'Hi' }), { T: TPL }, {});
    expect(html).toBe('<div><em>Hi</em></div>');
  });

  it('always escapes hostile provider data, even when a block prop of the same name is HTML', () => {
    const hostile = { title: '<script>alert(1)</script>', text: '{{intro}} {{{intro}}}' };
    const html = renderPage(page({ feld: 'x', intro: '<b>ok</b>', title: '<i>Block</i>', text: '<p>x</p>' }), { T: TPL }, { sectionData: { fake: { x: hostile } } });
    expect(html).toContain('<h2>&lt;script&gt;alert(1)&lt;&#x2F;script&gt;</h2>');
    expect(html).toContain('<p>{{intro}} {{{intro}}}</p>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<em><b>ok</b></em>');
  });
});

describe('requiresDynamic', () => {
  it('is true when any provider asks for it', () => {
    expect(sectionsRequireDynamic({ html: '<p></p>', query: {} })).toBe(false);
    expect(sectionsRequireDynamic({ html: '<form data-fake-lock>', query: {} })).toBe(true);
    expect(sectionsRequireDynamic({ html: '', query: { fake: '1' } })).toBe(true);
    expect(sectionsRequireDynamic({ html: '<form data-picgine-unlock="x">', query: {} })).toBe(true);
    expect(sectionsRequireDynamic({ html: '', query: { picgine: 'kirche' } })).toBe(true);
    expect(sectionsRequireDynamic({ html: '', query: { picgine: '../x' } })).toBe(false);
  });
});
