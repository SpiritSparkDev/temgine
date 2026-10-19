/**
 * Picgine-Proxy (unlock, Galerie-Abruf, Reset, Webhook, Verbindungstest) über die echte
 * Plugin-Catch-all-Route /api/plugins/picgine/* gegen gemocktes fetch, dazu Settings-Maskierung,
 * CSP-Regel und der Rewrite für alte URLs. Läuft in Temgines Jest (nach `npm run plugins:sync`).
 */
jest.disableAutomock();

const mockPrisma = { setting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() } };
jest.mock('../../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../../lib/auth', () => ({
  requireAuth: jest.fn(),
  PERMISSIONS: { PAGES_EDIT: ['ADMIN', 'MODERATOR', 'EDITOR'], SETTINGS_EDIT: ['ADMIN'] },
}));
jest.mock('../../../lib/liveRebuild', () => ({ rebuildLiveSnapshot: jest.fn() }));
jest.mock('../../../lib/maintenanceStore', () => ({ parseSettingKey: () => null, getAllMaintenanceAsSettings: () => ({}), saveMaintenanceField: jest.fn() }));

const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { requireAuth } = require('../../../lib/auth');
const { rebuildLiveSnapshot } = require('../../../lib/liveRebuild');
const { _setPluginSource, getPlugin } = require('../../../lib/plugins/registry');
const { pluginCspRules } = require('../../../lib/pluginCsp');
const catchAll = require('../../../pages/api/plugins/[plugin]/[...path]').default;
const settingsHandler = require('../../../pages/api/settings').default;
const server = require('../server').default;

const SETTINGS = [
  { key: 'plugin_picgine_enabled', value: 'true' },
  { key: 'picgine_url', value: 'https://pics.example.com/' },
  { key: 'picgine_api_key', value: 'secret-client-key' },
  { key: 'smtp_pass', value: 'smtp-secret' },
];

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let ipCounter = 0;

function makeRes() {
  const headers = {};
  const res = { headers };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn((k, v) => { headers[k] = v; return res; });
  res.getHeader = (k) => headers[k];
  return res;
}

// Ruft die Catch-all-Route wie Next auf: Body als Stream, Query mit plugin/path.
async function call(method, segments, { body, raw, cookies = {}, query = {}, headers = {}, ip } = {}) {
  const payload = raw !== undefined ? Buffer.from(raw) : body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const req = Object.assign(Readable.from(payload.length ? [payload] : []), {
    method,
    headers: { 'x-forwarded-for': ip || `10.0.0.${++ipCounter}`, ...headers },
    cookies,
    query: { plugin: 'picgine', path: segments, ...query },
  });
  const res = makeRes();
  await catchAll(req, res);
  return res;
}

beforeAll(() => _setPluginSource({ dir: path.join(__dirname, '..', '..'), server: { picgine: server } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.setting.findMany.mockImplementation(async ({ where } = {}) => SETTINGS.filter((r) => !where?.key?.in || where.key.in.includes(r.key)));
  requireAuth.mockResolvedValue({ authorized: true, user: { role: 'ADMIN' } });
  global.fetch = jest.fn();
});

describe('POST /api/plugins/picgine/unlock', () => {
  test('forwards credentials + old token with Bearer key and sets the temgine_picgine cookie', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { token: 'new.token' }));
    const res = await call('POST', ['unlock'], { body: { slug: 'privat', email: 'a@b.de', password: 'pw' }, cookies: { temgine_picgine: 'old.token' }, ip: '10.7.7.7' });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://pics.example.com/api/v1/access/unlock');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer secret-client-key');
    expect(opts.headers['X-Forwarded-For']).toBe('10.7.7.7');
    expect(JSON.parse(opts.body)).toEqual({ slug: 'privat', password: 'pw', email: 'a@b.de', token: 'old.token' });

    expect(res.status).toHaveBeenCalledWith(200);
    const cookies = res.headers['Set-Cookie'];
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^temgine_picgine=new\.token; Path=\/; SameSite=Lax; HttpOnly; Max-Age=2592000/);
  });

  test('passes a wrong password through as 401 with a German error and no cookie', async () => {
    global.fetch.mockResolvedValue(jsonResponse(401, { error: 'invalid' }));
    const res = await call('POST', ['unlock'], { body: { slug: 'privat', password: 'falsch' } });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Falsches Passwort.' });
    expect(res.headers['Set-Cookie']).toBeUndefined();

    const withEmail = await call('POST', ['unlock'], { body: { slug: 'privat', email: 'a@b.de', password: 'falsch' } });
    expect(withEmail.json).toHaveBeenCalledWith({ error: 'E-Mail oder Passwort falsch.' });
  });

  test('maps other Picgine errors and unreachable server', async () => {
    global.fetch.mockResolvedValue(jsonResponse(404, {}));
    let res = await call('POST', ['unlock'], { body: { slug: 'weg', password: 'pw' } });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Galerie nicht gefunden' });

    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));
    res = await call('POST', ['unlock'], { body: { slug: 'x', password: 'pw' } });
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: 'Picgine ist nicht erreichbar' });
  });

  test('rejects invalid slugs without calling Picgine', async () => {
    const res = await call('POST', ['unlock'], { body: { slug: '../admin', password: 'pw' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('is rate-limited per IP (10 per 15 minutes)', async () => {
    global.fetch.mockResolvedValue(jsonResponse(401, {}));
    let res;
    for (let i = 0; i < 11; i++) res = await call('POST', ['unlock'], { body: { slug: 'privat', password: 'x' }, ip: '10.9.9.9' });
    expect(res.status).toHaveBeenCalledWith(429);
  });

  test('wrong method gets 405 from the core', async () => {
    const res = await call('GET', ['unlock']);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

describe('POST /api/plugins/picgine/logout', () => {
  test('without a token only clears the cookie', async () => {
    const res = await call('POST', ['logout'], { body: {} });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.headers['Set-Cookie'][0]).toMatch(/^temgine_picgine=; Path=\/; SameSite=Lax; HttpOnly; Max-Age=0/);
  });

  test('swaps the token for the login-less one Picgine returns', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { token: 'open.token' }));
    const res = await call('POST', ['logout'], { body: {}, cookies: { temgine_picgine: 'user.token' } });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ token: 'user.token' });
    expect(res.headers['Set-Cookie'][0]).toMatch(/^temgine_picgine=open\.token;/);
  });
});

describe('GET /api/plugins/picgine/galleries/:slug', () => {
  test('forwards the cookie token as X-Picgine-Access and disables caching', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { slug: 'privat', locked: false }));
    const res = await call('GET', ['galleries', 'privat'], { cookies: { temgine_picgine: 'tok.en' } });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://pics.example.com/api/v1/galleries/privat');
    expect(opts.headers['X-Picgine-Access']).toBe('tok.en');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.json).toHaveBeenCalledWith({ slug: 'privat', locked: false });
  });

  test('returns 503 when Picgine is not configured', async () => {
    mockPrisma.setting.findMany.mockImplementation(async () => [{ key: 'plugin_picgine_enabled', value: 'true' }]);
    const res = await call('GET', ['galleries', 'x']);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Picgine ist nicht konfiguriert' });
  });

  test('forwards a valid within param, rejects an invalid one, passes Picgine 404 through', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { slug: 'kirche' }));
    await call('GET', ['galleries', 'kirche'], { query: { within: 'hochzeit' } });
    expect(global.fetch.mock.calls[0][0]).toBe('https://pics.example.com/api/v1/galleries/kirche?within=hochzeit');

    global.fetch.mockClear();
    let res = await call('GET', ['galleries', 'kirche'], { query: { within: '../x' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(global.fetch).not.toHaveBeenCalled();

    global.fetch.mockResolvedValue(jsonResponse(404, {}));
    res = await call('GET', ['galleries', 'fremd'], { query: { within: 'hochzeit' } });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('GET /api/plugins/picgine/galleries', () => {
  test('needs an editor session', async () => {
    requireAuth.mockResolvedValue({ authorized: false, status: 401, error: 'Nicht angemeldet' });
    const res = await call('GET', ['galleries']);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(requireAuth.mock.calls[0][2]).toEqual(['ADMIN', 'MODERATOR', 'EDITOR']);
  });

  test('lists the galleries for the editor field', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, [{ slug: 'a' }]));
    const res = await call('GET', ['galleries']);
    expect(res.json).toHaveBeenCalledWith([{ slug: 'a' }]);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
});

describe('POST /api/plugins/picgine/reset-request', () => {
  test('forwards email + client IP and answers with the neutral message', async () => {
    global.fetch.mockResolvedValue(jsonResponse(202, { ok: true }));
    const res = await call('POST', ['reset-request'], { body: { email: 'a@b.de' }, ip: '10.1.2.3' });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://pics.example.com/api/v1/access/reset-request');
    expect(JSON.parse(opts.body)).toEqual({ email: 'a@b.de' });
    expect(opts.headers['X-Forwarded-For']).toBe('10.1.2.3');
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ ok: true, message: 'Falls ein Konto existiert, wurde eine E-Mail verschickt.' });
  });

  test('passes 429 through, maps network errors to 502, rejects bad email', async () => {
    global.fetch.mockResolvedValue(jsonResponse(429, {}));
    let res = await call('POST', ['reset-request'], { body: { email: 'a@b.de' } });
    expect(res.status).toHaveBeenCalledWith(429);

    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));
    res = await call('POST', ['reset-request'], { body: { email: 'a@b.de' } });
    expect(res.status).toHaveBeenCalledWith(502);

    res = await call('POST', ['reset-request'], { body: { email: 'kein-mail' } });
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/plugins/picgine/webhook', () => {
  const body = JSON.stringify({ event: 'galleries.changed', at: '2026-10-09T10:00:00Z' });
  const sign = (raw, apiKey = 'secret-client-key') => {
    const key = crypto.createHash('sha256').update(apiKey).digest('hex');
    return 'sha256=' + crypto.createHmac('sha256', key).update(raw).digest('hex');
  };
  const hook = (raw, signature) => call('POST', ['webhook'], { raw, headers: signature ? { 'x-picgine-signature': signature } : {} });

  test('accepts a valid signature with 202 and triggers the snapshot rebuild', async () => {
    const res = await hook(body, sign(body));
    expect(res.status).toHaveBeenCalledWith(202);
    expect(rebuildLiveSnapshot).toHaveBeenCalledTimes(1);
  });

  test('rejects tampered body, missing signature and missing key with 401', async () => {
    let res = await hook(body.replace('10:00', '11:00'), sign(body));
    expect(res.status).toHaveBeenCalledWith(401);
    res = await hook(body);
    expect(res.status).toHaveBeenCalledWith(401);
    mockPrisma.setting.findMany.mockImplementation(async () => [{ key: 'plugin_picgine_enabled', value: 'true' }, { key: 'picgine_url', value: 'https://pics.example.com' }]);
    res = await hook(body, sign(body, ''));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(rebuildLiveSnapshot).not.toHaveBeenCalled();
  });
});

describe('plugin activation', () => {
  test('a disabled plugin answers 404 on all routes', async () => {
    mockPrisma.setting.findMany.mockImplementation(async () => SETTINGS.filter((r) => r.key !== 'plugin_picgine_enabled'));
    const res = await call('GET', ['galleries', 'x']);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('Verbindungstest (__test)', () => {
  test('uses the form values when given, else the stored ones', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, [{ slug: 'a' }, { slug: 'b' }]));
    let res = await call('POST', ['__test'], { body: { picgine_url: 'https://neu.example.com/', picgine_api_key: 'neuer-key' } });
    expect(global.fetch.mock.calls[0][0]).toBe('https://neu.example.com/api/v1/galleries');
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer neuer-key');
    expect(res.json).toHaveBeenCalledWith({ ok: true, message: 'Verbunden — 2 Galerie(n) gefunden' });

    global.fetch.mockClear();
    res = await call('POST', ['__test'], { body: {} });
    expect(global.fetch.mock.calls[0][0]).toBe('https://pics.example.com/api/v1/galleries');
  });

  test('reports a failing connection as ok:false', async () => {
    global.fetch.mockResolvedValue(jsonResponse(401, {}));
    const res = await call('POST', ['__test'], { body: {} });
    expect(res.json).toHaveBeenCalledWith({ ok: false, message: 'Picgine hat den Zugriff abgelehnt' });
  });
});

describe('loadServer (Live-Snapshot)', () => {
  test('loads public galleries without viewer token and skips invalid slugs and failures', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch.mockImplementation(async (url) => (url.endsWith('/hochzeit') ? jsonResponse(200, { slug: 'hochzeit' }) : jsonResponse(500, {})));
    const settings = { picgine_url: 'https://pics.example.com', picgine_api_key: 'k' };
    const out = await server.sections.picgine.loadServer(['hochzeit', 'kaputt', '../x'], { settings });
    expect(out).toEqual({ hochzeit: { slug: 'hochzeit' } });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][1].headers['X-Picgine-Access']).toBeUndefined();
  });
});

describe('Kern-Anbindung', () => {
  test('GET /api/settings never returns picgine_api_key (or smtp_pass), only a "set" flag', async () => {
    const res = makeRes();
    await settingsHandler({ method: 'GET' }, res);
    const out = res.json.mock.calls[0][0];
    expect(JSON.stringify(out)).not.toContain('secret-client-key');
    expect(JSON.stringify(out)).not.toContain('smtp-secret');
    expect(out.picgine_api_key).toBeUndefined();
    expect(out.picgine_api_key_set).toBe(true);
    expect(out.picgine_url).toBe('https://pics.example.com/');
  });

  test('PUT /api/settings accepts the plugin keys from the manifest', async () => {
    mockPrisma.setting.upsert.mockResolvedValue({});
    for (const key of ['picgine_url', 'picgine_api_key', 'plugin_picgine_enabled']) {
      const res = makeRes();
      await settingsHandler({ method: 'PUT', body: { key, value: 'x' } }, res);
      expect([key, res.status.mock.calls[0]?.[0]]).not.toEqual([key, 400]);
    }
  });

  test('CSP: img-src gets the Picgine origin only while the plugin is enabled', () => {
    const manifest = getPlugin('picgine');
    expect(pluginCspRules([manifest], { plugin_picgine_enabled: 'true', picgine_url: 'https://pics.example.com/pfad' }))
      .toEqual([{ directive: 'img-src', origin: 'https://pics.example.com' }]);
    expect(pluginCspRules([manifest], { picgine_url: 'https://pics.example.com' })).toEqual([]);
  });

  test('the old /api/picgine/* URLs (webhooks in Picgine, templates) are rewritten to the plugin routes', async () => {
    const config = require('../../../next.config.js');
    const rules = (await config.rewrites()).afterFiles;
    expect(rules).toContainEqual({ source: '/api/picgine/:path*', destination: '/api/plugins/picgine/:path*' });
  });
});
