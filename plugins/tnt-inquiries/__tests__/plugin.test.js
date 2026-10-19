/**
 * @jest-environment node
 *
 * Plugin tnt-inquiries im Zusammenspiel mit dem Kern: Kontaktformular-Hooks (pages/api/contact.js),
 * Admin-Routen, Retry-Job. Kein echter Netzwerkzugriff (globales fetch ist gemockt).
 */
jest.disableAutomock();
process.env.NEXTAUTH_SECRET = 'test-secret-for-tnt-inquiries';

const FORM_HTML = '<form><input name="name"><input name="email"><textarea name="nachricht"></textarea><input type="checkbox" name="datenschutz"></form>';
jest.mock('../../../lib/templateStore', () => ({
  listTemplates: () => [{ name: 'Anfrage', code: FORM_HTML, type: 'BLOCK', category: 'contact' }],
  getTemplateByName: (n) => (n === 'Anfrage' ? { name: 'Anfrage', code: FORM_HTML, category: 'contact' } : null),
}));
const { makePrisma } = require('./fixtures/fakePrisma');
const mockPrisma = makePrisma();
let mockMsgId = 0;
mockPrisma.contactMessage = { create: jest.fn(async () => ({ id: ++mockMsgId })) };
let mockEmailTpl = { subject: '', body: '' };
jest.mock('../../../lib/contactEmailTemplateStore', () => ({ getContactEmailTemplate: () => mockEmailTpl }));
jest.mock('../../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../../lib/email', () => ({ sendMail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../lib/rateLimit', () => ({ rateLimit: () => ({ check: () => ({ ok: true }) }) }));
jest.mock('altcha-lib/v1', () => ({ verifySolution: jest.fn().mockResolvedValue(true) }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('../../../lib/plugins/registry');
const { runDueJobs, _resetJobState } = require('../../../lib/plugins/jobs');
const { validateManifest } = require('../../../lib/plugins/manifest');
const contact = require('../../../pages/api/contact').default;
const crypto = require('../../../lib/pluginCrypto');
const { applyUpdate } = require('../config');
const plugin = require('../server').default;
const manifest = require('../plugin.json');
const { sendMail } = require('../../../lib/email');

const TOKEN = 'tnt-secret-token-ABCD1234';
const MAPPING = { fields: { name: 'customer.lastName', email: 'customer.email', nachricht: 'event.message' }, privacyField: 'datenschutz' };
const ctxOf = () => ({ prisma: mockPrisma, crypto, settings: {}, log: console, query: {} });
const res = () => { const r = {}; r.status = jest.fn((c) => { r.code = c; return r; }); r.json = jest.fn((b) => { r.body = b; return r; }); r.setHeader = jest.fn(() => r); return r; };
const form = (extra = {}) => ({ name: 'Hans Bobmann', email: 'hans@example.de', nachricht: 'Bitte ein Angebot', altcha: 'x', _cfTemplate: 'Anfrage', datenschutz: 'on', ...extra });
const post = async (body, ip = '1.2.3.4') => {
  const r = res();
  await contact({ method: 'POST', headers: { 'x-forwarded-for': ip }, body }, r);
  return r;
};
const flush = () => new Promise((r) => setTimeout(r, 20));
const enabled = (on) => mockPrisma._settings.set('plugin_tnt-inquiries_enabled', on ? 'true' : 'false');

let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnt-plugin-'));
  fs.mkdirSync(path.join(dir, 'tnt-inquiries'));
  fs.writeFileSync(path.join(dir, 'tnt-inquiries', 'plugin.json'), JSON.stringify(manifest));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

beforeEach(async () => {
  jest.clearAllMocks();
  mockMsgId = 0;
  mockEmailTpl = { subject: '', body: '' };
  _resetJobState();
  registry._setPluginSource({ dir, server: { 'tnt-inquiries': plugin } });
  mockPrisma._rows.length = 0; mockPrisma._settings.clear();
  mockPrisma._settings.set('contact_recipient_email', 'a@b.de');
  mockPrisma._settings.set('contactSaveToDb', 'true');
  enabled(true);
  global.fetch = jest.fn().mockResolvedValue({ status: 201, headers: new Headers(), body: null });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  const r = await applyUpdate(ctxOf(), { baseUrl: 'https://tnt.example.de', token: TOKEN, mappings: { Anfrage: MAPPING } });
  expect(r.errors).toBeUndefined();
});
afterEach(() => jest.restoreAllMocks());

test('Manifest ist gültig, Token/Alarm sind Secrets, alle Routen nur ADMIN', () => {
  expect(validateManifest(manifest, 'tnt-inquiries').errors).toEqual([]);
  expect(manifest.settings['tnt-inquiries_token'].type).toBe('secret');
  expect(manifest.settings['tnt-inquiries_alert']).toMatchObject({ type: 'json', secret: true });
  expect(Object.keys(plugin.routes).every((k) => plugin.routes[k].auth.join() === 'ADMIN')).toBe(true);
});

describe('POST /api/contact mit Plugin', () => {
  test('gültig: 200, E-Mail wie bisher, Outbox + Sendeversuch an https, submissionId = UUID', async () => {
    const r = await post(form());
    await flush();
    expect(r.code).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('https://tnt.example.de/api/inquiries');
    expect(mockPrisma._rows[0]).toMatchObject({ formId: 'Anfrage', submissionId: expect.stringMatching(/^[0-9a-f-]{36}$/), status: 'delivered', payload: null });
  });

  test('ohne Datenschutz-Haken: 400 mit Feldfehler, nichts gesendet/gespeichert', async () => {
    const r = await post(form({ datenschutz: undefined }));
    expect(r.code).toBe(400);
    expect(r.body.fields.datenschutz).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPrisma._rows).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
    expect(mockPrisma.contactMessage.create).not.toHaveBeenCalled();
  });

  test('TNT-Ausfall bleibt für den Besucher unsichtbar', async () => {
    global.fetch.mockRejectedValue(new Error('down'));
    const r = await post(form());
    await flush();
    expect(r.code).toBe(200);
    expect(mockPrisma._rows[0]).toMatchObject({ status: 'pending', lastError: 'NETWORK' });
  });

  test('Honeypot gefüllt: stilles 200, nichts weitergegeben', async () => {
    const r = await post(form({ hp_website: 'http://spam' }));
    await flush();
    expect(r.code).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(mockPrisma._rows).toHaveLength(0);
  });

  test('Plugin aus oder Formular nicht zugeordnet: Verhalten unverändert', async () => {
    enabled(false);
    expect((await post(form({ datenschutz: undefined }))).code).toBe(200);
    enabled(true);
    expect((await post(form({ _cfTemplate: 'Anderes', datenschutz: undefined }))).code).toBe(200);
    await flush();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockPrisma._rows).toHaveLength(0);
  });

  test('ohne Token: kein Plan, keine Pflicht, kein Request', async () => {
    mockPrisma._settings.set('tnt-inquiries_token', '');
    expect((await post(form({ datenschutz: undefined }))).code).toBe(200);
    await flush();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('Admin-Routen', () => {
  const call = async (key, req = {}) => {
    const r = res();
    await plugin.routes[key].handler({ headers: {}, body: {}, ...req }, r, { ...ctxOf(), query: req.query || {} });
    return r;
  };

  test('GET/PUT config liefern nie den Token; PUT-Fehler ergibt 422 mit fields', async () => {
    const g = await call('GET config');
    expect(g.code).toBe(200);
    expect(JSON.stringify(g.body)).not.toContain(TOKEN);
    expect(g.body.tokenHint).toBe('••••1234');
    const p = await call('PUT config', { body: { baseUrl: 'http://x.de' } });
    expect(p.code).toBe(422);
    expect(p.body.fields.baseUrl).toBeDefined();
    expect((await call('PUT config', { body: { baseUrl: 'https://neu.example.de' } })).code).toBe(200);
  });

  test('Token liegt verschlüsselt (v1) in den Plugin-Settings, nie im Klartext', () => {
    const stored = mockPrisma._settings.get('tnt-inquiries_token');
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain(TOKEN);
    expect(crypto.decrypt(stored)).toBe(TOKEN);
  });

  test('Test-Route: nur Status + Hinweis, dryRun', async () => {
    global.fetch.mockResolvedValue({ status: 200, headers: new Headers(), body: null });
    const r = await call('POST test');
    expect(r.body).toEqual({ ok: true, status: 200, hint: expect.any(String) });
    expect(global.fetch.mock.calls[0][0]).toContain('dryRun=1');
  });

  test('Outbox-Liste ohne Inhalte; retry nur für failed', async () => {
    global.fetch.mockResolvedValue({ status: 422, headers: new Headers(), body: null });
    await post(form()); await flush();
    const spy = jest.spyOn(mockPrisma.inquiryOutbox, 'findMany');
    const l = await call('GET outbox', { query: { limit: '50' } });
    expect(l.code).toBe(200);
    const sel = spy.mock.calls[0][0].select;
    expect(sel.payload).toBeUndefined();
    expect(sel.lastError).toBeUndefined();
    const id = mockPrisma._rows[0].id;
    expect((await call('POST outbox/retry', { body: { id: 'nope' } })).code).toBe(409);
    expect((await call('POST outbox/retry', { body: { id } })).body).toEqual({ ok: true });
    expect(mockPrisma._rows[0]).toMatchObject({ status: 'pending', attempts: 0 });
  });
});

describe('Retry-Job', () => {
  test('arbeitet fällige Einträge ab und räumt auf (über den generischen Job-Mechanismus)', async () => {
    global.fetch.mockRejectedValue(new Error('down'));
    await post(form()); await flush();
    mockPrisma._rows.push({ id: 'old', status: 'failed', createdAt: new Date(Date.now() - 31 * 86400000), payload: 'x' });
    mockPrisma._rows[0].nextAttemptAt = new Date(Date.now() - 1000);
    global.fetch.mockResolvedValue({ status: 201, headers: new Headers(), body: null });
    expect(await runDueJobs(Date.now())).toEqual(['tnt-inquiries:outbox']);
    expect(mockPrisma._rows).toHaveLength(1);
    expect(mockPrisma._rows[0]).toMatchObject({ status: 'delivered', payload: null });
  });

  test('bei ausgeschaltetem Plugin läuft der Job nicht; bei Alarm bleibt alles gehalten', async () => {
    enabled(false);
    expect(await runDueJobs(Date.now())).toEqual([]);
    enabled(true);
    mockPrisma._settings.set('tnt-inquiries_alert', JSON.stringify({ code: 'AUTH', since: 'x' }));
    mockPrisma._rows.push({ id: 'p', status: 'pending', attempts: 0, nextAttemptAt: new Date(0), createdAt: new Date(), payload: 'x' });
    await runDueJobs(Date.now());
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('Option „Mail erst nach TNT-Antwort“', () => {
  const answer = (status, json) => ({ status, headers: new Headers(), body: null, text: async () => JSON.stringify(json) });
  const OK = { ok: true, duplicate: false, appointmentId: 77, appointmentUrl: 'https://tnt.example.de/appointments/77' };
  const turnOn = (on = true) => applyUpdate(ctxOf(), { mappings: { Anfrage: { ...MAPPING, mailAfterDelivery: on } } });
  const mail = () => sendMail.mock.calls[0][0];

  test('Option aus: Mail ohne Link, Weiterleitung nach der Mail wie bisher', async () => {
    global.fetch.mockResolvedValue(answer(201, OK));
    mockEmailTpl = { subject: 'S', body: 'Link: {{tnt_url}}|{{tnt_status}}' };
    await post(form());
    expect(mail().text).toBe('Link: |');
    await flush();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('Option an, 201: eigene Vorlage und generische Mail enthalten URL/ID, je Absendung genau ein Request', async () => {
    await turnOn();
    global.fetch.mockResolvedValue(answer(201, OK));
    mockEmailTpl = { subject: 'S', body: '<p>Nr {{tnt_id}} {{tnt_status}}</p>{{#tnt_url}}<a href="{{tnt_url}}">Termin</a>{{/tnt_url}}' };
    const r = await post(form());
    expect(r.code).toBe(200);
    expect(mail().html).toContain('Nr 77 angelegt');
    expect(mail().html).toContain('<a href="https:&#x2F;&#x2F;tnt.example.de&#x2F;appointments&#x2F;77">');
    mockEmailTpl = { subject: '', body: '' };
    await post(form());
    expect(sendMail.mock.calls[1][0].text).toContain('Termin im Planer: https://tnt.example.de/appointments/77');
    await flush();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockPrisma._rows.map((x) => x.status)).toEqual(['delivered', 'delivered']);
    expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
  });

  test('URL mit fremdem Host, http:// oder Userinfo wird verworfen; ID bleibt', async () => {
    await turnOn();
    mockEmailTpl = { subject: 'S', body: '[{{tnt_url}}][{{tnt_id}}]' };
    for (const bad of ['https://evil.example/x', 'http://tnt.example.de/x', 'https://u:p@tnt.example.de/x', 'https://tnt.example.de.evil.io/x', 'javascript:alert(1)']) {
      sendMail.mockClear(); mockPrisma._rows.length = 0;
      global.fetch.mockResolvedValue(answer(201, { ...OK, appointmentUrl: bad }));
      await post(form());
      expect(mail().text).toBe('[][77]');
    }
  });

  test('Spoofing: ein Formularfeld tnt_url/tnt_id kann den Termin-Link nicht verdrängen oder einschleusen', async () => {
    await turnOn();
    mockEmailTpl = { subject: 'S', body: '[{{{tnt_url}}}][{{tnt_id}}][{{tnt_status}}]' };
    global.fetch.mockResolvedValue(answer(201, OK));
    await post(form({ tnt_url: 'https://evil.example/phish', tnt_id: '666' }));
    expect(mail().text).toContain('/appointments/77');
    expect(mail().text).not.toContain('evil.example');
    expect(mail().text).not.toContain('666');
    // TNT-Ausfall: das Formularfeld darf nicht an die Stelle des fehlenden Links treten
    sendMail.mockClear(); mockPrisma._rows.length = 0;
    global.fetch.mockResolvedValue(answer(503, {}));
    await post(form({ tnt_url: 'https://evil.example/phish' }));
    expect(mail().text).not.toContain('evil.example');
  });

  test('Duplikat-Antwort 200 liefert ebenfalls ID/URL', async () => {
    await turnOn();
    global.fetch.mockResolvedValue(answer(200, { ...OK, duplicate: true }));
    mockEmailTpl = { subject: 'S', body: '{{{tnt_url}}}' };
    await post(form());
    expect(mail().text).toContain('/appointments/77');
  });

  test('TNT 5xx oder Timeout: Mail sofort ohne Link, ausstehend, Outbox pending, Retry stellt später zu', async () => {
    await turnOn();
    mockEmailTpl = { subject: 'S', body: '[{{tnt_url}}][{{tnt_status}}]' };
    for (const fail of [() => Promise.resolve(answer(503, {})), () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }))]) {
      sendMail.mockClear(); mockPrisma._rows.length = 0;
      global.fetch.mockImplementation(fail);
      expect((await post(form())).code).toBe(200);
      expect(mail().text).toBe('[][ausstehend]');
      expect(mockPrisma._rows[0].status).toBe('pending');
    }
    sendMail.mockClear();
    mockEmailTpl = { subject: '', body: '' };
    await post(form({ name: 'Anna Zwei' }));
    expect(mail().text).toContain('Übertragung an den Planer steht noch aus');
    mockPrisma._rows.forEach((x) => { x.nextAttemptAt = new Date(Date.now() - 1000); });
    global.fetch.mockReset();
    global.fetch.mockResolvedValue(answer(201, OK));
    await runDueJobs(Date.now());
    expect(mockPrisma._rows.every((x) => x.status === 'delivered')).toBe(true);
  });

  test('401: Mail ohne Link, Alarm gesetzt, Eintrag gehalten', async () => {
    await turnOn();
    global.fetch.mockResolvedValue(answer(401, {}));
    mockEmailTpl = { subject: 'S', body: '[{{tnt_url}}][{{tnt_status}}]' };
    await post(form());
    expect(mail().text).toBe('[][ausstehend]');
    expect(JSON.parse(mockPrisma._settings.get('tnt-inquiries_alert')).code).toBe('AUTH');
    expect(mockPrisma._rows[0].status).toBe('pending');
  });

  test('ohne Datenschutz-Haken: 400, nichts passiert', async () => {
    await turnOn();
    expect((await post(form({ datenschutz: undefined }))).code).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('URL landet nur in der Betreiber-Mail: nicht in Antwort, Logs, Outbox, ContactMessage', async () => {
    await turnOn();
    global.fetch.mockResolvedValue(answer(201, OK));
    const r = await post(form());
    await flush();
    const logs = [console.log, console.warn, console.error].map((f) => JSON.stringify(f.mock?.calls || [])).join();
    expect(JSON.stringify(r.body)).not.toContain('appointments');
    expect(logs).not.toContain('appointments');
    expect(JSON.stringify(mockPrisma.contactMessage.create.mock.calls)).not.toContain('appointments');
    expect(JSON.stringify(mockPrisma._rows)).not.toContain('appointments');
    expect(mail().text).toContain('appointments');
  });

  test('Plugin-Variablen (tnt_*) sind reserviert: gleichnamige Formularfelder werden verworfen', async () => {
    await turnOn();
    global.fetch.mockResolvedValue(answer(201, OK));
    mockEmailTpl = { subject: 'S', body: '{{tnt_status}}' };
    await post(form({ tnt_status: 'Formular' }));
    expect(mail().text).toBe('angelegt');
  });

  test('Admin: Option wird gespeichert und in der Sicht ausgegeben', async () => {
    await turnOn();
    const r = res();
    await plugin.routes['GET config'].handler({ headers: {}, body: {} }, r, ctxOf());
    expect(r.body.forms[0].mailAfterDelivery).toBe(true);
    await turnOn(false);
    expect(JSON.parse(mockPrisma._settings.get('tnt-inquiries_mappings')).Anfrage.mailAfterDelivery).toBe(false);
  });
});
