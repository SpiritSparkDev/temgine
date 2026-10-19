/**
 * Kontaktformular-Einhängung + Admin-API des Add-ons "Anfrage-Weiterleitung".
 * Kein echter Netzwerkzugriff: globales fetch ist gemockt.
 */
jest.disableAutomock();
process.env.NEXTAUTH_SECRET = 'test-secret-for-tnt-inquiries';

const FORM_HTML = '<form><input name="name"><input name="email"><textarea name="nachricht"></textarea><input type="checkbox" name="datenschutz"></form>';
jest.mock('../../lib/templateStore', () => ({
  listTemplates: () => [{ name: 'Anfrage', code: FORM_HTML, type: 'BLOCK', category: 'contact' }],
  getTemplateByName: (n) => (n === 'Anfrage' ? { name: 'Anfrage', code: FORM_HTML, category: 'contact' } : null),
}));
const { makePrisma } = require('../fixtures/fakeTntPrisma');
const mockPrisma = makePrisma();
mockPrisma.contactMessage = { create: jest.fn() };
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/email', () => ({ sendMail: jest.fn().mockResolvedValue(undefined) }));
// Minuten-Limiter (keyFn fehlt) lässt durch; das Stundenlimit dieses Pfads (keyFn gesetzt) ist schaltbar.
let mockTntLimitOk = true;
jest.mock('../../lib/rateLimit', () => ({
  rateLimit: (opts) => ({ check: () => (opts.keyFn && !mockTntLimitOk ? { ok: false, retryAfter: 5 } : { ok: true }) }),
}));
jest.mock('altcha-lib/v1', () => ({ verifySolution: jest.fn().mockResolvedValue(true) }));
let mockAuth = { authorized: true };
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(async () => mockAuth) }));

const contact = require('../../pages/api/contact').default;
const index = require('../../pages/api/tnt-inquiries/index').default;
const outbox = require('../../pages/api/tnt-inquiries/outbox/index').default;
const testRoute = require('../../pages/api/tnt-inquiries/test/index').default;
const { applyUpdate } = require('../../lib/tntInquiriesConfig');
const { sendMail } = require('../../lib/email');

const TOKEN = 'tnt-secret-token-ABCD1234';
const MAPPING = { fields: { name: 'customer.lastName', email: 'customer.email', nachricht: 'event.message' }, privacyField: 'datenschutz' };
const res = () => { const r = {}; r.status = jest.fn(() => r); r.json = jest.fn(() => r); r.setHeader = jest.fn(() => r); return r; };
const form = (extra = {}) => ({ name: 'Hans Bobmann', email: 'hans@example.de', nachricht: 'Bitte ein Angebot', altcha: 'x', _cfTemplate: 'Anfrage', datenschutz: 'on', ...extra });
const post = (body) => ({ method: 'POST', headers: {}, body });
const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(async () => {
  jest.clearAllMocks();
  mockTntLimitOk = true; mockAuth = { authorized: true };
  mockPrisma._rows.length = 0; mockPrisma._settings.clear();
  mockPrisma.setting.findMany = jest.fn().mockResolvedValue([{ key: 'contact_recipient_email', value: 'a@b.de' }]);
  global.fetch = jest.fn().mockResolvedValue({ status: 201, headers: new Headers(), body: null });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const r = await applyUpdate(mockPrisma, { baseUrl: 'https://tnt.example.de', token: TOKEN, mappings: { Anfrage: MAPPING }, enabled: true });
  expect(r.errors).toBeUndefined();
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/contact mit Weiterleitung', () => {
  test('gültig: 200, E-Mail wie bisher, Outbox + Sendeversuch an https', async () => {
    const r = res();
    await contact(post(form()), r);
    await flush();
    expect(r.status).toHaveBeenCalledWith(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('https://tnt.example.de/api/inquiries');
    expect(mockPrisma._rows[0]).toMatchObject({ formId: 'Anfrage', status: 'delivered', payload: null });
  });

  test('ohne Datenschutz-Haken: 400 mit Feldfehler, nichts gesendet/gespeichert', async () => {
    const r = res();
    await contact(post(form({ datenschutz: undefined })), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].fields.datenschutz).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPrisma._rows).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('TNT-Ausfall bleibt für den Besucher unsichtbar', async () => {
    global.fetch.mockRejectedValue(new Error('down'));
    const r = res();
    await contact(post(form()), r);
    await flush();
    expect(r.status).toHaveBeenCalledWith(200);
    expect(mockPrisma._rows[0]).toMatchObject({ status: 'pending', lastError: 'NETWORK' });
  });

  test('IP-Limit (5/h) für diesen Pfad → 429, nichts gesendet', async () => {
    mockTntLimitOk = false;
    const r = res();
    await contact(post(form()), r);
    expect(r.status).toHaveBeenCalledWith(429);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPrisma._rows).toHaveLength(0);
  });

  test('Honeypot gefüllt: stilles 200, nichts weitergegeben', async () => {
    const r = res();
    await contact(post(form({ hp_website: 'http://spam' })), r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(mockPrisma._rows).toHaveLength(0);
  });

  test('Add-on inaktiv oder Formular nicht zugeordnet: Verhalten unverändert', async () => {
    await applyUpdate(mockPrisma, { enabled: false });
    const r1 = res(); await contact(post(form({ datenschutz: undefined })), r1);
    expect(r1.status).toHaveBeenCalledWith(200);
    await applyUpdate(mockPrisma, { enabled: true });
    const r2 = res(); await contact(post(form({ _cfTemplate: 'Anderes', datenschutz: undefined })), r2);
    expect(r2.status).toHaveBeenCalledWith(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('Admin-API', () => {
  test('nur ADMIN (Rolle wird angefordert, Fehlschlag wird durchgereicht)', async () => {
    const { requireAuth } = require('../../lib/auth');
    mockAuth = { authorized: false, status: 403, error: 'Zugriff verweigert' };
    for (const h of [index, testRoute, outbox]) {
      const r = res();
      await h({ method: h === testRoute ? 'POST' : 'GET', headers: {}, query: {}, body: {} }, r);
      expect(r.status).toHaveBeenCalledWith(403);
    }
    expect(requireAuth.mock.calls.every((c) => c[2].length === 1 && c[2][0] === 'ADMIN')).toBe(true);
  });

  test('GET/PUT liefern nie den Token; PUT-Fehler → 422 mit fields', async () => {
    const g = res(); await index({ method: 'GET', headers: {} }, g);
    expect(g.status).toHaveBeenCalledWith(200);
    expect(JSON.stringify(g.json.mock.calls[0][0])).not.toContain(TOKEN);
    expect(g.json.mock.calls[0][0].tokenHint).toBe('••••1234');
    const p = res(); await index({ method: 'PUT', headers: {}, body: { baseUrl: 'http://x.de' } }, p);
    expect(p.status).toHaveBeenCalledWith(422);
    expect(p.json.mock.calls[0][0].fields.baseUrl).toBeDefined();
    const ok = res(); await index({ method: 'PUT', headers: {}, body: { enabled: false } }, ok);
    expect(ok.status).toHaveBeenCalledWith(200);
  });

  test('Test-Route: nur Status + Hinweis', async () => {
    global.fetch.mockResolvedValue({ status: 200, headers: new Headers(), body: null });
    const r = res(); await testRoute({ method: 'POST', headers: {} }, r);
    expect(r.json.mock.calls[0][0]).toEqual({ ok: true, status: 200, hint: expect.any(String) });
    expect(global.fetch.mock.calls[0][0]).toContain('dryRun=1');
  });

  test('Outbox-Liste ohne Inhalte; retry nur für failed', async () => {
    global.fetch.mockResolvedValue({ status: 422, headers: new Headers(), body: null });
    await contact(post(form()), res()); await flush();
    const spy = jest.spyOn(mockPrisma.inquiryOutbox, 'findMany');
    const l = res(); await outbox({ method: 'GET', headers: {}, query: { limit: '50' } }, l);
    expect(l.status).toHaveBeenCalledWith(200);
    const sel = spy.mock.calls[0][0].select;
    expect(sel).toBeDefined();
    expect(sel.payload).toBeUndefined();
    expect(sel.lastError).toBeUndefined();
    const id = mockPrisma._rows[0].id;
    const bad = res(); await outbox({ method: 'POST', headers: {}, body: { action: 'retry', id: 'nope' } }, bad);
    expect(bad.status).toHaveBeenCalledWith(409);
    const ok = res(); await outbox({ method: 'POST', headers: {}, body: { action: 'retry', id } }, ok);
    expect(ok.json).toHaveBeenCalledWith({ ok: true });
    expect(mockPrisma._rows[0]).toMatchObject({ status: 'pending', attempts: 0 });
  });

  test('Cron-Verarbeitung nur mit Secret', async () => {
    process.env.TNT_CRON_SECRET = 'cron-secret-123';
    mockAuth = { authorized: false, status: 401, error: 'x' };
    const no = res();
    await outbox({ method: 'POST', headers: { 'x-tnt-cron': 'wrong-secret-xxx' }, body: { action: 'process' } }, no);
    expect(no.status).toHaveBeenCalledWith(401);
    const yes = res();
    await outbox({ method: 'POST', headers: { 'x-tnt-cron': 'cron-secret-123' }, body: { action: 'process' } }, yes);
    expect(yes.status).toHaveBeenCalledWith(200);
    expect(yes.json.mock.calls[0][0]).toMatchObject({ ok: true });
    delete process.env.TNT_CRON_SECRET;
  });
});
