/**
 * __tests__/api/picgine.test.js
 * Picgine-Proxy (unlock, Galerie-Abruf) gegen gemocktes fetch und
 * GET /api/settings ohne Herausgabe von picgine_api_key.
 */

jest.disableAutomock();

const mockPrisma = { setting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() } };
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn() }));
jest.mock('../../lib/liveSnapshot', () => ({ renderLiveSnapshot: jest.fn() }));
jest.mock('../../lib/maintenanceStore', () => ({ parseSettingKey: () => null, getAllMaintenanceAsSettings: () => ({}), saveMaintenanceField: jest.fn() }));

const unlock = require('../../pages/api/picgine/unlock').default;
const gallery = require('../../pages/api/picgine/galleries/[slug]').default;
const settings = require('../../pages/api/settings').default;
const resetRequest = require('../../pages/api/picgine/reset-request').default;
const webhookModule = require('../../pages/api/picgine/webhook');
const { renderLiveSnapshot } = require('../../lib/liveSnapshot');
const crypto = require('crypto');
const { Readable } = require('stream');

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

describe('GET /api/picgine/galleries/[slug]?within=', () => {
  test('forwards a valid within param to Picgine', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { slug: 'kirche' }));
    const res = makeRes();
    await gallery(req({ method: 'GET', query: { slug: 'kirche', within: 'hochzeit' } }), res);
    expect(global.fetch.mock.calls[0][0]).toBe('https://pics.example.com/api/v1/galleries/kirche?within=hochzeit');
  });

  test('rejects an invalid within param, passes Picgine 404 through', async () => {
    let res = makeRes();
    await gallery(req({ method: 'GET', query: { slug: 'kirche', within: '../x' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(global.fetch).not.toHaveBeenCalled();

    global.fetch.mockResolvedValue(jsonResponse(404, {}));
    res = makeRes();
    await gallery(req({ method: 'GET', query: { slug: 'fremd', within: 'hochzeit' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('POST /api/picgine/reset-request', () => {
  test('forwards email + client IP and answers with the neutral message', async () => {
    global.fetch.mockResolvedValue(jsonResponse(202, { ok: true }));
    const res = makeRes();
    await resetRequest({ method: 'POST', headers: { 'x-forwarded-for': '10.1.2.3' }, body: { email: 'a@b.de' } }, res);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://pics.example.com/api/v1/access/reset-request');
    expect(JSON.parse(opts.body)).toEqual({ email: 'a@b.de' });
    expect(opts.headers['X-Forwarded-For']).toBe('10.1.2.3');
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ ok: true, message: 'Falls ein Konto existiert, wurde eine E-Mail verschickt.' });
  });

  test('passes 429 through, maps network errors to 502, rejects bad email', async () => {
    global.fetch.mockResolvedValue(jsonResponse(429, {}));
    let res = makeRes();
    await resetRequest(req({ method: 'POST', body: { email: 'a@b.de' } }), res);
    expect(res.status).toHaveBeenCalledWith(429);

    global.fetch.mockRejectedValue(new Error('ECONNREFUSED'));
    res = makeRes();
    await resetRequest(req({ method: 'POST', body: { email: 'a@b.de' } }), res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: 'Picgine ist nicht erreichbar' });

    res = makeRes();
    await resetRequest(req({ method: 'POST', body: { email: 'kein-mail' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/picgine/webhook', () => {
  const body = JSON.stringify({ event: 'galleries.changed', at: '2026-10-09T10:00:00Z' });
  const sign = (raw, apiKey = 'secret-client-key') => {
    const key = crypto.createHash('sha256').update(apiKey).digest('hex');
    return 'sha256=' + crypto.createHmac('sha256', key).update(raw).digest('hex');
  };
  const hookReq = (raw, signature) => Object.assign(Readable.from([Buffer.from(raw)]), {
    method: 'POST', headers: signature ? { 'x-picgine-signature': signature } : {},
  });

  test('disables the Next body parser', () => {
    expect(webhookModule.config.api.bodyParser).toBe(false);
  });

  test('accepts a valid signature with 202', async () => {
    jest.useFakeTimers();
    try {
      const res = makeRes();
      await webhookModule.default(hookReq(body, sign(body)), res);
      expect(res.status).toHaveBeenCalledWith(202);
      mockPrisma.setting.findUnique.mockResolvedValue(null);
      await jest.runOnlyPendingTimersAsync(); // geplanten Rebuild abräumen (dynamischer Modus)
    } finally {
      jest.useRealTimers();
    }
  });

  test('rejects tampered body, missing signature and missing key with 401', async () => {
    let res = makeRes();
    await webhookModule.default(hookReq(body.replace('10:00', '11:00'), sign(body)), res);
    expect(res.status).toHaveBeenCalledWith(401);

    res = makeRes();
    await webhookModule.default(hookReq(body), res);
    expect(res.status).toHaveBeenCalledWith(401);

    mockPrisma.setting.findMany.mockResolvedValue([{ key: 'picgine_url', value: 'https://pics.example.com' }]);
    res = makeRes();
    await webhookModule.default(hookReq(body, sign(body, '')), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('debounces bursts into one rebuild and queues exactly one more while running', async () => {
    jest.useFakeTimers();
    try {
      let finish;
      const rebuild = jest.fn(() => new Promise((r) => { finish = r; }));
      for (let i = 0; i < 5; i++) webhookModule.scheduleRebuild(rebuild, 1000);
      await jest.advanceTimersByTimeAsync(1000);
      expect(rebuild).toHaveBeenCalledTimes(1);

      webhookModule.scheduleRebuild(rebuild, 1000);
      webhookModule.scheduleRebuild(rebuild, 1000);
      finish();
      await jest.advanceTimersByTimeAsync(1000);
      expect(rebuild).toHaveBeenCalledTimes(2);
      finish();
      await jest.advanceTimersByTimeAsync(2000);
      expect(rebuild).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('rebuilds the snapshot only in static mode', async () => {
    jest.useFakeTimers();
    try {
      renderLiveSnapshot.mockResolvedValue({ renderedRoutes: 3, errors: [] });
      mockPrisma.setting.findUnique.mockResolvedValue({ value: 'dynamic' });
      webhookModule.scheduleRebuild(undefined, 10);
      await jest.advanceTimersByTimeAsync(10);
      expect(renderLiveSnapshot).not.toHaveBeenCalled();

      mockPrisma.setting.findUnique.mockResolvedValue({ value: 'static' });
      webhookModule.scheduleRebuild(undefined, 10);
      await jest.advanceTimersByTimeAsync(10);
      expect(renderLiveSnapshot).toHaveBeenCalledTimes(1);
      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'liveRenderLastStatus' } }));
    } finally {
      jest.useRealTimers();
    }
  });
});
