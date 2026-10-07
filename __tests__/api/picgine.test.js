/**
 * __tests__/api/picgine.test.js
 * Picgine-Proxy (unlock, Galerie-Abruf) gegen gemocktes fetch und
 * GET /api/settings ohne Herausgabe von picgine_api_key.
 */

jest.disableAutomock();

const mockPrisma = { setting: { findMany: jest.fn() } };
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn() }));
jest.mock('../../lib/maintenanceStore', () => ({ parseSettingKey: () => null, getAllMaintenanceAsSettings: () => ({}), saveMaintenanceField: jest.fn() }));

const unlock = require('../../pages/api/picgine/unlock').default;
const gallery = require('../../pages/api/picgine/galleries/[slug]').default;
const settings = require('../../pages/api/settings').default;

const SETTINGS = [
  { key: 'picgine_url', value: 'https://pics.example.com/' },
  { key: 'picgine_api_key', value: 'secret-client-key' },
  { key: 'smtp_pass', value: 'smtp-secret' },
  { key: 'matomo_url', value: 'https://m.example.com' },
];

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
let ipCounter = 0;
const req = (extra) => ({ headers: { 'x-forwarded-for': `10.0.0.${++ipCounter}` }, cookies: {}, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.setting.findMany.mockResolvedValue(SETTINGS);
  global.fetch = jest.fn();
});

describe('POST /api/picgine/unlock', () => {
  test('forwards credentials + old token with Bearer key and sets the cookie', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { token: 'new.token' }));
    const res = makeRes();
    await unlock(req({ method: 'POST', body: { slug: 'privat', email: 'a@b.de', password: 'pw' }, cookies: { temgine_picgine: 'old.token' } }), res);

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://pics.example.com/api/v1/access/unlock');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer secret-client-key');
    expect(JSON.parse(opts.body)).toEqual({ slug: 'privat', password: 'pw', email: 'a@b.de', token: 'old.token' });

    expect(res.status).toHaveBeenCalledWith(200);
    const cookie = res.setHeader.mock.calls.find(([h]) => h === 'Set-Cookie')[1];
    expect(cookie).toMatch(/^temgine_picgine=new\.token; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/);
  });

  test('passes a wrong password through as 401 with a German error and no cookie', async () => {
    global.fetch.mockResolvedValue(jsonResponse(401, { error: 'invalid' }));
    const res = makeRes();
    await unlock(req({ method: 'POST', body: { slug: 'privat', password: 'falsch' } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Falsches Passwort.' });
    expect(res.setHeader).not.toHaveBeenCalledWith('Set-Cookie', expect.anything());
  });

  test('maps other Picgine errors and unreachable server', async () => {
    global.fetch.mockResolvedValue(jsonResponse(404, {}));
    let res = makeRes();
    await unlock(req({ method: 'POST', body: { slug: 'weg', password: 'pw' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Galerie nicht gefunden' });

    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));
    res = makeRes();
    await unlock(req({ method: 'POST', body: { slug: 'x', password: 'pw' } }), res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: 'Picgine ist nicht erreichbar' });
  });

  test('rejects invalid slugs without calling Picgine', async () => {
    const res = makeRes();
    await unlock(req({ method: 'POST', body: { slug: '../admin', password: 'pw' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('is rate-limited per IP', async () => {
    global.fetch.mockResolvedValue(jsonResponse(401, {}));
    const headers = { 'x-forwarded-for': '10.9.9.9' };
    let res;
    for (let i = 0; i < 11; i++) {
      res = makeRes();
      await unlock({ method: 'POST', headers, cookies: {}, body: { slug: 'privat', password: 'x' } }, res);
    }
    expect(res.status).toHaveBeenCalledWith(429);
  });
});

describe('GET /api/picgine/galleries/[slug]', () => {
  test('forwards the cookie token as X-Picgine-Access and disables caching', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { slug: 'privat', locked: false }));
    const res = makeRes();
    await gallery(req({ method: 'GET', query: { slug: 'privat' }, cookies: { temgine_picgine: 'tok.en' } }), res);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://pics.example.com/api/v1/galleries/privat');
    expect(opts.headers['X-Picgine-Access']).toBe('tok.en');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.json).toHaveBeenCalledWith({ slug: 'privat', locked: false });
  });

  test('returns 503 when Picgine is not configured', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([]);
    const res = makeRes();
    await gallery(req({ method: 'GET', query: { slug: 'x' } }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Picgine ist nicht konfiguriert' });
  });
});

describe('GET /api/settings', () => {
  test('never returns picgine_api_key (or smtp_pass), only a "set" flag', async () => {
    const res = makeRes();
    await settings({ method: 'GET' }, res);
    const body = res.json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('secret-client-key');
    expect(JSON.stringify(body)).not.toContain('smtp-secret');
    expect(body.picgine_api_key).toBeUndefined();
    expect(body.picgine_api_key_set).toBe(true);
    expect(body.smtp_pass_set).toBe(true);
    expect(body.picgine_url).toBe('https://pics.example.com/');
  });
});
