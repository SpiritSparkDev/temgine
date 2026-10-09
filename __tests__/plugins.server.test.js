/**
 * @jest-environment node
 *
 * Plugin-System P1, Server-Seite: Manifest-Loader, Registry, API-Catch-all, Settings,
 * CSP und Hilfe — nachgewiesen mit dem Test-Plugin __tests__/fixtures/plugins/echo.
 */
jest.disableAutomock();

const mockStore = {};
const mockPrisma = {
  setting: {
    findMany: jest.fn(async ({ where } = {}) => Object.entries(mockStore)
      .filter(([key]) => !where || where.key.in.includes(key))
      .map(([key, value]) => ({ key, value }))),
    upsert: jest.fn(async ({ create }) => { mockStore[create.key] = create.value; return create; }),
  },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
const mockRequireAuth = jest.fn();
jest.mock('../lib/auth', () => ({
  requireAuth: (...args) => mockRequireAuth(...args),
  PERMISSIONS: { PAGES_EDIT: ['ADMIN', 'MODERATOR', 'EDITOR'], SETTINGS_VIEW: ['ADMIN'], SETTINGS_EDIT: ['ADMIN'] },
}));
const mockRebuild = jest.fn();
jest.mock('../lib/liveRebuild', () => ({ rebuildLiveSnapshot: (...a) => mockRebuild(...a) }));
jest.mock('../lib/maintenanceStore', () => ({
  ...jest.requireActual('../lib/maintenanceStore'),
  getAllMaintenanceAsSettings: () => ({}),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { validateManifest, loadManifests } = require('../lib/plugins/manifest');
const registry = require('../lib/plugins/registry');
const { pluginCspRules, applyRules } = require('../lib/pluginCsp');
const { listHelpDocs, readHelpDoc } = require('../lib/helpDocs');
const pluginApi = require('../pages/api/plugins/[plugin]/[...path]').default;
const pluginIndex = require('../pages/api/plugins/index').default;
const settingsApi = require('../pages/api/settings').default;
const echoServer = require('./fixtures/plugins/echo/server').default;

const FIXTURES = path.join(__dirname, 'fixtures/plugins');
const silent = { error: jest.fn(), warn: jest.fn() };

function makeRes() {
  const res = { headers: {} };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  res.setHeader = jest.fn((k, v) => { res.headers[k.toLowerCase()] = v; });
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  return res;
}

async function call(method, plugin, segments, { body, query = {}, cookies = {}, ip = '10.0.0.1' } = {}) {
  const raw = body === undefined ? [] : [Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
  const req = Object.assign(Readable.from(raw), {
    method,
    query: { ...query, plugin, path: segments },
    headers: { 'x-forwarded-for': ip },
    cookies,
  });
  const res = makeRes();
  await pluginApi(req, res);
  return res;
}

const enableEcho = () => { mockStore.plugin_echo_enabled = 'true'; };

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ authorized: false, status: 401, error: 'Nicht eingeloggt' });
  registry._setPluginSource({ dir: FIXTURES, server: { echo: echoServer } });
});

describe('manifest', () => {
  const base = { id: 'x', name: 'X', version: '1.0.0', temgineApi: 1 };
  const errorsOf = (m) => validateManifest({ ...base, ...m }, 'x').errors;
  const warningsOf = (m) => validateManifest({ ...base, ...m }, 'x').warnings;

  test('the echo fixture is valid', () => {
    const [echo] = loadManifests(FIXTURES, silent);
    expect(echo).toMatchObject({ id: 'echo', temgineApi: 1, sections: ['echo'] });
    expect(echo.csp).toHaveLength(2);
    expect(silent.error).not.toHaveBeenCalled();
  });

  test('rejects bad id, unknown temgineApi, bad setting types/prefixes and reserved prefixes', () => {
    expect(validateManifest({ ...base, id: 'X_y' }, 'X_y').errors).not.toEqual([]);
    expect(validateManifest(base, 'other').errors[0]).toMatch(/Ordner/);
    expect(errorsOf({ temgineApi: 2 })).not.toEqual([]);
    expect(errorsOf({ settings: { x_a: { type: 'password' } } })).not.toEqual([]);
    expect(errorsOf({ settings: { smtp_pass: { type: 'secret' } } })).not.toEqual([]);
    expect(errorsOf({ sections: ['each'] })).not.toEqual([]);
    expect(errorsOf({ settings: { x_a: { type: 'secret' } }, sections: ['x'] })).toEqual([]);
  });

  test('drops CSP rules with bad directive, wildcard or unsafe origin, unknown setting', () => {
    const rules = [
      { directive: 'default-src', origin: 'https://a.example' },
      { directive: 'img-src', origin: 'https://*.example' },
      { directive: 'script-src', origin: "'unsafe-inline'" },
      { directive: 'img-src', origin: 'https://a.example/path' },
      { directive: 'img-src', originFromSetting: 'x_missing' },
      { directive: 'img-src', origin: 'https://ok.example:8443' },
    ];
    const { errors, warnings, csp } = validateManifest({ ...base, csp: rules }, 'x');
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(5);
    expect(csp).toEqual([{ directive: 'img-src', origin: 'https://ok.example:8443' }]);
    expect(warningsOf({ csp: [{ directive: 'img-src', origin: 'https://a.example', originFromSetting: 'x_a' }] })).toHaveLength(1);
  });

  test('loadManifests skips invalid plugins and duplicate section prefixes, site keeps running', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'temgine-plugins-'));
    const write = (id, m) => { fs.mkdirSync(path.join(dir, id)); fs.writeFileSync(path.join(dir, id, 'plugin.json'), typeof m === 'string' ? m : JSON.stringify(m)); };
    write('a', { ...base, id: 'a', sections: ['gal'] });
    write('b', { ...base, id: 'b', sections: ['gal'] });
    write('c', '{ kaputt');
    write('d', { ...base, id: 'd', temgineApi: 99 });
    const log = { error: jest.fn(), warn: jest.fn() };
    expect(loadManifests(dir, log).map((m) => m.id)).toEqual(['a']);
    expect(log.error).toHaveBeenCalledTimes(3);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(loadManifests(path.join(dir, 'gibt-es-nicht'), log)).toEqual([]);
  });
});

describe('registry', () => {
  test('plugins are off by default and active with plugin_<id>_enabled = "true"', async () => {
    expect(registry.getPlugins().map((p) => p.id)).toEqual(['echo']);
    expect(registry.getPlugin('echo').server).toBe(echoServer);
    expect(await registry.getActivePlugins()).toEqual([]);
    mockStore.plugin_echo_enabled = 'false';
    expect(await registry.getActivePlugins()).toEqual([]);
    enableEcho();
    expect((await registry.getActivePlugins()).map((p) => p.id)).toEqual(['echo']);
  });

  test('without plugins nothing is queried', async () => {
    registry._setPluginSource({ dir: path.join(FIXTURES, 'gibt-es-nicht') });
    expect(await registry.getActivePlugins()).toEqual([]);
    expect(mockPrisma.setting.findMany).not.toHaveBeenCalled();
  });
});

describe('API catch-all /api/plugins/<id>/<path>', () => {
  test('disabled or unknown plugin → 404', async () => {
    expect((await call('GET', 'echo', ['hello', 'a'])).statusCode).toBe(404);
    enableEcho();
    expect((await call('GET', 'nope', ['hello', 'a'])).statusCode).toBe(404);
  });

  test('routes with :params, query and ctx.settings incl. secrets', async () => {
    enableEcho();
    Object.assign(mockStore, { echo_greeting: 'Hallo', echo_token: 'geheim' });
    const res = await call('GET', 'echo', ['hello', 'welt'], { query: { q: '1' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ greeting: 'Hallo', name: 'welt', query: { q: '1' }, ip: '10.0.0.1' });
  });

  test('unknown route → 404, wrong method → 405 with Allow', async () => {
    enableEcho();
    expect((await call('GET', 'echo', ['nothing'])).statusCode).toBe(404);
    const res = await call('GET', 'echo', ['echo']);
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('POST');
  });

  test('auth is checked before the handler (PERMISSIONS name and role array)', async () => {
    enableEcho();
    expect((await call('POST', 'echo', ['echo'], { body: { a: 1 } })).statusCode).toBe(401);
    expect(mockRequireAuth).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), ['ADMIN', 'MODERATOR', 'EDITOR']);

    mockRequireAuth.mockResolvedValue({ authorized: true, user: { email: 'a@b.de', role: 'EDITOR' } });
    const res = await call('POST', 'echo', ['echo'], { body: { a: 1 } });
    expect(res.body).toEqual({ body: { a: 1 }, user: 'a@b.de' });

    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await call('POST', 'echo', ['rebuild']);
    expect(log).toHaveBeenCalledWith('[plugin:echo]', 'Snapshot-Neubau angefordert');
    log.mockRestore();
    expect(mockRequireAuth).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), ['ADMIN']);
    expect(mockRebuild).toHaveBeenCalledTimes(1);
  });

  test('public routes do not touch auth', async () => {
    enableEcho();
    await call('GET', 'echo', ['hello', 'x']);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  test('rawBody → Buffer; JSON > 1 MB → 413; invalid JSON → 400', async () => {
    enableEcho();
    const raw = await call('POST', 'echo', ['webhook'], { body: Buffer.from('{"sig":1}') });
    expect(raw.body).toEqual({ isBuffer: true, text: '{"sig":1}' });

    mockRequireAuth.mockResolvedValue({ authorized: true, user: { email: 'a@b.de' } });
    expect((await call('POST', 'echo', ['echo'], { body: 'x'.repeat(1024 * 1024 + 1) })).statusCode).toBe(413);
    expect((await call('POST', 'echo', ['echo'], { body: '{kaputt' })).statusCode).toBe(400);
  });

  test('rateLimit per plugin + route + IP → 429', async () => {
    enableEcho();
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await call('POST', 'echo', ['limited'], { ip: '10.9.9.9' })).statusCode);
    expect(codes).toEqual([200, 200, 429]);
    expect((await call('POST', 'echo', ['limited'], { ip: '10.9.9.8' })).statusCode).toBe(200);
  });

  test('cookies are forced into the temgine_<id>_ namespace', async () => {
    enableEcho();
    const res = await call('GET', 'echo', ['cookie'], { cookies: { temgine_echo_seen: 'ja', seen: 'fremd' } });
    expect(res.body).toEqual({ seen: 'ja' });
    expect(res.headers['set-cookie']).toEqual([expect.stringMatching(/^temgine_echo_seen=1; Path=\/; SameSite=Lax; HttpOnly; Max-Age=60/)]);
  });

  test('POST __test runs the test hook, admin only', async () => {
    enableEcho();
    mockStore.echo_token = 'geheim';
    expect((await call('POST', 'echo', ['__test'])).statusCode).toBe(401);
    expect(mockRequireAuth).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), ['ADMIN']);
    mockRequireAuth.mockResolvedValue({ authorized: true, user: { email: 'a@b.de' } });
    const res = await call('POST', 'echo', ['__test']);
    expect(res.body).toEqual({ ok: true, message: 'Echo erreichbar' });
    expect((await call('GET', 'echo', ['__test'])).statusCode).toBe(405);
  });
});

describe('GET /api/plugins', () => {
  test('public: only active plugins, never secrets', async () => {
    Object.assign(mockStore, { echo_greeting: 'Hallo', echo_token: 'geheim' });
    let res = makeRes();
    await pluginIndex({ method: 'GET', query: {} }, res);
    expect(res.body).toEqual({ plugins: {} });

    enableEcho();
    res = makeRes();
    await pluginIndex({ method: 'GET', query: {} }, res);
    expect(res.body).toEqual({ plugins: { echo: { echo_greeting: 'Hallo' } } });
  });

  test('all=1 needs SETTINGS_VIEW and lists every built-in plugin', async () => {
    let res = makeRes();
    await pluginIndex({ method: 'GET', query: { all: '1' } }, res);
    expect(res.statusCode).toBe(401);
    mockRequireAuth.mockResolvedValue({ authorized: true, user: {} });
    res = makeRes();
    await pluginIndex({ method: 'GET', query: { all: '1' } }, res);
    expect(res.body).toEqual([expect.objectContaining({ id: 'echo', enabled: false, hasTest: true, version: '1.0.0' })]);
  });
});

describe('/api/settings with plugin manifests', () => {
  const put = async (key, value = 'x') => {
    const res = makeRes();
    mockRequireAuth.mockResolvedValue({ authorized: true });
    await settingsApi({ method: 'PUT', body: { key, value } }, res);
    return res;
  };

  test('GET masks manifest secrets', async () => {
    Object.assign(mockStore, { echo_token: 'geheim', echo_greeting: 'Hallo' });
    const res = makeRes();
    await settingsApi({ method: 'GET' }, res);
    expect(res.body).toMatchObject({ echo_token_set: true, echo_greeting: 'Hallo' });
    expect(res.body).not.toHaveProperty('echo_token');
  });

  test('PUT accepts manifest keys and plugin_<id>_enabled, rejects unknown keys with 400', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await put('echo_greeting')).statusCode).toBe(200);
    expect((await put('plugin_echo_enabled', 'true')).statusCode).toBe(200);
    expect((await put('echo_token', 'neu')).body).toEqual({ key: 'echo_token', set: true });
    expect((await put('plugin_nope_enabled', 'true')).statusCode).toBe(400);
    expect((await put('echo_unknown')).statusCode).toBe(400);
    warn.mockRestore();
  });
});

describe('CSP', () => {
  const manifests = loadManifests(FIXTURES, silent);
  const csp = "default-src 'self'; img-src 'self' https:; connect-src 'self'";

  test('no additions while the plugin is disabled', () => {
    expect(pluginCspRules(manifests, { echo_url: 'https://img.example/x' })).toEqual([]);
  });

  test('active plugin: fixed origin + origin from setting', () => {
    const rules = pluginCspRules(manifests, { plugin_echo_enabled: 'true', echo_url: 'https://img.example:8080/x' });
    expect(rules).toEqual([
      { directive: 'img-src', origin: 'https://img.example:8080' },
      { directive: 'connect-src', origin: 'https://echo.example' },
    ]);
    const out = applyRules(csp, rules);
    expect(out).toContain("img-src 'self' https: https://img.example:8080");
    expect(out).toContain("connect-src 'self' https://echo.example");
  });

  test('invalid setting values never reach the CSP', () => {
    for (const echo_url of ['javascript:alert(1)', 'https://*.example', '']) {
      expect(pluginCspRules(manifests, { plugin_echo_enabled: 'true', echo_url })).toEqual([{ directive: 'connect-src', origin: 'https://echo.example' }]);
    }
  });
});

describe('help', () => {
  test('plugin help only for active plugins, after the core docs', async () => {
    expect(listHelpDocs([]).map((d) => d.name)).not.toContain('echo');
    expect(readHelpDoc('echo', [])).toBeNull();
    const active = registry.getPlugins();
    const docs = listHelpDocs(active);
    expect(docs[docs.length - 1]).toEqual({ name: 'echo', title: 'Echo-Plugin' });
    expect(readHelpDoc('echo', active)).toContain('Test-Hilfe');
    expect(readHelpDoc('templates', active)).toContain('## Checkbox');
  });
});
