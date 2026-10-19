/**
 * Add-on "Anfrage-Weiterleitung an TNT Manager": Abnahmekriterien aus
 * docs/specs/tnt-inquiries-prompt.md Abschnitt 3. Kein echter Netzwerkzugriff (fetch ist gemockt).
 */
jest.disableAutomock();

process.env.NEXTAUTH_SECRET = 'test-secret-for-tnt-inquiries';
delete process.env.TNT_BASE_URL;
delete process.env.TNT_INQUIRY_TOKEN;

const FORM_HTML = `<form data-temgine-form="contact">
  <input type="text" name="name"><input type="email" name="email"><input type="tel" name="telefon">
  <input type="text" name="datum"><textarea name="nachricht"></textarea>
  <input type="checkbox" name="datenschutz"><input name="hp_website">
</form>`;
jest.mock('../lib/templateStore', () => ({
  listTemplates: () => [{ name: 'Anfrage', code: FORM_HTML, type: 'BLOCK', category: 'contact' }],
  getTemplateByName: (n) => (String(n).toLowerCase() === 'anfrage'
    ? { name: 'Anfrage', code: FORM_HTML, type: 'BLOCK', category: 'contact' } : null),
}));

const T = require('../lib/tntInquiries');
const C = require('../lib/tntInquiriesConfig');

const TOKEN = 'tnt-secret-token-ABCD1234';
const GOOD_MAPPING = {
  fields: { name: 'customer.lastName', email: 'customer.email', telefon: 'customer.phone', datum: 'event.date', nachricht: 'event.message' },
  privacyField: 'datenschutz',
};
const VALUES = {
  name: 'Hans Bobmann', email: 'hans@example.de', telefon: '+49 170 1234567',
  datum: '11.11.2026', nachricht: 'Feuershow\u0000 bitte', datenschutz: 'on', altcha: 'xyz', unmapped: 'geheim',
};

const { makePrisma } = require('./fixtures/fakeTntPrisma');
const resp = (status, headers = {}) => ({ status, headers: new Headers(headers), body: null });

async function readyPrisma() {
  const prisma = makePrisma();
  const r = await C.applyUpdate(prisma, { baseUrl: 'https://tnt.example.de', token: TOKEN, mappings: { Anfrage: GOOD_MAPPING }, enabled: true });
  expect(r.errors).toBeUndefined();
  return prisma;
}

let logged;
beforeEach(() => {
  logged = [];
  for (const m of ['log', 'warn', 'error', 'info']) jest.spyOn(console, m).mockImplementation((...a) => logged.push(a.join(' ')));
});
afterEach(() => jest.restoreAllMocks());

describe('Payload', () => {
  test('mappt, säubert, normalisiert; Unzugeordnetes und Leeres fehlt', () => {
    const p = T.buildInquiryPayload({ formId: 'Anfrage' }, VALUES, GOOD_MAPPING, 'sub-1');
    expect(p).toEqual({
      externalId: 'temgine-Anfrage-sub-1', source: 'temgine', privacyAccepted: true,
      customer: { lastName: 'Hans Bobmann', email: 'hans@example.de', phone: '+49 170 1234567' },
      event: { date: '2026-11-11', message: 'Feuershow bitte' },
    });
    expect(JSON.stringify(p)).not.toContain('geheim');
    expect(T.validateInquiry(p)).toEqual([]);
  });

  test('Zeit nur mit Datum, Zahlen als Zahl, Längen gekürzt, ungültige E-Mail entfällt', () => {
    const m = { fields: { z: 'event.time', d: 'event.date', dur: 'event.durationMinutes', g: 'event.guests', e: 'customer.email', n: 'customer.firstName' }, privacyField: 'p' };
    expect(T.buildInquiryPayload({ formId: 'f' }, { z: '19.30 Uhr', p: '1' }, m, 's').event).toBeUndefined();
    const p = T.buildInquiryPayload({ formId: 'f' }, { z: '19:30', d: '2026-11-11', dur: '30', g: '120 Gäste', e: 'kaputt', n: 'x'.repeat(300), p: '1' }, m, 's');
    expect(p.event).toEqual({ date: '2026-11-11', time: '19:30', durationMinutes: 30, guests: 120 });
    expect(p.customer.email).toBeUndefined();
    expect(p.customer.firstName).toHaveLength(100);
    expect(T.validateInquiry(p)).toContain('customer.contact');
  });

  test('ohne angehakte Datenschutz-Checkbox: kein Payload', () => {
    expect(T.buildInquiryPayload({ formId: 'f' }, { ...VALUES, datenschutz: undefined }, GOOD_MAPPING, 's')).toBeNull();
    expect(T.buildInquiryPayload({ formId: 'f' }, { ...VALUES, datenschutz: 'false' }, GOOD_MAPPING, 's')).toBeNull();
  });
});

describe('Senden und Klassifizierung', () => {
  test('nur https: mit http:// wird nie ein Request gesendet', async () => {
    const fetchImpl = jest.fn();
    const r = await T.postInquiry({ baseUrl: 'http://tnt.example.de', token: TOKEN, payload: {}, fetchImpl });
    expect(r).toEqual({ error: 'HTTPS' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('Request: https, Bearer, redirect:error, Timeout-Signal, kein Zertifikats-Bypass', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(resp(201));
    await T.postInquiry({ baseUrl: 'https://tnt.example.de/', token: TOKEN, payload: { a: 1 }, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://tnt.example.de/api/inquiries');
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeDefined();
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init).not.toHaveProperty('agent');
    expect(init).not.toHaveProperty('dispatcher');
    await T.postInquiry({ baseUrl: 'https://tnt.example.de', token: TOKEN, payload: {}, dryRun: true, fetchImpl });
    expect(fetchImpl.mock.calls[1][0]).toBe('https://tnt.example.de/api/inquiries?dryRun=1');
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).not.toBe('0');
  });

  test('Fehlertexte mit URL/Inhalt werden auf Codes reduziert', async () => {
    const mk = (e) => T.postInquiry({ baseUrl: 'https://tnt.example.de', token: TOKEN, payload: {}, fetchImpl: async () => { throw e; } });
    const leaky = Object.assign(new TypeError('fetch failed https://tnt.example.de/api/inquiries?x=Hans'), { cause: { code: 'ECONNREFUSED' } });
    expect(await mk(leaky)).toEqual({ error: 'ECONNREFUSED' });
    expect(await mk(Object.assign(new Error('x'), { cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } }))).toEqual({ error: 'CERT' });
    expect(await mk(Object.assign(new Error('x'), { name: 'AbortError' }))).toEqual({ error: 'TIMEOUT' });
    expect(await mk(new Error('Hans Bobmann'))).toEqual({ error: 'NETWORK' });
  });

  test('classifyResponse + nextDelay', () => {
    const c = (s, h) => T.classifyResponse(s, h).action;
    expect([200, 201].map((s) => c(s))).toEqual(['delivered', 'delivered']);
    expect([400, 413, 415, 422].map((s) => c(s))).toEqual(Array(4).fill('fail-permanent'));
    expect([401, 403].map((s) => c(s))).toEqual(['alert', 'alert']);
    expect([429, 500, 503].map((s) => c(s))).toEqual(Array(3).fill('retry'));
    expect(T.classifyResponse(429, new Headers({ 'Retry-After': '120' })).retryAfterMs).toBe(120000);
    expect(T.classifyResponse(429, { 'retry-after': '99999999' }).retryAfterMs).toBe(24 * 3600 * 1000);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(T.nextDelay)).toEqual([1, 5, 15, 60, 180, 360, 720, 1440].map((m) => m * 60000));
  });
});

describe('Outbox', () => {
  async function submit(prisma, fetchImpl, values = VALUES, sub = 'sub-1') {
    const plan = await C.getForwardingPlan(prisma, 'Anfrage');
    plan.rt.fetchImpl = fetchImpl;
    const r = await C.forwardSubmission(prisma, plan, values, sub);
    if (r) await r.done;
    return plan;
  }

  test('201 → zugestellt, Personendaten in der Outbox gelöscht', async () => {
    const prisma = await readyPrisma();
    const fetchImpl = jest.fn().mockResolvedValue(resp(201));
    await submit(prisma, fetchImpl);
    const row = prisma._rows[0];
    expect(row).toMatchObject({ status: 'delivered', payload: null, lastStatusCode: 201, attempts: 1 });
    expect(row.deliveredAt).toBeInstanceOf(Date);
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.externalId).toBe('temgine-Anfrage-sub-1');
  });

  test('Payload liegt verschlüsselt in der DB (kein Klartext)', async () => {
    const prisma = await readyPrisma();
    await submit(prisma, jest.fn().mockResolvedValue(resp(500)));
    const stored = prisma._rows[0].payload;
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain('Bobmann');
    expect(JSON.parse(C.decrypt(stored)).customer.lastName).toBe('Hans Bobmann');
    expect(prisma._settings.get('tnt_inquiries')).not.toContain(TOKEN);
  });

  test('Wiederholung derselben Absendung (z. B. nach Timeout) → Duplikat, genau ein Termin', async () => {
    const prisma = await readyPrisma();
    const appointments = new Set();
    const server = jest.fn(async (_u, init) => {
      const id = JSON.parse(init.body).externalId;
      const dup = appointments.has(id); appointments.add(id);
      return resp(dup ? 200 : 201);
    });
    // 1. Versuch: Server legt Termin an, Antwort geht verloren (Timeout)
    const lost = jest.fn(async (u, i) => { await server(u, i); throw Object.assign(new Error('t'), { name: 'AbortError' }); });
    const plan = await submit(prisma, lost);
    expect(prisma._rows[0]).toMatchObject({ status: 'pending', attempts: 1, lastError: 'TIMEOUT' });
    // Worker wiederholt nach 1 min mit derselben externalId
    plan.rt.fetchImpl = server;
    await T.processOutbox(prisma, new Date(Date.now() + 61_000), plan.rt);
    expect(prisma._rows[0]).toMatchObject({ status: 'delivered', payload: null, attempts: 2 });
    expect(appointments.size).toBe(1);
    // gleiche Absendung nochmal eingereicht → kein zweiter Outbox-Eintrag
    await submit(prisma, server);
    expect(prisma._rows).toHaveLength(1);
  });

  test('422 wird nicht wiederholt', async () => {
    const prisma = await readyPrisma();
    const f = jest.fn().mockResolvedValue(resp(422));
    const plan = await submit(prisma, f);
    expect(prisma._rows[0]).toMatchObject({ status: 'failed', lastStatusCode: 422, attempts: 1 });
    await T.processOutbox(prisma, new Date(Date.now() + 48 * 3600 * 1000), plan.rt);
    expect(f).toHaveBeenCalledTimes(1);
    expect((await C.buildView(prisma)).alert.code).toBe('FAILED');
  });

  test.each([[401, 'AUTH'], [403, 'HTTPS']])('%i → Admin-Alarm, Absendung bleibt erhalten und wird gehalten', async (status, code) => {
    const prisma = await readyPrisma();
    const f = jest.fn().mockResolvedValue(resp(status));
    const plan = await submit(prisma, f);
    expect(prisma._rows[0]).toMatchObject({ status: 'pending', attempts: 0, lastStatusCode: status });
    expect(prisma._rows[0].payload).toBeTruthy();
    expect((await C.buildView(prisma)).alert).toMatchObject({ code });
    const later = new Date(Date.now() + 5 * 3600 * 1000);
    const r = await T.processOutbox(prisma, later, await C.getRuntime(prisma));
    expect(r.held).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    // neuer Token behebt es: Alarm weg, Eintrag sofort fällig, danach zugestellt
    await C.applyUpdate(prisma, { token: 'a-new-valid-token-1234' });
    expect((await C.buildView(prisma)).alert).toBeNull();
    const ok = jest.fn().mockResolvedValue(resp(201));
    const rt = await C.getRuntime(prisma); rt.fetchImpl = ok;
    await T.processOutbox(prisma, new Date(Date.now() + 1000), rt);
    expect(prisma._rows[0].status).toBe('delivered');
    expect(plan).toBeTruthy();
  });

  test('429/5xx: Wartezeit, dieselbe externalId, nach 9 Versuchen fehlgeschlagen', async () => {
    const prisma = await readyPrisma();
    const f = jest.fn().mockResolvedValue(resp(503));
    const plan = await submit(prisma, f);
    let now = Date.now();
    const waits = [];
    for (let i = 1; i < T.MAX_ATTEMPTS; i++) {
      const row = prisma._rows[0];
      waits.push(row.nextAttemptAt.getTime() - now);
      now = row.nextAttemptAt.getTime() + 1;
      await T.processOutbox(prisma, new Date(now), plan.rt);
    }
    expect(prisma._rows[0]).toMatchObject({ status: 'failed', attempts: 9, lastError: 'RETRIES_EXHAUSTED' });
    expect(f).toHaveBeenCalledTimes(9);
    expect(new Set(f.mock.calls.map((c) => JSON.parse(c[1].body).externalId)).size).toBe(1);
    // erste Wartezeit ≈ 1 min (Sofortversuch lief kurz vor "Date.now()" oben)
    expect(waits[0]).toBeGreaterThan(50_000);
    expect(waits.slice(1).map((w) => Math.round(w / 60000))).toEqual([5, 15, 60, 180, 360, 720, 1440]);
  });

  test('429 mit Retry-After wird beachtet', async () => {
    const prisma = await readyPrisma();
    const t0 = Date.now();
    await submit(prisma, jest.fn().mockResolvedValue(resp(429, { 'Retry-After': '600' })));
    const wait = prisma._rows[0].nextAttemptAt.getTime() - t0;
    expect(wait).toBeGreaterThan(590_000);
    expect(wait).toBeLessThan(620_000);
  });

  test('Zertifikatsfehler: kein Fallback, Absendung gehalten, Alarm CERT', async () => {
    const prisma = await readyPrisma();
    const f = jest.fn().mockRejectedValue(Object.assign(new Error('x'), { cause: { code: 'CERT_HAS_EXPIRED' } }));
    await submit(prisma, f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0].startsWith('https://')).toBe(true);
    expect(prisma._rows[0]).toMatchObject({ status: 'pending', lastError: 'CERT' });
    expect((await C.buildView(prisma)).alert.code).toBe('CERT');
  });

  test('Cleanup: nicht zugestellte Einträge nach 30 Tagen weg, zugestellte (ohne Inhalt) bleiben', async () => {
    const prisma = await readyPrisma();
    const old = new Date(Date.now() - 31 * 86400000);
    prisma._rows.push(
      { id: 'a', status: 'failed', createdAt: old, payload: 'x' },
      { id: 'b', status: 'delivered', createdAt: old, payload: null },
      { id: 'c', status: 'failed', createdAt: new Date(), payload: 'x' },
    );
    await T.cleanupOutbox(prisma);
    expect(prisma._rows.map((r) => r.id)).toEqual(['b', 'c']);
  });

  test('Erneut senden: nur fehlgeschlagene mit Inhalt', async () => {
    const prisma = await readyPrisma();
    await submit(prisma, jest.fn().mockResolvedValue(resp(422)));
    const id = prisma._rows[0].id;
    expect(await T.retryFailed(prisma, 'gibt-es-nicht')).toBe(false);
    expect(await T.retryFailed(prisma, id)).toBe(true);
    expect(prisma._rows[0]).toMatchObject({ status: 'pending', attempts: 0 });
    expect(await T.retryFailed(prisma, id)).toBe(false); // nicht mehr "failed"
  });
});

describe('Konfiguration', () => {
  test('http:// lässt sich nicht aktivieren und nicht speichern', async () => {
    const prisma = makePrisma();
    const r = await C.applyUpdate(prisma, { baseUrl: 'http://tnt.example.de', token: TOKEN, mappings: { Anfrage: GOOD_MAPPING }, enabled: true });
    expect(r.errors.baseUrl).toMatch(/https/);
    expect(r.errors.enabled).toBeDefined();
    expect(prisma._settings.has('tnt_inquiries')).toBe(false);
    for (const bad of ['https://user:pw@tnt.example.de', 'https://tnt.example.de/?a=1', 'ftp://x.de', 'tnt.example.de']) {
      expect((await C.applyUpdate(prisma, { baseUrl: bad })).errors.baseUrl).toBeDefined();
    }
  });

  test('ohne Datenschutz-Zuordnung nicht aktivierbar', async () => {
    const prisma = makePrisma();
    const r = await C.applyUpdate(prisma, {
      baseUrl: 'https://tnt.example.de', token: TOKEN, enabled: true,
      mappings: { Anfrage: { fields: GOOD_MAPPING.fields, privacyField: '' } },
    });
    expect(r.errors.enabled).toMatch(/Datenschutz/);
    const ok = await C.applyUpdate(prisma, { baseUrl: 'https://tnt.example.de', token: TOKEN, mappings: { Anfrage: GOOD_MAPPING } });
    expect(ok.view).toMatchObject({ enabled: false, ready: true, readyReasons: [] });
  });

  test('ungültige Zuordnungen → 422-Fehler je Feld', async () => {
    const r = await C.applyUpdate(makePrisma(), { mappings: { Anfrage: { fields: { name: 'customer.evil', nope: 'customer.email' }, privacyField: 'xx' }, Fremd: {} } });
    expect(Object.keys(r.errors).sort()).toEqual(['mappings.Anfrage.name', 'mappings.Anfrage.nope', 'mappings.Anfrage.privacyField', 'mappings.Fremd']);
  });

  test('Token wird nie im Klartext ausgegeben; write-only; null löscht', async () => {
    const prisma = await readyPrisma();
    let view = await C.buildView(prisma);
    expect(view).toMatchObject({ tokenSet: true, tokenHint: '••••1234', enabled: true, ready: true });
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(view.targets.length).toBeGreaterThan(10);
    expect(view.forms[0].fields.find((f) => f.key === 'email').suggested).toBe('customer.email');
    expect(view.forms[0].suggestedPrivacyField).toBe('datenschutz');
    expect(view.forms[0].fields.map((f) => f.key)).not.toContain('hp_website');
    view = (await C.applyUpdate(prisma, { baseUrl: 'https://tnt.example.de' })).view; // Token fehlt = unverändert
    expect(view.tokenSet).toBe(true);
    expect(C.maskToken('kurz')).toBe('••••');
    const gone = await C.applyUpdate(prisma, { enabled: false, token: null });
    expect(gone.view).toMatchObject({ tokenSet: false, tokenHint: null, ready: false });
  });

  test('Verbindungstest: nur Status + Hinweis, dryRun, Alarm wird bei OK aufgehoben', async () => {
    const prisma = await readyPrisma();
    prisma._settings.set('tnt_inquiries_alert', JSON.stringify({ code: 'AUTH', since: 'x' }));
    const f = jest.fn().mockResolvedValue(resp(200));
    const r = await C.testConnection(prisma, f);
    expect(r).toEqual({ ok: true, status: 200, hint: expect.any(String) });
    expect(f.mock.calls[0][0]).toContain('?dryRun=1');
    expect(prisma._settings.has('tnt_inquiries_alert')).toBe(false);
    const bad = await C.testConnection(prisma, jest.fn().mockResolvedValue(resp(401)));
    expect(bad).toMatchObject({ ok: false, status: 401 });
    expect(JSON.stringify(bad)).not.toContain(TOKEN);
  });

  test('Env-Override hat Vorrang', async () => {
    const prisma = await readyPrisma();
    process.env.TNT_INQUIRY_TOKEN = 'env-token-0000-9999';
    process.env.TNT_BASE_URL = 'https://env.example.de';
    try {
      const v = await C.buildView(prisma);
      expect(v).toMatchObject({ baseUrl: 'https://env.example.de', tokenHint: '••••9999' });
      expect(JSON.stringify(v)).not.toContain('env-token');
    } finally {
      delete process.env.TNT_INQUIRY_TOKEN; delete process.env.TNT_BASE_URL;
    }
  });

  test('Kein Token/keine Personendaten in Logs', async () => {
    const prisma = await readyPrisma();
    const secretFail = jest.fn().mockRejectedValue(Object.assign(new Error(`boom ${TOKEN} Hans Bobmann hans@example.de`), { cause: { code: 'ECONNRESET' } }));
    const plan = await C.getForwardingPlan(prisma, 'Anfrage');
    plan.rt.fetchImpl = secretFail;
    await (await C.forwardSubmission(prisma, plan, VALUES, 'sub-9')).done;
    await T.processOutbox(prisma, new Date(Date.now() + 61_000), plan.rt);
    const out = logged.join('\n');
    expect(out).toContain('[tnt-inquiries]');
    for (const s of [TOKEN, 'Bobmann', 'hans@example.de', 'Feuershow']) expect(out).not.toContain(s);
    expect(prisma._rows[0].lastError).toBe('ECONNRESET');
  });
});
