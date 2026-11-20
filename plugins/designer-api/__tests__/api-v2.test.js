import crypto from 'crypto';
import { signToken } from '../lib/tokens';
import { createRoutes } from '../lib/api';
import { negotiate, paginate } from '../lib/common';
import groups from '../lib/routes';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function fakeCore() {
  const templates = new Map();
  const css = new Map();
  const audits = [];
  const writes = { count: 0 };
  const core = {
    roles: { view: ['ADMIN'], edit: ['ADMIN'], delete: ['ADMIN'], cssView: ['ADMIN'], cssEdit: ['ADMIN'], cssDelete: ['ADMIN'], filesView: ['ADMIN'] },
    secret: () => 'geheim', now: () => 1_000_000, version: '0.66.0',
    bcrypt: { compare: async () => true },
    store: {
      listTemplates: () => [...templates.values()],
      getTemplateByName: (n) => [...templates.values()].find((t) => t.name.toLowerCase() === String(n).toLowerCase()) || null,
      saveTemplate: (t, prev) => { writes.count++; if (prev) templates.delete(prev); templates.set(t.name, { ...t }); return t; },
      deleteTemplateByName: (n) => { writes.count++; templates.delete(n); },
    },
    validatePreviewSubset: () => ({ ok: true, invalid: [] }),
    getUsedTemplateNames: async () => new Set(),
    extractTemplateVariables: () => [],
    renderTemplate: (c) => c,
    sectionProviders: () => ({ folder: {} }),
    externCss: {
      list: () => [...css].map(([filename, content]) => ({ filename, content })),
      normalize: (n) => (n.endsWith('.css') ? n : `${n}.css`),
      write: (f, c) => { writes.count++; css.set(f, c); }, remove: (f) => { writes.count++; css.delete(f); },
    },
    listUploads: () => [],
    audit: async (a) => audits.push(a),
  };
  return { core, templates, css, audits, writes };
}

function call(routes, key, { body, params = {}, query = {}, headers = {}, v = 2 } = {}) {
  const res = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, val) { this.headers[k] = val; } };
  const token = signToken({ sub: 'u1', name: 'A', role: 'ADMIN' }, 'geheim', undefined, 1_000_000).token;
  const req = { body, headers: { authorization: `Bearer ${token}`, ...(v ? { 'x-designer-api': v === 2 ? '1,2' : String(v) } : {}), ...headers } };
  return routes[key].handler(req, res, { params, query, log: { error() {} } }).then(() => res);
}

test('Aushandlung: höchste gemeinsame Version, ohne Angabe v1, ohne Übereinstimmung null', () => {
  expect(negotiate(undefined)).toBe(1);
  expect(negotiate('1')).toBe(1);
  expect(negotiate('1,2')).toBe(2);
  expect(negotiate('2, 1, 3')).toBe(2);
  expect(negotiate('3,4')).toBeNull();
  expect(negotiate('abc')).toBeNull();
});

test('Capabilities: v1 ohne Header, v2 mit Header; features und apiVersions; 406 bei zu neuem Client', async () => {
  const r = createRoutes(fakeCore().core);
  const v1 = await call(r, 'GET v1/capabilities', { v: 0 });
  expect(v1.body).toMatchObject({ apiVersion: 1, apiVersions: [1, 2] });
  expect(v1.body).not.toHaveProperty('errors');
  const v2 = await call(r, 'GET v1/capabilities');
  expect(v2.body).toMatchObject({ apiVersion: 2, apiVersions: [1, 2] });
  expect(v2.body.features).toEqual(expect.arrayContaining(['dry-run', 'etag', 'pagination']));
  expect(v2.headers['X-Designer-Api']).toBe('2');
  const neu = await call(r, 'GET v1/capabilities', { v: 9 });
  expect(neu.code).toBe(406);
  expect(neu.body).toMatchObject({ code: 'API_VERSION_UNSUPPORTED', apiVersions: [1, 2] });
});

test('Fehlerliste nur in v2, zusätzlich zu error/code', async () => {
  const r = createRoutes(fakeCore().core);
  const put = (o) => call(r, 'PUT v1/templates/:name', { params: { name: 'A' }, body: { code: '', kind: 'nope' }, ...o });
  const a = await put({ v: 0 });
  expect(a.body).toMatchObject({ code: 'CODE_REQUIRED', error: 'Code fehlt' });
  expect(a.body).not.toHaveProperty('errors');
  const b = await put({});
  expect(b.body).toMatchObject({ code: 'CODE_REQUIRED' });
  expect(b.body.errors).toEqual([{ code: 'CODE_REQUIRED', message: 'Code fehlt', path: 'code' }, { code: 'KIND_INVALID', message: 'Unbekannte Art: nope', path: 'kind' }]);
  const c = await call(r, 'GET v1/templates/:name', { params: { name: 'weg' } });
  expect(c.body.errors).toEqual([{ code: 'TEMPLATE_NOT_FOUND', message: 'Template nicht gefunden', path: null }]);
});

test('dryRun schreibt nichts (Templates und CSS), meldet aber das Ergebnis; ohne v2 wird dryRun ignoriert', async () => {
  const { core, templates, css, audits, writes } = fakeCore();
  const r = createRoutes(core);
  const put = (name, body, o = {}) => call(r, 'PUT v1/templates/:name', { params: { name }, body, ...o });

  const d = await put('Neu', { code: '<p>x</p>', kind: 'block' }, { query: { dryRun: '1' } });
  expect(d.body).toEqual({ dryRun: true, action: 'create', name: 'Neu', kind: 'block', hash: sha('<p>x</p>') });
  expect(templates.size).toBe(0);
  expect(writes.count).toBe(0);
  expect(audits).toHaveLength(0);

  await put('Neu', { code: '<p>x</p>', kind: 'block' });
  const before = writes.count;
  expect((await put('Neu', { code: '<p>y</p>', kind: 'block', dryRun: true })).body).toMatchObject({ dryRun: true, action: 'update' });
  expect((await put('Neu', { code: '<p>y</p>', kind: 'block', expectedHash: 'falsch' }, { query: { dryRun: '1' } })).code).toBe(409); // Prüfung läuft auch im Trockenlauf
  expect((await call(r, 'DELETE v1/templates/:name', { params: { name: 'Neu' }, query: { dryRun: '1' } })).body).toMatchObject({ dryRun: true, action: 'delete' });
  expect(templates.get('Neu').code).toBe('<p>x</p>');
  expect(writes.count).toBe(before);

  const cd = await call(r, 'PUT v1/css/:file', { params: { file: 'designer-A' }, body: { content: '.a{}' }, query: { dryRun: '1' } });
  expect(cd.body).toMatchObject({ dryRun: true, action: 'create', filename: 'designer-A.css' });
  expect(css.size).toBe(0);
  css.set('designer-A.css', '.a{}');
  expect((await call(r, 'DELETE v1/css/:file', { params: { file: 'designer-A' }, query: { dryRun: '1' } })).body.dryRun).toBe(true);
  expect(css.size).toBe(1);

  // v1-Client sendet dryRun nicht: wird ignoriert (schreibt wirklich)
  await put('V1', { code: 'a', kind: 'block' }, { query: { dryRun: '1' }, v: 0 });
  expect(templates.has('V1')).toBe(true);
});

test('ETag und If-Match für Templates und CSS (zusätzlich zu expectedHash)', async () => {
  const { core, templates, css } = fakeCore();
  const r = createRoutes(core);
  const put = (name, body, headers) => call(r, 'PUT v1/templates/:name', { params: { name }, body, headers });
  const first = await put('T', { code: 'eins', kind: 'block' });
  expect(first.headers.ETag).toBe(`"${sha('eins')}"`);
  expect(first.headers['X-Designer-ETag']).toBe(`"${sha('eins')}"`);
  const got = await call(r, 'GET v1/templates/:name', { params: { name: 'T' } });
  expect(got.headers.ETag).toBe(`"${sha('eins')}"`);
  expect((await call(r, 'GET v1/templates/:name', { params: { name: 'T' }, v: 0 })).headers.ETag).toBeUndefined();

  const stale = await put('T', { code: 'zwei', kind: 'block' }, { 'if-match': '"falsch"' });
  expect(stale.code).toBe(409);
  expect(stale.body).toMatchObject({ code: 'TEMPLATE_CHANGED', current: { hash: sha('eins') } });
  expect((await put('T', { code: 'zwei', kind: 'block' }, { 'if-match': got.headers.ETag })).code).toBe(200);
  expect(templates.get('T').code).toBe('zwei');
  // v1: If-Match wird ignoriert
  expect((await call(r, 'PUT v1/templates/:name', { params: { name: 'T' }, body: { code: 'drei', kind: 'block' }, headers: { 'if-match': '"falsch"' }, v: 0 })).code).toBe(200);

  css.set('designer-X.css', 'a');
  const c = await call(r, 'GET v1/css/:file', { params: { file: 'designer-X' } });
  expect(c.headers.ETag).toBe(`"${sha('a')}"`);
  const cs = await call(r, 'PUT v1/css/:file', { params: { file: 'designer-X' }, body: { content: 'b' }, headers: { 'if-match': '"falsch"' } });
  expect(cs.body).toMatchObject({ code: 'CSS_CHANGED' });
  expect((await call(r, 'PUT v1/css/:file', { params: { file: 'designer-X' }, body: { content: 'b' }, headers: { 'if-match': c.headers.ETag } })).code).toBe(200);
  css.set('fremd.css', 'x');
  expect((await call(r, 'GET v1/css/:file', { params: { file: 'fremd' } })).code).toBe(404);
});

test('Paginierung: ohne Parameter wie v1 (Array), mit limit/cursor Seiten, Fehler bei ungültigen Werten', async () => {
  const { core, templates } = fakeCore();
  ['d', 'a', 'c', 'b', 'e'].forEach((n) => templates.set(n, { name: n, code: n, type: 'BLOCK' }));
  const r = createRoutes(core);
  const list = (query, v = 2) => call(r, 'GET v1/templates', { query, v });

  expect((await list({})).body.map((t) => t.name)).toEqual(['d', 'a', 'c', 'b', 'e']); // Reihenfolge wie v1
  expect(Array.isArray((await list({ limit: '2' }, 0)).body)).toBe(true); // v1 ignoriert limit

  const p1 = (await list({ limit: '2' })).body;
  expect(p1.items.map((t) => t.name)).toEqual(['a', 'b']);
  expect(p1).toMatchObject({ total: 5 });
  const p2 = (await list({ limit: '2', cursor: p1.nextCursor })).body;
  expect(p2.items.map((t) => t.name)).toEqual(['c', 'd']);
  const p3 = (await list({ limit: '2', cursor: p2.nextCursor })).body;
  expect(p3.items.map((t) => t.name)).toEqual(['e']);
  expect(p3.nextCursor).toBeNull();

  expect((await list({ limit: '0' })).body.errors[0]).toMatchObject({ code: 'VALIDATION_ERROR', path: 'limit' });
  expect((await list({ cursor: '%%%' })).code).toBe(400);
  expect(paginate({ v: 2, query: { limit: '1' } }, [], (x) => x).body).toMatchObject({ items: [], nextCursor: null });
});

test('Routen-Gruppen: jede Datei liefert Routen, Schlüssel sind eindeutig', () => {
  const kit = { core: fakeCore().core, open: () => ({}), authed: () => ({}), audit() {}, validateTemplate() {}, varNames() {}, features: [] };
  const keys = groups.flatMap((g) => Object.keys(g.routes(kit)));
  expect(keys.length).toBeGreaterThanOrEqual(12);
  expect(new Set(keys).size).toBe(keys.length);
  expect(() => createRoutes({ ...fakeCore().core })).not.toThrow();
});
