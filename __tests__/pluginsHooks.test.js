/**
 * @jest-environment node
 *
 * Plugin-Erweiterungen: Kontaktformular-Hooks, Jobs, ctx.prisma/crypto, json-Settings, pluginCrypto.
 */
jest.disableAutomock();

const mockStore = {};
const mockPrisma = {
  setting: {
    findMany: jest.fn(async ({ where } = {}) => Object.entries(mockStore)
      .filter(([key]) => !where || where.key.in.includes(key)).map(([key, value]) => ({ key, value }))),
    upsert: jest.fn(async ({ create }) => { mockStore[create.key] = create.value; return create; }),
  },
  contactMessage: { create: jest.fn(async () => ({ id: 42 })) },
};
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../lib/email', () => ({ sendMail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/rateLimit', () => ({ rateLimit: () => ({ check: () => ({ ok: true, retryAfter: 0 }) }) }));
jest.mock('altcha-lib/v1', () => ({ verifySolution: jest.fn().mockResolvedValue(true) }));
jest.mock('../lib/auth', () => ({ requireAuth: jest.fn().mockResolvedValue({ authorized: true, user: { id: 1 } }), PERMISSIONS: { SETTINGS_VIEW: ['ADMIN'], SETTINGS_EDIT: ['ADMIN'] } }));
jest.mock('../lib/maintenanceStore', () => ({ ...jest.requireActual('../lib/maintenanceStore'), getAllMaintenanceAsSettings: () => ({}) }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('../lib/plugins/registry');
const { runDueJobs, _resetJobState } = require('../lib/plugins/jobs');
const { encrypt, decrypt } = require('../lib/pluginCrypto');
const { validateManifest } = require('../lib/plugins/manifest');
const contact = require('../pages/api/contact').default;
const jobsApi = require('../pages/api/plugins/__jobs').default;
const settingsApi = require('../pages/api/settings').default;

let dir;
const hooks = { beforeContactSubmission: jest.fn(), onContactSubmission: jest.fn() };
const job = { id: 'tick', intervalMs: 60000, run: jest.fn() };
const manifest = {
  id: 'hk', name: 'Hk', version: '1.0.0', temgineApi: 1,
  settings: { hk_cfg: { type: 'json', secret: true }, hk_map: { type: 'json' }, hk_plain: { type: 'text' } },
};

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-hooks-'));
  fs.mkdirSync(path.join(dir, 'hk'));
  fs.writeFileSync(path.join(dir, 'hk', 'plugin.json'), JSON.stringify(manifest));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.clearAllMocks();
  _resetJobState();
  hooks.beforeContactSubmission.mockResolvedValue({ ok: true });
  hooks.onContactSubmission.mockResolvedValue(undefined);
  job.run.mockResolvedValue(undefined);
  registry._setPluginSource({ dir, server: { hk: { hooks, jobs: [job] } } });
  mockStore.plugin_hk_enabled = 'true';
  mockStore.contactSaveToDb = 'true';
  mockStore.hk_plain = 'x';
});

function res() {
  const r = {};
  r.status = jest.fn((c) => { r.code = c; return r; });
  r.json = jest.fn((b) => { r.body = b; return r; });
  r.setHeader = jest.fn(() => r);
  return r;
}
const post = async (body) => {
  const r = res();
  await contact({ method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body: { name: 'A', email: 'a@b.de', message: 'Eine lange Nachricht', altcha: 'x', ...body } }, r);
  return r;
};

describe('contact hooks', () => {
  test('before + after run for active plugins with documented payload', async () => {
    const r = await post({ _cfTemplate: 'gibt-es-nicht', phone: '123' });
    expect(r.code).toBe(200);
    const [bctx, input] = hooks.beforeContactSubmission.mock.calls[0];
    expect(input).toMatchObject({ formId: 'gibt-es-nicht', clientIp: '1.2.3.4', fieldDefs: [] });
    expect(input.values).toMatchObject({ name: 'A', phone: '123' });
    expect(input.values).not.toHaveProperty('altcha');
    expect(bctx).toMatchObject({ settings: { hk_plain: 'x' }, prisma: mockPrisma, clientIp: '1.2.3.4' });
    expect(typeof bctx.crypto.encrypt).toBe('function');
    const [, sub] = hooks.onContactSubmission.mock.calls[0];
    expect(sub).toMatchObject({ formId: 'gibt-es-nicht', submissionId: '42', honeypotTripped: false });
  });

  test('before hook can reject with field errors; nothing is saved or after-hooked', async () => {
    hooks.beforeContactSubmission.mockResolvedValue({ ok: false, status: 422, errors: { privacy: 'Bitte zustimmen.' } });
    const r = await post({});
    expect(r.code).toBe(422);
    expect(r.body).toEqual({ error: 'Validierungsfehler', fields: { privacy: 'Bitte zustimmen.' } });
    expect(mockPrisma.contactMessage.create).not.toHaveBeenCalled();
    expect(hooks.onContactSubmission).not.toHaveBeenCalled();
  });

  test('throwing hooks never fail the submission', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    hooks.beforeContactSubmission.mockRejectedValue(new Error('boom'));
    hooks.onContactSubmission.mockRejectedValue(new Error('boom'));
    expect((await post({})).code).toBe(200);
    console.error.mockRestore();
  });

  test('inactive plugins are not called; honeypot only reaches the after hook', async () => {
    mockStore.plugin_hk_enabled = 'false';
    await post({});
    expect(hooks.beforeContactSubmission).not.toHaveBeenCalled();
    mockStore.plugin_hk_enabled = 'true';
    mockPrisma.contactMessage.create.mockClear();
    const r = await post({ hp_website: 'bot' });
    expect(r.code).toBe(200);
    expect(hooks.beforeContactSubmission).not.toHaveBeenCalled();
    expect(hooks.onContactSubmission.mock.calls[0][1]).toMatchObject({ honeypotTripped: true, submissionId: null });
    expect(mockPrisma.contactMessage.create).not.toHaveBeenCalled();
  });
});

describe('jobs', () => {
  test('runs due jobs of active plugins once per interval, with ctx', async () => {
    expect(await runDueJobs(1000)).toEqual(['hk:tick']);
    expect(job.run.mock.calls[0][0]).toMatchObject({ prisma: mockPrisma });
    expect(await runDueJobs(2000)).toEqual([]);
    expect(await runDueJobs(62000)).toEqual(['hk:tick']);
  });
  test('errors are caught; inactive plugins are skipped', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    job.run.mockRejectedValue(new Error('x'));
    await expect(runDueJobs(1000)).resolves.toEqual(['hk:tick']);
    console.error.mockRestore();
    _resetJobState();
    mockStore.plugin_hk_enabled = 'false';
    expect(await runDueJobs(1000)).toEqual([]);
  });
  test('internal route requires the process secret', async () => {
    process.env.PLUGIN_CRON_SECRET = 'geheim';
    const bad = res();
    await jobsApi({ method: 'POST', headers: { 'x-plugin-cron': 'falsch' } }, bad);
    expect(bad.code).toBe(404);
    const ok = res();
    await jobsApi({ method: 'POST', headers: { 'x-plugin-cron': 'geheim' } }, ok);
    expect(ok.body).toEqual({ started: ['hk:tick'] });
    delete process.env.PLUGIN_CRON_SECRET;
  });
});

describe('json settings and crypto', () => {
  test('manifest: json type valid, secret flag only for json', () => {
    const base = { id: 'x', name: 'X', version: '1', temgineApi: 1 };
    expect(validateManifest({ ...base, settings: { x_a: { type: 'json', secret: true } } }, 'x').errors).toEqual([]);
    expect(validateManifest({ ...base, settings: { x_a: { type: 'text', secret: true } } }, 'x').errors).toHaveLength(1);
  });
  test('secret json is masked in GET and never public; invalid JSON rejected on PUT', async () => {
    mockStore.hk_cfg = '{"token":"abc"}';
    mockStore.hk_map = '{"a":1}';
    const g = res();
    await settingsApi({ method: 'GET' }, g);
    expect(g.body).toMatchObject({ hk_cfg_set: true, hk_map: '{"a":1}' });
    expect(g.body).not.toHaveProperty('hk_cfg');
    const plugin = registry.getPlugin('hk');
    expect(registry.publicSettings(plugin, { hk_cfg: 'x', hk_map: 'y' })).toEqual({ hk_map: 'y' });
    const bad = res();
    await settingsApi({ method: 'PUT', body: { key: 'hk_map', value: '{kaputt' } }, bad);
    expect(bad.code).toBe(400);
    const good = res();
    await settingsApi({ method: 'PUT', body: { key: 'hk_map', value: '{"b":2}' } }, good);
    expect(good.code).toBe(200);
  });
  test('pluginCrypto round-trips', () => {
    process.env.NEXTAUTH_SECRET = 'test-secret';
    expect(decrypt(encrypt('Grüße'))).toBe('Grüße');
    expect(() => decrypt('kaputt')).toThrow();
  });
});
