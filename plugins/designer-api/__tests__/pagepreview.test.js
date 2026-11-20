import { signToken } from '../lib/tokens';
import { createRoutes } from '../lib/api';
import { createPagesCore } from '../test-support/mock-pages';

// WP-B4: Seitenliste und Seitenvorschau (mit dem vereinfachten Render-Ersatz aus e2e/mock-pages.js)
const page = (o) => ({ id: o.slug, title: o.slug.toUpperCase(), status: 'PUBLISHED', blocks: [], data: {}, children: [], createdAt: 1, ...o });
function setup({ pages, templates = {}, widgets = [], navs = [], footers = [], globals = {} } = {}) {
  const writes = [];
  const pc = createPagesCore({ pages, navs, footers, widgets, globals });
  const orig = pc.renderPage;
  pc.renderPage = (...a) => { pc.renderPage.calls.push(a); return orig(...a); };
  pc.renderPage.calls = [];
  const core = {
    roles: { view: ['ADMIN'], edit: ['ADMIN'], delete: ['ADMIN'], cssView: ['ADMIN'], cssEdit: ['ADMIN'], cssDelete: ['ADMIN'], filesView: ['ADMIN'] },
    secret: () => 'geheim', now: () => 1_000_000, version: '0.0.0',
    bcrypt: { compare: async () => true },
    store: { listTemplates: () => [], getTemplateByName: (n) => (templates[n] ? { name: n, code: templates[n] } : null), saveTemplate: () => writes.push('x'), deleteTemplateByName: () => writes.push('x') },
    validatePreviewSubset: () => ({ ok: true, invalid: [] }),
    getUsedTemplateNames: async () => new Set(),
    extractTemplateVariables: (code) => [...String(code).matchAll(/\{\{\{?\s*([\w.:-]+)\s*\}?\}\}/g)].map((m) => ({ name: m[1] })),
    renderTemplate: (c) => c,
    sectionProviders: () => ({}),
    context: { globals: async () => [], widgets: async () => widgets.map((w) => ({ name: w.name, slug: w.slug })), navigations: async () => navs.map((n) => ({ name: n.name, role: n.type, isActive: n.isActive, key: n.key })) },
    externCss: { list: () => [], normalize: (n) => n, write: () => writes.push('x'), remove: () => writes.push('x') },
    siteCss: { list: () => [{ id: 'extern_css/a.css', filename: 'a.css', href: '/extern_css/a.css', enabled: true, content: '.a{}' }, { id: 'extern_css/b.css', filename: 'b.css', href: '/extern_css/b.css', enabled: false, content: '.b{}' }] },
    siteFonts: { list: () => [] },
    listUploads: () => [],
    audit: async () => {},
    pages: pc,
  };
  return { routes: createRoutes(core), pc, writes };
}
function call(routes, key, { body, params = {} } = {}) {
  const res = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  const token = signToken({ sub: 'u1', name: 'A', role: 'ADMIN' }, 'geheim', undefined, 1_000_000).token;
  const req = { body, method: key.split(' ')[0], headers: { authorization: `Bearer ${token}`, 'x-designer-api': '1,2' } };
  return routes[key].handler(req, res, { params, query: {}, log: { error() {} } }).then(() => res);
}

const SITE = () => [
  page({ slug: 'start', isHomepage: true, blocks: [{ type: 'Text', props: { t: 'Hallo' } }] }),
  page({ slug: 'leistungen', blocks: [{ type: 'Text', props: { t: 'Eins' } }, { type: 'Text', props: { t: 'Zwei' } }], children: [page({ slug: 'beratung', blocks: [{ type: 'Text', props: { t: 'Kind' } }] })] }),
  page({ slug: 'entwurf', status: 'DRAFT', blocks: [{ type: 'Text', props: { t: 'E' } }] }),
  page({ slug: 'privat', accessPasswordHash: 'x', blocks: [{ type: 'Text', props: { t: 'GEHEIM' } }] }),
];
const T = { Text: '<p>{{t}}</p>' };
const NAV = { id: 'n1', name: 'Haupt', type: 'MAIN', isActive: true, code: '<nav>{{{pagelist}}}</nav>' };

test('GET /pages: alle Seiten inkl. Unterseiten, Entwurf und Schutz gekennzeichnet; features enthält page-preview', async () => {
  const { routes } = setup({ pages: SITE() });
  const r = await call(routes, 'GET v1/pages');
  expect(r.body.pages.map((p) => [p.path, p.depth])).toEqual([['start', 0], ['leistungen', 0], ['leistungen/beratung', 1], ['entwurf', 0], ['privat', 0]]);
  expect(r.body.pages.find((p) => p.path === 'entwurf')).toMatchObject({ status: 'DRAFT', restricted: false, title: 'ENTWURF' });
  expect(r.body.pages.find((p) => p.path === 'privat').restricted).toBe(true);
  expect((await call(routes, 'GET v1/capabilities')).body.features).toContain('page-preview');
});

test('Positionen: end, start, Index, replace', async () => {
  const { routes } = setup({ pages: SITE(), templates: T });
  const run = async (position) => (await call(routes, 'POST v1/pages/:slug/preview', { params: { slug: 'leistungen' }, body: { code: '<b>{{x}}</b>', props: { x: 'N' }, position } })).body.html;
  expect(await run('end')).toBe('<p>Eins</p>\n<p>Zwei</p>\n<b>N</b>');
  expect(await run('start')).toBe('<b>N</b>\n<p>Eins</p>\n<p>Zwei</p>');
  expect(await run(1)).toBe('<p>Eins</p>\n<b>N</b>\n<p>Zwei</p>');
  expect(await run(99)).toBe('<p>Eins</p>\n<p>Zwei</p>\n<b>N</b>');
  expect(await run('replace')).toBe('<b>N</b>');
});

test('Vorschau: Navigation, Footer, globale Variablen, nichts gespeichert; Unterseite per URL-kodiertem Pfad', async () => {
  const { routes, pc, writes } = setup({ pages: SITE(), templates: T, navs: [NAV], footers: [{ id: 'f1', isActive: true, code: '<footer>{{global.firma}}</footer>' }], globals: { firma: 'ACME' } });
  const body = { code: '<i>{{global.firma}} {{{nav:main}}}</i>', props: {}, position: 'end' };
  let r = await call(routes, 'POST v1/pages/:slug/preview', { params: { slug: 'leistungen%2Fberatung' }, body });
  expect(r.code).toBe(200);
  expect(r.body.html).toContain('<nav>start,leistungen</nav>'); // nur öffentliche Seiten
  expect(r.body.html).toContain('<footer>ACME</footer>');
  expect(r.body.html).toContain('<i>ACME <nav>');
  expect(r.body.html).toContain('<p>Kind</p>');
  expect(pc.renderPage.calls[0][2].isChild).toBe(true);
  expect(r.body.page).toMatchObject({ path: 'leistungen/beratung' });
  expect(r.body.css).toEqual([{ id: 'extern_css/a.css', filename: 'a.css', href: '/extern_css/a.css', hash: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
  r = await call(routes, 'POST v1/pages/:slug/preview', { params: { slug: 'start' }, body });
  expect(pc.renderPage.calls[1][2]).toMatchObject({ isChild: false, basePath: '/' });
  expect(writes).toEqual([]);
});

test('Hinweise statt Absturz: unbekannte Platzhalter, fehlendes Template, Renderfehler', async () => {
  const { routes, pc } = setup({ pages: [...SITE(), page({ slug: 'kaputt', blocks: [{ type: 'Fehlt', props: {} }] })], templates: T, navs: [NAV], widgets: [{ name: 'Kontakt', slug: 'kontakt' }], globals: { firma: 'A' } });
  let r = await call(routes, 'POST v1/pages/:slug/preview', { params: { slug: 'kaputt' }, body: { code: '{{global.nope}} {{{widget.kontakt}}} {{widget.x}} {{{nav:xyz}}} {{{nav:main}}} {{fehlt}} {{page.title}}', props: {} } });
  expect(r.code).toBe(200);
  expect(r.body.warnings).toEqual(expect.arrayContaining(["Template 'Fehlt' eines Seitenblocks fehlt in Temgine.", "Globale Variable 'nope' existiert nicht oder ist nicht aktiv.", "Widget 'x' existiert nicht.", "Navigation 'nav:xyz' ist in Temgine nicht definiert.", "Variable 'fehlt' hat keinen Wert"]));
  expect(r.body.warnings.some((w) => /kontakt|nav:main|page\.title/.test(w))).toBe(false);
  pc.renderPage = () => { throw new Error('boom'); };
  r = await call(routes, 'POST v1/pages/:slug/preview', { params: { slug: 'start' }, body: { code: 'x' } });
  expect(r.code).toBe(200);
  expect(r.body.html).toBe('');
  expect(r.body.warnings[0]).toMatch(/boom/);
});

test('Entwurf ist vorschaubar, geschützte Seite zeigt ihre Blöcke nicht; Fehlerfälle', async () => {
  const { routes } = setup({ pages: SITE(), templates: T, navs: [NAV] });
  const prev = (slug, body) => call(routes, 'POST v1/pages/:slug/preview', { params: { slug }, body });
  expect((await prev('entwurf', { code: 'X' })).body.html).toContain('<p>E</p>');
  const priv = await prev('privat', { code: 'X' });
  expect(priv.body.html).not.toContain('GEHEIM');
  expect(priv.body.warnings.join(' ')).toMatch(/zugriffsgeschützt/);
  expect((await prev('gibtsnicht', { code: 'X' })).code).toBe(404);
  expect((await prev('start', { code: 5 })).code).toBe(400);
  expect((await prev('start', { code: 'X', position: 'mitte' })).code).toBe(400);
  expect((await prev('start', { code: 'X', position: -1 })).code).toBe(400);
  expect((await prev('start', { code: 'X', props: [] })).code).toBe(400);
});
