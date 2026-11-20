import crypto from 'crypto';
import { signToken, verifyToken } from '../lib/tokens';
import { createRoutes, toKind } from '../lib/api';
import { memoryState } from '../lib/registry';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function fakeCore(over = {}) {
  const templates = new Map();
  const css = new Map();
  const audits = [];
  const core = {
    state: memoryState(),
    roles: { view: ['ADMIN', 'MODERATOR'], edit: ['ADMIN', 'MODERATOR'], delete: ['ADMIN'], cssView: ['ADMIN', 'MODERATOR'], cssEdit: ['ADMIN', 'MODERATOR'], cssDelete: ['ADMIN'], filesView: ['ADMIN'] },
    secret: () => 'geheim', now: () => 1_000_000, version: '0.66.0',
    bcrypt: { compare: async (p, h) => h === `$2b$${p}` },
    store: {
      listTemplates: () => [...templates.values()],
      getTemplateByName: (n) => [...templates.values()].find((t) => t.name.toLowerCase() === String(n).toLowerCase()) || null,
      saveTemplate: (t, prev) => { if (prev) templates.delete(prev); templates.set(t.name, { ...t }); return t; },
      deleteTemplateByName: (n) => templates.delete(n),
    },
    validatePreviewSubset: (code, master) => { const inv = (code.match(/\{\{(\w+)\}\}/g) || []).filter((m) => !master.includes(m)); return { ok: !inv.length, invalid: inv }; },
    getUsedTemplateNames: async () => new Set(over.used || []),
    extractTemplateVariables: (code) => [...code.matchAll(/\{\{(\w+)(?::\w+)?\}\}/g)].map((m) => ({ name: m[1] })),
    renderTemplate: (code, data) => code.replace(/\{\{(\w+)(?::\w+)?\}\}/g, (_, k) => data[k] ?? ''),
    sectionProviders: () => ({ folder: {} }),
    externCss: {
      list: () => [...css].map(([filename, content]) => ({ filename, content })),
      normalize: (n) => (n.endsWith('.css') ? n : `${n}.css`),
      write: (f, c) => css.set(f, c), remove: (f) => css.delete(f),
    },
    listUploads: () => [{ path: 'a.png', url: '/uploads/a.png', name: 'a.png', size: 1, isImage: true, secret: 'x' }],
    audit: async (a) => audits.push(a),
  };
  return { core: { ...core, ...over }, templates, css, audits };
}

function call(routes, key, { body, params = {}, query = {}, token, headers = {}, prisma } = {}) {
  const res = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  const req = { body, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } };
  return routes[key].handler(req, res, { params, query, prisma, log: { error() {} } }).then(() => res);
}
const tokenFor = (role = 'ADMIN') => signToken({ sub: 'u1', name: 'A', role }, 'geheim', undefined, 1_000_000).token;

test('Token: gültig, manipuliert, abgelaufen, falsches Secret', () => {
  const { token } = signToken({ sub: 'u' }, 's', 1000, 5000);
  expect(verifyToken(token, 's', 5500)).toMatchObject({ sub: 'u' });
  expect(verifyToken(token, 's', 7000)).toBeNull();
  expect(verifyToken(token, 'anderes', 5500)).toBeNull();
  expect(verifyToken(`${token.slice(0, -2)}xx`, 's', 5500)).toBeNull();
  expect(verifyToken('a.b.c', 's')).toBeNull();
});

test('Ohne Token 401, falsche Rolle 403, ohne Secret 503', async () => {
  const { core } = fakeCore();
  const r = createRoutes(core);
  expect((await call(r, 'GET v1/templates')).code).toBe(401);
  expect((await call(r, 'DELETE v1/templates/:name', { token: tokenFor('MODERATOR'), params: { name: 'x' } })).code).toBe(403);
  expect((await call(createRoutes({ ...core, secret: () => null }), 'GET v1/templates', { token: tokenFor() })).code).toBe(503);
});

test('Login: Erfolg, falsches Passwort, Rolle ohne Recht, Legacy-SHA-256', async () => {
  const { core, audits } = fakeCore();
  const r = createRoutes(core);
  const user = (o) => ({ user: { findFirst: async () => ({ id: 'u1', name: 'Anna', email: 'a@x', password: '$2b$pw', role: 'ADMIN', ...o }) } });
  const ok = await call(r, 'POST v1/auth/login', { body: { username: 'anna', password: 'pw' }, prisma: user() });
  expect(ok.code).toBe(200);
  expect(verifyToken(ok.body.token, 'geheim', 1_000_000)).toMatchObject({ sub: 'u1', role: 'ADMIN' });
  expect(ok.body).not.toHaveProperty('password');
  expect(audits[0].action).toBe('designer.login');
  expect((await call(r, 'POST v1/auth/login', { body: { username: 'anna', password: 'falsch' }, prisma: user() })).code).toBe(401);
  expect((await call(r, 'POST v1/auth/login', { body: { username: 'x', password: 'y' }, prisma: { user: { findFirst: async () => null } } })).code).toBe(401);
  expect((await call(r, 'POST v1/auth/login', { body: { username: 'anna', password: 'pw' }, prisma: user({ role: 'EDITOR' }) })).code).toBe(403);
  expect((await call(r, 'POST v1/auth/login', { body: { username: 'anna', password: 'pw' }, prisma: user({ password: sha('pw') }) })).code).toBe(200);
  expect(r['POST v1/auth/login'].rateLimit.max).toBeLessThanOrEqual(10);
});

test('Template anlegen, lesen, Art-Zuordnung, Konflikt per expectedHash, Umbenennen', async () => {
  const { core, templates } = fakeCore();
  const r = createRoutes(core);
  const t = tokenFor();
  const put = (name, body) => call(r, 'PUT v1/templates/:name', { token: t, params: { name }, body });

  const c = await put('Hero', { code: '<h1>{{Titel:text}}</h1>', kind: 'contact' });
  expect(c.code).toBe(200);
  expect(templates.get('Hero')).toMatchObject({ type: 'BLOCK', category: 'contact' });
  const got = await call(r, 'GET v1/templates/:name', { token: t, params: { name: 'hero' } });
  expect(got.body).toMatchObject({ name: 'Hero', kind: 'contact', hash: sha('<h1>{{Titel:text}}</h1>') });

  const stale = await put('Hero', { code: 'neu', kind: 'block', expectedHash: 'falsch' });
  expect(stale.code).toBe(409);
  expect(stale.body).toMatchObject({ code: 'TEMPLATE_CHANGED', current: { name: 'Hero' } });
  expect((await put('Hero', { code: 'neu', kind: 'block', expectedHash: got.body.hash, newName: 'Hero2' })).code).toBe(200);
  expect([...templates.keys()]).toEqual(['Hero2']);

  await put('Zwei', { code: 'x', kind: 'site' });
  expect((await put('Hero2', { code: 'y', kind: 'block', newName: 'zwei' })).body.code).toBe('NAME_TAKEN');
  expect(toKind(templates.get('Zwei'))).toBe('site');
});

test('Validierung: Name, Art, leerer Code, Blog-Vorschau ohne/mit unpassendem Master', async () => {
  const { core } = fakeCore();
  const r = createRoutes(core);
  const t = tokenFor();
  const put = (name, body) => call(r, 'PUT v1/templates/:name', { token: t, params: { name }, body });
  expect((await put('../x', { code: 'a' })).code).toBe(400);
  expect((await put('.versteckt', { code: 'a' })).code).toBe(400);
  expect((await put('A', { code: '' })).body.code).toBe('CODE_REQUIRED');
  expect((await put('A', { code: 'a', kind: 'nope' })).body.code).toBe('KIND_INVALID');
  expect((await put('V', { code: 'a', kind: 'blog-preview', master: 'Fehlt' })).body.code).toBe('MASTER_TEMPLATE_NOT_FOUND');
  await put('M', { code: '{{a}}', kind: 'blog-master' });
  expect((await put('V', { code: '{{b}}', kind: 'blog-preview', master: 'M' })).body.code).toBe('PREVIEW_PLACEHOLDER_MISMATCH');
  expect((await put('V', { code: '{{a}}', kind: 'blog-preview', master: 'M' })).code).toBe(200);
});

test('Löschen: nur wenn nicht verwendet (oder force), 404', async () => {
  const { core, templates } = fakeCore({ used: ['Hero'] });
  const r = createRoutes(core);
  const t = tokenFor();
  templates.set('Hero', { name: 'Hero', code: 'x', type: 'BLOCK' }); templates.set('Frei', { name: 'Frei', code: 'x', type: 'BLOCK' });
  const del = (name, query) => call(r, 'DELETE v1/templates/:name', { token: t, params: { name }, query });
  expect((await del('Hero')).body.code).toBe('TEMPLATE_IN_USE');
  expect((await del('Hero', { force: '1' })).code).toBe(200);
  expect((await del('Frei')).code).toBe(200);
  expect((await del('Weg')).code).toBe(404);
});

test('CSS: nur designer-*, Konflikt, Löschen; Assets ohne interne Felder', async () => {
  const { core, css } = fakeCore();
  const r = createRoutes(core);
  const t = tokenFor();
  const put = (file, body) => call(r, 'PUT v1/css/:file', { token: t, params: { file }, body });
  expect((await put('style', { content: 'a{}' })).code).toBe(400); // fremde Datei
  const w = await put('designer-Hero', { content: '.a{}' });
  expect(w.body).toMatchObject({ filename: 'designer-Hero.css', hash: sha('.a{}') });
  expect((await put('designer-Hero', { content: '.b{}', expectedHash: 'falsch' })).body.code).toBe('CSS_CHANGED');
  css.set('fremd.css', 'x');
  expect((await call(r, 'GET v1/css', { token: t })).body.map((f) => f.filename)).toEqual(['designer-Hero.css']);
  expect((await call(r, 'DELETE v1/css/:file', { token: t, params: { file: 'fremd' } })).code).toBe(404);
  expect((await call(r, 'DELETE v1/css/:file', { token: t, params: { file: 'designer-Hero' } })).code).toBe(200);
  const a = await call(r, 'GET v1/assets', { token: t });
  expect(a.body[0]).toEqual({ path: 'a.png', url: '/uploads/a.png', name: 'a.png', size: 1, isImage: true });
});

test('Capabilities, Validate und Preview', async () => {
  const { core } = fakeCore();
  const r = createRoutes(core);
  const t = tokenFor();
  expect((await call(r, 'GET v1/capabilities', { token: t })).body).toMatchObject({ apiVersion: 1, temgineVersion: '0.66.0', sectionProviders: [{ prefix: 'folder' }] });
  expect((await call(r, 'POST v1/validate', { token: t, body: { code: '{{a:text}}{{b}}' } })).body).toMatchObject({ ok: true, variables: ['a', 'b'] });
  const p = await call(r, 'POST v1/preview', { token: t, body: { code: '<p>{{a:text}}{{b}}</p>', props: { a: 'X' } } });
  expect(p.body).toEqual({ html: '<p>X</p>', warnings: ["Variable 'b' hat keinen Wert"] });
});
