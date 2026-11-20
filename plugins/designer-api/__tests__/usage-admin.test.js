import { createRoutes } from '../lib/api';
import { findUsage } from '../lib/usage';
import { memoryState, createCode, redeemCode } from '../lib/registry';

const pages = [
  { id: 'p1', title: 'Start', slug: 'start', template: 'Karte', blocks: [] },
  { id: 'p2', title: 'Team', slug: 'team', template: null, blocks: [{ type: 'Text', children: [{ children: [{ template: 'Karte' }] }] }] },
  { id: 'p3', title: 'Leer', slug: 'leer', template: 'Andere', blocks: null },
];
const channels = [{ id: 'c1', name: 'News', slug: 'news', templateReading: 'Karte', templateArchiveEntry: 'Karte', templateDetailPreview: 'X' }];

function setup() {
  const state = memoryState();
  const audits = [];
  const templates = new Map([['Karte', { name: 'Karte', code: '<p/>', type: 'BLOCK' }]]);
  const core = {
    roles: { view: ['ADMIN'], edit: ['ADMIN'], delete: ['ADMIN'], cssView: ['ADMIN'], cssEdit: ['ADMIN'], cssDelete: ['ADMIN'], filesView: ['ADMIN'] },
    secret: () => 'geheim', now: () => 1_000_000, version: '0.66.0', pluginVersion: '9.9.9', state,
    bcrypt: { compare: async (p, h) => h === `$2b$${p}` },
    store: { listTemplates: () => [...templates.values()], getTemplateByName: (n) => templates.get(n) || null, saveTemplate: (t) => t, deleteTemplateByName: (n) => templates.delete(n) },
    validatePreviewSubset: () => ({ ok: true }), getUsedTemplateNames: async () => new Set(['Karte']),
    getTemplateUsage: async (n) => findUsage(pages, channels, n),
    listDesignerAudit: async (n) => audits.filter((a) => a.action.startsWith('designer.')).slice(-n).reverse().map((a) => ({ action: a.action, createdAt: 0 })),
    extractTemplateVariables: () => [], renderTemplate: (c) => c, sectionProviders: () => ({}),
    externCss: { list: () => [], normalize: (n) => n, write() {}, remove() {} }, listUploads: () => [],
    audit: async (a) => audits.push(a),
  };
  return { state, audits, routes: createRoutes(core) };
}

function call(routes, key, { body, params = {}, query = {}, token, user } = {}) {
  const res = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  const req = { method: key.split(' ')[0], body, headers: token ? { authorization: `Bearer ${token}` } : {} };
  return routes[key].handler(req, res, { params, query, user, log: { error() {} } }).then(() => res);
}
const admin = { id: 'u1', name: 'Anna', email: 'a@x', role: 'ADMIN' };
async function token(t, access = 'write') {
  const { code } = await createCode(t.state, { now: 1_000_000, secret: 'geheim', by: { sub: 'u1', name: 'Anna', role: 'ADMIN' }, access });
  return (await call(t.routes, 'POST v1/pairing/redeem', { body: { code } })).body.token;
}

test('findUsage: Seiten (Seiten-Template, verschachtelter Block) und Kanäle mit Rollen, andere Templates nicht', () => {
  const u = findUsage(pages, channels, 'Karte');
  expect(u.count).toBe(3);
  expect(u.pages).toEqual([{ id: 'p1', title: 'Start', slug: 'start', via: 'template' }, { id: 'p2', title: 'Team', slug: 'team', via: 'block' }]);
  expect(u.channels).toEqual([{ id: 'c1', name: 'News', slug: 'news', roles: ['archiveEntry', 'reading'] }]);
  expect(findUsage(pages, channels, 'Nirgends').count).toBe(0);
});

test('GET /templates/:name/usage: Liste, 404 und Anmeldung; Löschen ohne force bleibt 409', async () => {
  const t = setup();
  const tok = await token(t);
  const r = await call(t.routes, 'GET v1/templates/:name/usage', { token: tok, params: { name: 'Karte' } });
  expect([r.code, r.body.count, r.body.pages.length, r.body.channels.length]).toEqual([200, 3, 2, 1]);
  expect((await call(t.routes, 'GET v1/templates/:name/usage', { token: tok, params: { name: 'Nope' } })).code).toBe(404);
  expect((await call(t.routes, 'GET v1/templates/:name/usage', { params: { name: 'Karte' } })).code).toBe(401);
  const del = await call(t.routes, 'DELETE v1/templates/:name', { token: tok, params: { name: 'Karte' } });
  expect([del.code, del.body.code]).toEqual([409, 'TEMPLATE_IN_USE']);
  expect((await call(t.routes, 'GET v1/capabilities', { token: tok })).body.features).toEqual(expect.arrayContaining(['usage', 'admin']));
});

test('Designer-Zugriff aus: alles 403 DESIGNER_DISABLED außer Info und Admin; wieder an wirkt sofort', async () => {
  const t = setup();
  const tok = await token(t);
  expect((await call(t.routes, 'GET v1/templates', { token: tok })).code).toBe(200);
  expect((await call(t.routes, 'PUT v1/admin/switches', { user: admin, body: { disabled: true } })).body).toEqual({ disabled: true, readOnly: false });
  for (const [key, opt] of [['GET v1/templates', { token: tok }], ['GET v1/capabilities', { token: tok }], ['POST v1/preview', { token: tok, body: { code: 'x' } }], ['POST v1/auth/login', { body: { username: 'a', password: 'b' } }], ['POST v1/pairing/redeem', { body: { code: '12345678' } }]]) {
    const r = await call(t.routes, key, opt);
    expect([key, r.code, r.body.code]).toEqual([key, 403, 'DESIGNER_DISABLED']);
  }
  expect((await call(t.routes, 'GET v1/info')).body).toMatchObject({ disabled: true });
  expect((await call(t.routes, 'GET v1/admin/status', { user: admin })).body).toMatchObject({ disabled: true, pluginVersion: '9.9.9', temgineVersion: '0.66.0' });
  expect((await call(t.routes, 'PUT v1/admin/switches', { user: admin, body: { disabled: false } })).code).toBe(200);
  expect((await call(t.routes, 'GET v1/templates', { token: tok })).code).toBe(200);
});

test('Globales „nur lesen“: Schreiben 403 READ_ONLY auch mit Schreib-Token, Lesen und Vorschau gehen', async () => {
  const t = setup();
  const tok = await token(t, 'write');
  await call(t.routes, 'PUT v1/admin/switches', { user: admin, body: { readOnly: true } });
  const put = await call(t.routes, 'PUT v1/templates/:name', { token: tok, params: { name: 'A' }, body: { code: '<p/>', kind: 'block' } });
  expect([put.code, put.body.code]).toEqual([403, 'READ_ONLY']);
  expect((await call(t.routes, 'DELETE v1/templates/:name', { token: tok, params: { name: 'Karte' } })).code).toBe(403);
  expect((await call(t.routes, 'GET v1/templates', { token: tok })).code).toBe(200);
  expect((await call(t.routes, 'POST v1/preview', { token: tok, body: { code: '<p>x</p>' } })).code).toBe(200);
  await call(t.routes, 'PUT v1/admin/switches', { user: admin, body: { readOnly: false } });
  expect((await call(t.routes, 'PUT v1/templates/:name', { token: tok, params: { name: 'A' }, body: { code: '<p/>', kind: 'block' } })).code).toBe(200);
  expect((await call(t.routes, 'PUT v1/admin/switches', { user: admin, body: {} })).code).toBe(400);
  expect((await call(t.routes, 'PUT v1/admin/switches', { user: admin, body: { readOnly: 'ja' } })).code).toBe(400);
});

test('Admin: Token-Zähler und letzte Designer-Aktionen', async () => {
  const t = setup();
  await token(t);
  await call(t.routes, 'PUT v1/admin/switches', { user: admin, body: { readOnly: true } });
  expect((await call(t.routes, 'GET v1/admin/status', { user: admin })).body.activeTokens).toBeGreaterThanOrEqual(1);
  const a = (await call(t.routes, 'GET v1/admin/audit', { user: admin })).body.items;
  expect(a[0].action).toBe('designer.switches');
  expect(a.every((x) => x.action.startsWith('designer.'))).toBe(true);
});
