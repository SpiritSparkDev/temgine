import { createRoutes } from '../lib/api';
import { memoryState, createCode, redeemCode } from '../lib/registry';

function setup() {
  const clock = { t: 1_000_000 };
  const state = memoryState();
  const audits = [];
  const core = {
    roles: { view: ['ADMIN'], edit: ['ADMIN'], delete: ['ADMIN'], cssView: ['ADMIN'], cssEdit: ['ADMIN'], cssDelete: ['ADMIN'], filesView: ['ADMIN'] },
    secret: () => 'geheim', now: () => clock.t, version: '0.66.0', state,
    bcrypt: { compare: async (p, h) => h === `$2b$${p}` },
    store: { listTemplates: () => [], getTemplateByName: () => null, saveTemplate: (t) => t, deleteTemplateByName: () => true },
    validatePreviewSubset: () => ({ ok: true }), getUsedTemplateNames: async () => new Set(),
    extractTemplateVariables: () => [], renderTemplate: (c) => c, sectionProviders: () => ({}),
    externCss: { list: () => [], normalize: (n) => n, write() {}, remove() {} }, listUploads: () => [],
    audit: async (a) => audits.push(a),
  };
  return { clock, state, audits, routes: createRoutes(core) };
}

function call(routes, key, { body, params = {}, token, user, prisma, headers = {} } = {}) {
  const res = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
  const req = { method: key.split(' ')[0], body, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } };
  return routes[key].handler(req, res, { params, query: {}, user, prisma, log: { error() {} } }).then(() => res);
}
const admin = { id: 'u1', name: 'Anna', email: 'a@x', role: 'ADMIN' };
const newCode = async (t, body = {}) => (await call(t.routes, 'POST v1/admin/pairing-codes', { user: admin, body })).body;
const redeem = (t, code, name) => call(t.routes, 'POST v1/pairing/redeem', { body: { code, name } });

test('Code: einmalig verwendbar, zweite Einlösung = CODE_USED', async () => {
  const t = setup();
  const { code } = await newCode(t);
  expect(code).toMatch(/^\d{8}$/);
  const ok = await redeem(t, `${code.slice(0, 4)} ${code.slice(4)}`, 'Mein PC');
  expect(ok.code).toBe(200);
  expect(ok.body).toMatchObject({ access: 'write', user: { name: 'Anna', role: 'ADMIN' } });
  const again = await redeem(t, code);
  expect(again.code).toBe(401);
  expect(again.body.code).toBe('CODE_USED');
});

test('Code: gültig bis 5 Minuten, danach CODE_EXPIRED; falscher Code CODE_INVALID', async () => {
  const t = setup();
  const { code } = await newCode(t);
  t.clock.t += 5 * 60 * 1000 - 1;
  const { code: c2 } = await newCode(t);
  expect((await redeem(t, c2)).code).toBe(200);
  t.clock.t += 2; // Code 1 jetzt exakt 5 Minuten alt
  const late = await redeem(t, code);
  expect(late.body.code).toBe('CODE_EXPIRED');
  const wrong = await redeem(t, code === '00000000' ? '11111111' : '00000000');
  expect(wrong.body.code).toBe('CODE_INVALID');
  expect((await redeem(t, '12ab')).code).toBe(400);
});

test('Gleichzeitige Einlösung: genau ein Gewinner (Vergleich-und-Tausch)', async () => {
  const t = setup();
  const { code } = await newCode(t);
  const rs = await Promise.all([1, 2, 3, 4].map(() => redeem(t, code)));
  expect(rs.filter((r) => r.code === 200)).toHaveLength(1);
});

test('Codes: höchstens 5 offen; Erzeugung nur mit gültiger Rolle und Eingabe', async () => {
  const t = setup();
  for (let i = 0; i < 5; i++) await newCode(t);
  expect((await call(t.routes, 'POST v1/admin/pairing-codes', { user: admin, body: {} })).body.code).toBe('TOO_MANY_CODES');
  const t2 = setup();
  expect((await call(t2.routes, 'POST v1/admin/pairing-codes', { user: { ...admin, role: 'EDITOR' }, body: {} })).code).toBe(403);
  expect((await call(t2.routes, 'POST v1/admin/pairing-codes', { user: admin, body: { ttlHours: 0 } })).code).toBe(400);
  expect((await call(t2.routes, 'POST v1/admin/pairing-codes', { user: admin, body: { access: 'x' } })).code).toBe(400);
});

test('Token aus Kopplung: Laufzeit, Widerruf wirkt sofort (401), Liste zeigt ihn', async () => {
  const t = setup();
  const { code } = await newCode(t, { ttlHours: 2 });
  const { body: tok } = await redeem(t, code, 'Büro-PC');
  expect(Date.parse(tok.expiresAt) - t.clock.t).toBe(2 * 3600 * 1000);
  expect((await call(t.routes, 'GET v1/capabilities', { token: tok.token })).code).toBe(200);
  const list = (await call(t.routes, 'GET v1/admin/connections', { user: admin })).body;
  expect(list.tokens).toHaveLength(1);
  expect(list.tokens[0]).toMatchObject({ label: 'Büro-PC', access: 'write', via: 'code' });
  expect(JSON.stringify(list)).not.toContain(tok.token);
  expect((await call(t.routes, 'DELETE v1/admin/connections/:id', { user: admin, params: { id: list.tokens[0].id } })).code).toBe(200);
  const after = await call(t.routes, 'GET v1/capabilities', { token: tok.token });
  expect(after.code).toBe(401);
  expect(after.body.code).toBe('TOKEN_REVOKED');
  expect((await call(t.routes, 'DELETE v1/admin/connections/:id', { user: admin, params: { id: 'nix' } })).code).toBe(404);
  // abgelaufen
  const { body: t2 } = await redeem(t, (await newCode(t, { ttlHours: 1 })).code);
  t.clock.t += 3600 * 1000 + 1;
  expect((await call(t.routes, 'GET v1/capabilities', { token: t2.token })).code).toBe(401);
});

test('Nur lesen: GET und Vorschau erlaubt, Schreiben 403 READ_ONLY', async () => {
  const t = setup();
  const { body: tok } = await redeem(t, (await newCode(t, { access: 'read' })).code);
  expect(tok.access).toBe('read');
  expect((await call(t.routes, 'GET v1/templates', { token: tok.token })).code).toBe(200);
  expect((await call(t.routes, 'POST v1/preview', { token: tok.token, body: { code: '<p>x</p>' } })).code).toBe(200);
  for (const [key, body] of [['PUT v1/templates/:name', { code: '<p/>', kind: 'block' }], ['DELETE v1/templates/:name', undefined], ['PUT v1/css/:file', { content: 'a{}' }], ['DELETE v1/css/:file', undefined]]) {
    const r = await call(t.routes, key, { token: tok.token, params: { name: 'A', file: 'designer-a.css' }, body });
    expect([r.code, r.body.code]).toEqual([403, 'READ_ONLY']);
  }
});

test('Passwort-Schalter: abgeschaltet -> Login 403 PASSWORD_LOGIN_DISABLED, info zeigt es, wieder an -> Login geht', async () => {
  const t = setup();
  const prisma = { user: { findFirst: async () => ({ id: 'u1', name: 'Anna', email: 'a@x', password: '$2b$pw', role: 'ADMIN' }) } };
  const login = () => call(t.routes, 'POST v1/auth/login', { body: { username: 'anna', password: 'pw' }, prisma });
  expect((await call(t.routes, 'GET v1/info')).body).toMatchObject({ passwordLogin: true, pairing: true });
  const first = await login();
  expect(first.code).toBe(200);
  expect(first.body.access).toBe('write');
  expect((await call(t.routes, 'PUT v1/admin/password-login', { user: admin, body: { enabled: false } })).body.passwordLogin).toBe(false);
  const off = await login();
  expect([off.code, off.body.code]).toEqual([403, 'PASSWORD_LOGIN_DISABLED']);
  expect((await call(t.routes, 'GET v1/info')).body.passwordLogin).toBe(false);
  // Code-Kopplung geht weiter
  expect((await redeem(t, (await newCode(t)).code)).code).toBe(200);
  expect((await call(t.routes, 'PUT v1/admin/password-login', { user: admin, body: { enabled: true } })).code).toBe(200);
  expect((await login()).code).toBe(200);
  expect((await call(t.routes, 'PUT v1/admin/password-login', { user: admin, body: {} })).code).toBe(400);
});

test('Passwort-Token steht in der Liste und ist widerrufbar', async () => {
  const t = setup();
  const prisma = { user: { findFirst: async () => ({ id: 'u1', name: 'Anna', email: 'a@x', password: '$2b$pw', role: 'ADMIN' }) } };
  const { body: tok } = await call(t.routes, 'POST v1/auth/login', { body: { username: 'anna', password: 'pw' }, prisma });
  const list = (await call(t.routes, 'GET v1/admin/connections', { user: admin })).body;
  expect(list.tokens[0]).toMatchObject({ via: 'password' });
  await call(t.routes, 'DELETE v1/admin/connections/:id', { user: admin, params: { id: list.tokens[0].id } });
  expect((await call(t.routes, 'GET v1/capabilities', { token: tok.token })).code).toBe(401);
});

test('Register: abgelaufene Einträge werden aufgeräumt, das Secret ist nicht Teil des gespeicherten Codes', async () => {
  const state = memoryState();
  const { code } = await createCode(state, { now: 0, secret: 's', by: { sub: 'u', name: 'n', role: 'ADMIN' } });
  expect(await state.get('designer-api_registry')).not.toContain(code);
  await expect(redeemCode(state, { now: 2 * 3600 * 1000, secret: 's', code })).rejects.toMatchObject({ code: 'CODE_INVALID' });
});
