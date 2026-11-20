import { signToken } from '../lib/tokens';
import { createRoutes } from '../lib/api';
import { MAX_SITE_BYTES } from '../lib/routes/site';

// WP-B3: Seiten-CSS und Schriften, nur lesend.
function setup(siteFiles = [], fonts = []) {
  const writes = [];
  const core = {
    roles: { view: ['ADMIN'], edit: ['ADMIN'], delete: ['ADMIN'], cssView: ['ADMIN'], cssEdit: ['ADMIN'], cssDelete: ['ADMIN'], filesView: ['ADMIN'] },
    secret: () => 'geheim', now: () => 1_000_000, version: '0.66.0',
    bcrypt: { compare: async () => true },
    store: { listTemplates: () => [], getTemplateByName: () => null, saveTemplate: () => { writes.push('tpl'); }, deleteTemplateByName: () => { writes.push('tpl'); } },
    validatePreviewSubset: () => ({ ok: true, invalid: [] }),
    getUsedTemplateNames: async () => new Set(),
    extractTemplateVariables: () => [],
    renderTemplate: (c) => c,
    sectionProviders: () => ({}),
    externCss: {
      list: () => (Array.isArray(siteFiles) ? siteFiles : []).filter((f) => f.source === 'extern_css').map((f) => ({ filename: f.filename, content: f.content })),
      normalize: (n) => (n.endsWith('.css') ? n : `${n}.css`),
      write: (f) => { writes.push(`write ${f}`); }, remove: (f) => { writes.push(`remove ${f}`); },
    },
    siteCss: { list: () => (typeof siteFiles === 'function' ? siteFiles() : siteFiles) },
    siteFonts: { list: () => fonts },
    listUploads: () => [],
    audit: async () => {},
  };
  return { routes: createRoutes(core), writes };
}

function call(routes, key, { body, params = {}, query = {}, auth = true } = {}) {
  const res = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  const token = signToken({ sub: 'u1', name: 'A', role: 'ADMIN' }, 'geheim', undefined, 1_000_000).token;
  const req = { body, headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), 'x-designer-api': '1,2' } };
  return routes[key].handler(req, res, { params, query, log: { error() {} } }).then(() => res);
}

const f = (filename, content, extra = {}) => ({ id: `extern_css/${filename}`, filename, source: 'extern_css', href: `/extern_css/${filename}`, enabled: true, content, ...extra });

test('GET /site/css: nur aktive Dateien, Temgines Reihenfolge bleibt, Hash und Größe je Datei', async () => {
  const { routes } = setup([f('b.css', '.b{}'), f('a.css', '.a{}', { enabled: false }), f('c.css', '.c{}')]);
  const r = await call(routes, 'GET v1/site/css');
  expect(r.code).toBe(200);
  expect(r.body.files.map((x) => x.filename)).toEqual(['b.css', 'c.css']);
  expect(r.body.files[0]).toMatchObject({ content: '.b{}', size: 4, href: '/extern_css/b.css' });
  expect(r.body.files[0].hash).toMatch(/^[0-9a-f]{64}$/);
  expect(r.body.skipped).toEqual([]);
  expect(r.body.truncated).toBe(false);
});

test('GET /site/css: eine nicht lesbare Datei bricht nicht alles ab', async () => {
  const { routes } = setup([f('a.css', '.a{}'), f('kaputt.css', undefined, { content: undefined, error: 'EACCES' }), f('c.css', '.c{}')]);
  const r = await call(routes, 'GET v1/site/css');
  expect(r.code).toBe(200);
  expect(r.body.files.map((x) => x.filename)).toEqual(['a.css', 'c.css']);
  expect(r.body.skipped).toEqual([{ filename: 'kaputt.css', reason: 'READ_ERROR' }]);
});

test('GET /site/css: Größenlimit für die Antwort (2 MB gesamt), überzählige Dateien werden gemeldet', async () => {
  const big = (n) => `/*${'x'.repeat(n)}*/`;
  const { routes } = setup([f('a.css', big(1.5 * 1024 * 1024)), f('b.css', big(1 * 1024 * 1024)), f('c.css', '.c{}')]);
  const r = await call(routes, 'GET v1/site/css');
  expect(r.body.totalBytes).toBeLessThanOrEqual(MAX_SITE_BYTES);
  expect(r.body.files.map((x) => x.filename)).toEqual(['a.css', 'c.css']);
  expect(r.body.skipped).toEqual([{ filename: 'b.css', reason: 'SIZE_LIMIT' }]);
  expect(r.body.truncated).toBe(true);
});

test('GET /site/css: Fehler im Kern -> 500 mit Code, ohne Token 401', async () => {
  const boom = setup(() => { throw new Error('x'); });
  expect((await call(boom.routes, 'GET v1/site/css')).body.code).toBe('SITE_CSS_FAILED');
  expect((await call(setup().routes, 'GET v1/site/css', { auth: false })).code).toBe(401);
});

test('Seiten-CSS wird nie zurückgeschrieben: keine Schreibroute, PUT/DELETE auf Nicht-designer-Dateien -> 400/404, nichts geschrieben', async () => {
  const { routes, writes } = setup([f('main.css', 'body{}')]);
  expect(Object.keys(routes).filter((k) => /\/site\//.test(k)).every((k) => k.startsWith('GET '))).toBe(true);
  expect(routes['PUT v1/site/css']).toBeUndefined();
  const put = await call(routes, 'PUT v1/css/:file', { params: { file: 'main.css' }, body: { content: 'x{}' } });
  expect(put.code).toBe(400);
  expect(put.body.code).toBe('VALIDATION_ERROR');
  expect((await call(routes, 'DELETE v1/css/:file', { params: { file: 'main.css' } })).code).toBe(404);
  expect(writes).toEqual([]);
});

test('GET /site/fonts: nur aktive, Familie wie in Temgines fonts-css, @font-face nur für woff/woff2', async () => {
  const { routes } = setup([], [
    { id: 'uploads/Fair-Prosper_Bold.woff2', name: 'Fair-Prosper_Bold.woff2', ext: '.woff2', format: 'woff2', href: '/uploads/Fair-Prosper_Bold.woff2', enabled: true },
    { id: 'uploads/x.ttf', name: 'x.ttf', ext: '.ttf', format: 'truetype', href: '/uploads/x.ttf', enabled: true },
    { id: 'uploads/off.woff', name: 'off.woff', ext: '.woff', format: 'woff', href: '/uploads/off.woff', enabled: false },
  ]);
  const r = await call(routes, 'GET v1/site/fonts');
  expect(r.body.fonts.map((x) => [x.family, x.emitted])).toEqual([['Fair Prosper Bold', true], ['x', false]]);
  expect(r.body.css).toContain('font-family: "Fair Prosper Bold";');
  expect(r.body.css).toContain('src: url("/uploads/Fair-Prosper_Bold.woff2") format("woff2");');
  expect(r.body.css).not.toContain('x.ttf');
});

test('Capabilities nennen das Feature "site-css"', async () => {
  const { routes } = setup();
  expect((await call(routes, 'GET v1/capabilities')).body.features).toContain('site-css');
});
