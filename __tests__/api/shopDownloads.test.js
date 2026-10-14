/**
 * __tests__/api/shopDownloads.test.js
 * Digitale Auslieferung: Pfadsicherheit, Token-Erzeugung, Download-Route, Upload, reset/resend, Rechte.
 */

jest.disableAutomock();

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');

const mockPrisma = {
  shopOrderItem: { findMany: jest.fn() },
  shopDigitalFile: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
  shopDownloadToken: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  shopFormat: { findUnique: jest.fn() },
  shopOrder: { findUnique: jest.fn() },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/auth', () => ({
  requireAuth: jest.fn(),
  PERMISSIONS: { SHOP_PRODUCTS_VIEW: ['VIEW'], SHOP_PRODUCTS_EDIT: ['EDIT'], SHOP_ORDERS_EDIT: ['ORD'] },
}));
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }));
jest.mock('../../lib/shop/guard', () => ({ requireShopEnabled: jest.fn() }));
jest.mock('../../lib/shop/config', () => ({ isShopEnabled: jest.fn() }));
jest.mock('../../lib/shop/events', () => ({ logOrderEvent: jest.fn() }));
jest.mock('../../lib/shop/settingsStore', () => ({ getNumberSetting: jest.fn(async (k, f) => f) }));
jest.mock('../../lib/shop/orderMails', () => ({ sendDownloadsMail: jest.fn() }));
const mockForm = { parse: jest.fn() };
jest.mock('formidable', () => jest.fn(() => mockForm));

const { requireAuth } = require('../../lib/auth');
const { logAudit } = require('../../lib/audit');
const { requireShopEnabled } = require('../../lib/shop/guard');
const { isShopEnabled } = require('../../lib/shop/config');
const { logOrderEvent } = require('../../lib/shop/events');
const { sendDownloadsMail } = require('../../lib/shop/orderMails');
const dl = require('../../lib/shop/downloads');
const filesRoute = require('../../pages/api/shop/formats/[formatId]/files').default;
const fileRoute = require('../../pages/api/shop/formats/[formatId]/files/[fileId]').default;
const downloadRoute = require('../../pages/api/shop/download/[token]').default;
const ordersDl = require('../../pages/api/shop/orders/[id]/downloads').default;

let dir;
const TOKEN = 'a'.repeat(48);
const STORED = 'b'.repeat(32) + '.pdf';

function makeRes() {
  const res = new PassThrough();
  res.headers = {};
  res.chunks = [];
  res.setHeader = jest.fn((k, v) => { res.headers[k] = v; return res; });
  res.status = jest.fn((c) => { res.statusCode = c; return res; });
  res.json = jest.fn().mockReturnValue(res);
  res.on('data', (c) => res.chunks.push(c));
  return res;
}
const admin = { authorized: true, user: { id: 'u1' } };
const done = (res) => new Promise((r) => res.on('end', r));

beforeEach(() => {
  jest.resetAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopdl-'));
  process.env.SHOP_DOWNLOAD_DIR = dir;
  require('formidable').mockReturnValue(mockForm);
  requireAuth.mockResolvedValue(admin);
  requireShopEnabled.mockResolvedValue(true);
  isShopEnabled.mockResolvedValue(true);
  require('../../lib/shop/settingsStore').getNumberSetting.mockImplementation(async (k, f) => f);
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); delete process.env.SHOP_DOWNLOAD_DIR; });

describe('Pfadsicherheit', () => {
  test('resolveStoredPath akzeptiert nur Zufallsnamen', () => {
    expect(dl.resolveStoredPath(STORED)).toBe(path.join(dir, STORED));
    for (const bad of ['../x', '..\\x', '/etc/passwd', 'C:\\x.pdf', 'C:x', STORED + '/../y', 'a/' + STORED, STORED + '\u0000', '\uff0e\uff0e/' + STORED, 'b'.repeat(32) + '.pdf.exe', '', null, undefined]) {
      expect(dl.resolveStoredPath(bad)).toBeNull();
    }
  });
  test('makeStoredName: nie Originalname, sichere Endung', () => {
    expect(dl.makeStoredName('../../evil.PDF')).toMatch(/^[a-f0-9]{32}\.pdf$/);
    expect(dl.makeStoredName('a.b/c:d.tar.gz')).toMatch(/^[a-f0-9]{32}\.gz$/);
    expect(dl.makeStoredName('noext')).toMatch(/^[a-f0-9]{32}$/);
    expect(dl.makeStoredName('x.pdf\u202e')).toMatch(/^[a-f0-9]{32}\.pdf$/);
    expect(dl.makeStoredName('x.\u00e4\u00f6')).toMatch(/^[a-f0-9]{32}$/);
    expect(dl.makeStoredName('x.waytoolongext')).toMatch(/^[a-f0-9]{32}$/);
  });
  test('sanitizeFilename', () => {
    expect(dl.sanitizeFilename('..\\..\\ev/il\u0000\r\n.pdf')).toBe('il.pdf');
    expect(dl.sanitizeFilename('Regelwerk \u00fcber.pdf')).toBe('Regelwerk \u00fcber.pdf');
    expect(dl.sanitizeFilename('..')).toBe('datei');
    expect(dl.sanitizeFilename('a'.repeat(300))).toHaveLength(120);
    expect(dl.sanitizeFilename(undefined)).toBe('datei');
  });
});

describe('createDownloadTokens', () => {
  const order = { id: 'o1' };
  const file = { id: 'f1', formatId: 'fm1', filename: 'a.pdf', sizeBytes: 10 };
  beforeEach(() => {
    mockPrisma.shopDownloadToken.create.mockImplementation(async ({ data }) => data);
    mockPrisma.shopDownloadToken.findMany.mockImplementation(async (q) =>
      q.select ? [] : [{ ...file, fileId: 'f1', token: 'tok', expiresAt: new Date('2030-01-01'), maxDownloads: 5, file }]);
  });

  test('digitale Position: ein Token, Standardwerte 30 Tage / 5, Ereignis', async () => {
    mockPrisma.shopOrderItem.findMany.mockResolvedValue([{ formatId: 'fm1', digital: true, bundleItems: null }, { formatId: 'p', digital: false }]);
    mockPrisma.shopDigitalFile.findMany.mockResolvedValue([file]);
    const out = await dl.createDownloadTokens(order);
    const data = mockPrisma.shopDownloadToken.create.mock.calls[0][0].data;
    expect(data.token).toMatch(/^[a-f0-9]{48}$/);
    expect(data.maxDownloads).toBe(5);
    expect(Math.round((data.expiresAt - Date.now()) / 86400000)).toBe(30);
    expect(out).toEqual([{ fileId: 'f1', filename: 'a.pdf', sizeBytes: 10, url: '/api/shop/download/tok', expiresAt: new Date('2030-01-01'), maxDownloads: 5 }]);
    expect(logOrderEvent).toHaveBeenCalledWith('o1', 'DOWNLOAD', '1 Downloads freigegeben');
  });
  test('idempotent: vorhandener Token wird nicht neu erzeugt', async () => {
    mockPrisma.shopOrderItem.findMany.mockResolvedValue([{ formatId: 'fm1', digital: true }]);
    mockPrisma.shopDigitalFile.findMany.mockResolvedValue([file]);
    mockPrisma.shopDownloadToken.findMany.mockImplementation(async (q) =>
      q.select ? [{ fileId: 'f1' }] : [{ fileId: 'f1', token: 'tok', expiresAt: new Date(), maxDownloads: 5, file }]);
    const out = await dl.createDownloadTokens(order);
    expect(mockPrisma.shopDownloadToken.create).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
    expect(logOrderEvent).not.toHaveBeenCalled();
  });
  test('Bündel: nur digitale Bestandteile zaehlen', async () => {
    mockPrisma.shopOrderItem.findMany.mockResolvedValue([{ formatId: 'bundle', digital: false, bundleItems: [{ formatId: 'fm1', digital: true }, { formatId: 'phys', digital: false }] }]);
    mockPrisma.shopDigitalFile.findMany.mockResolvedValue([file]);
    await dl.createDownloadTokens(order);
    expect(mockPrisma.shopDigitalFile.findMany.mock.calls[0][0].where.formatId.in).toEqual(['fm1']);
  });
  test('keine Datei hinterlegt: Hinweis-Ereignis, leere Liste, kein Fehler', async () => {
    mockPrisma.shopOrderItem.findMany.mockResolvedValue([{ formatId: 'fm1', digital: true, sku: 'S' }]);
    mockPrisma.shopDigitalFile.findMany.mockResolvedValue([]);
    expect(await dl.createDownloadTokens(order)).toEqual([]);
    expect(logOrderEvent.mock.calls[0][2]).toMatch(/keine Datei/);
  });
  test('nur physische Positionen: nichts', async () => {
    mockPrisma.shopOrderItem.findMany.mockResolvedValue([{ formatId: 'x', digital: false }]);
    expect(await dl.createDownloadTokens(order)).toEqual([]);
    expect(mockPrisma.shopDigitalFile.findMany).not.toHaveBeenCalled();
  });
  test('listDownloadsForOrder liefert Zähler und remaining ohne Token-Feld', async () => {
    mockPrisma.shopDownloadToken.findMany.mockResolvedValue([{ fileId: 'f1', token: 't', downloads: 2, maxDownloads: 5, expiresAt: new Date(), file }]);
    const [l] = await dl.listDownloadsForOrder('o1');
    expect(l).toMatchObject({ downloads: 2, remaining: 3, url: '/api/shop/download/t' });
    expect(l.token).toBeUndefined();
  });
});

describe('GET /api/shop/download/[token]', () => {
  const future = new Date(Date.now() + 86400000);
  const row = (over = {}, status = 'PAID') => ({
    id: 't1', token: TOKEN, downloads: 0, maxDownloads: 5, expiresAt: future,
    file: { filename: 'Regelwerk \u00fc.pdf', storedName: STORED }, order: { status }, ...over,
  });
  let n = 0;
  const call = async (token = TOKEN) => {
    const res = makeRes();
    await downloadRoute({ method: 'GET', query: { token }, headers: { 'x-forwarded-for': `10.0.0.${++n}` } }, res);
    return res;
  };

  test('liefert Datei mit sicheren Headern und erhoeht den Zaehler bedingt', async () => {
    fs.writeFileSync(path.join(dir, STORED), 'PDFDATA');
    mockPrisma.shopDownloadToken.findUnique.mockResolvedValue(row());
    mockPrisma.shopDownloadToken.updateMany.mockResolvedValue({ count: 1 });
    const res = await call();
    await done(res);
    expect(Buffer.concat(res.chunks).toString()).toBe('PDFDATA');
    expect(res.headers['Content-Type']).toBe('application/octet-stream');
    expect(res.headers['Content-Length']).toBe('7');
    expect(res.headers['Content-Disposition']).toBe("attachment; filename*=UTF-8''Regelwerk%20%C3%BC.pdf");
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['Cache-Control']).toBe('no-store');
    const w = mockPrisma.shopDownloadToken.updateMany.mock.calls[0][0];
    expect(w.where).toMatchObject({ id: 't1', downloads: { lt: 5 } });
    expect(w.data.downloads).toEqual({ increment: 1 });
  });
  test('Kopfzeilen-Injection im Dateinamen wird kodiert', async () => {
    fs.writeFileSync(path.join(dir, STORED), 'x');
    mockPrisma.shopDownloadToken.findUnique.mockResolvedValue(row({ file: { filename: 'a"\r\nX-Evil: 1.pdf', storedName: STORED } }));
    mockPrisma.shopDownloadToken.updateMany.mockResolvedValue({ count: 1 });
    const res = await call();
    await done(res);
    expect(res.headers['Content-Disposition']).not.toMatch(/[\r\n"]/);
  });
  test('unbekannt / ungueltiges Format -> 404', async () => {
    mockPrisma.shopDownloadToken.findUnique.mockResolvedValue(null);
    expect((await call()).status).toHaveBeenCalledWith(404);
    expect((await call('../x')).status).toHaveBeenCalledWith(404);
  });
  test('abgelaufen und Limit -> 410, kein Zaehler', async () => {
    mockPrisma.shopDownloadToken.findUnique.mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1000) }));
    expect((await call()).status).toHaveBeenCalledWith(410);
    mockPrisma.shopDownloadToken.findUnique.mockResolvedValue(row({ downloads: 5 }));
    expect((await call()).status).toHaveBeenCalledWith(410);
    expect(mockPrisma.shopDownloadToken.updateMany).not.toHaveBeenCalled();
  });
  test.each(['PENDING', 'REFUNDED', 'CANCELLED', 'FAILED'])('Bestellstatus %s -> 403', async (s) => {
    mockPrisma.shopDownloadToken.findUnique.mockResolvedValue(row({}, s));
    expect((await call()).status).toHaveBeenCalledWith(403);
    expect(mockPrisma.shopDownloadToken.updateMany).not.toHaveBeenCalled();
  });
  test('SHIPPED ist erlaubt', async () => {
    fs.writeFileSync(path.join(dir, STORED), 'x');
    mockPrisma.shopDownloadToken.findUnique.mockResolvedValue(row({}, 'SHIPPED'));
    mockPrisma.shopDownloadToken.updateMany.mockResolvedValue({ count: 1 });
    const res = await call();
    await done(res);
    expect(res.statusCode).toBe(200);
  });
  test('Parallelitaet: bedingtes Update verliert -> 410, nichts gestreamt', async () => {
    mockPrisma.shopDownloadToken.findUnique.mockResolvedValue(row({ downloads: 4 }));
    mockPrisma.shopDownloadToken.updateMany.mockResolvedValue({ count: 0 });
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.headers['Content-Disposition']).toBeUndefined();
  });
  test('Datei fehlt -> 404 und Zaehler wird zurueckgegeben', async () => {
    mockPrisma.shopDownloadToken.findUnique.mockResolvedValue(row());
    mockPrisma.shopDownloadToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.shopDownloadToken.update.mockResolvedValue({});
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.shopDownloadToken.update.mock.calls[0][0].data).toEqual({ downloads: { decrement: 1 } });
  });
  test('Add-on aus -> 404; Rate-Limit 30/min -> 429', async () => {
    isShopEnabled.mockResolvedValue(false);
    expect((await call()).status).toHaveBeenCalledWith(404);
    isShopEnabled.mockResolvedValue(true);
    mockPrisma.shopDownloadToken.findUnique.mockResolvedValue(null);
    const req = { method: 'GET', query: { token: TOKEN }, headers: { 'x-forwarded-for': '9.9.9.9' } };
    let last;
    for (let i = 0; i < 31; i++) { last = makeRes(); await downloadRoute(req, last); }
    expect(last.status).toHaveBeenCalledWith(429);
  });
});

describe('Dateien je Format (Upload/Liste/Loeschen)', () => {
  const upload = (over = {}) => ({
    newFilename: STORED, filepath: path.join(dir, STORED), originalFilename: '../../Regel\u00fc.pdf', size: 7, mimetype: 'text/html', ...over,
  });
  const post = (res) => filesRoute({ method: 'POST', query: { formatId: 'fm1' } }, res);

  test('Rechte: GET = VIEW, POST = EDIT; Auth-Fehler und Add-on aus', async () => {
    mockPrisma.shopFormat.findUnique.mockResolvedValue({ id: 'fm1', digital: true });
    mockPrisma.shopDigitalFile.findMany.mockResolvedValue([]);
    await filesRoute({ method: 'GET', query: { formatId: 'fm1' } }, makeRes());
    expect(requireAuth.mock.calls[0][2]).toEqual(['VIEW']);
    mockForm.parse.mockImplementation((req, cb) => cb(null, {}, {}));
    await post(makeRes());
    expect(requireAuth.mock.calls[1][2]).toEqual(['EDIT']);
    requireAuth.mockResolvedValue({ authorized: false, error: 'x', status: 403 });
    const r = makeRes();
    await post(r);
    expect(r.status).toHaveBeenCalledWith(403);
    requireAuth.mockResolvedValue(admin);
    requireShopEnabled.mockResolvedValue(false);
    mockPrisma.shopFormat.findUnique.mockClear();
    await post(makeRes());
    expect(mockPrisma.shopFormat.findUnique).not.toHaveBeenCalled();
  });
  test('Format unbekannt 404, nicht digital 422', async () => {
    mockPrisma.shopFormat.findUnique.mockResolvedValue(null);
    let r = makeRes();
    await post(r);
    expect(r.status).toHaveBeenCalledWith(404);
    mockPrisma.shopFormat.findUnique.mockResolvedValue({ id: 'fm1', digital: false });
    r = makeRes();
    await post(r);
    expect(r.status).toHaveBeenCalledWith(422);
    expect(mockForm.parse).not.toHaveBeenCalled();
  });
  test('Upload speichert bereinigte Metadaten, Audit, 201', async () => {
    mockPrisma.shopFormat.findUnique.mockResolvedValue({ id: 'fm1', digital: true });
    mockForm.parse.mockImplementation((req, cb) => cb(null, {}, { file: [upload()] }));
    mockPrisma.shopDigitalFile.create.mockImplementation(async ({ data }) => ({ id: 'f9', createdAt: new Date(), ...data }));
    const r = makeRes();
    await post(r);
    const data = mockPrisma.shopDigitalFile.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ formatId: 'fm1', filename: 'Regel\u00fc.pdf', storedName: STORED, sizeBytes: 7 });
    expect(r.status).toHaveBeenCalledWith(201);
    expect(logAudit.mock.calls[0][0].action).toBe('shop.file.upload');
  });
  test('mehr als eine Datei -> 400 und aufgeraeumt', async () => {
    mockPrisma.shopFormat.findUnique.mockResolvedValue({ id: 'fm1', digital: true });
    fs.writeFileSync(path.join(dir, STORED), 'x');
    mockForm.parse.mockImplementation((req, cb) => cb(null, {}, { a: [upload()], b: [upload({ newFilename: 'c'.repeat(32) })] }));
    const r = makeRes();
    await post(r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(fs.existsSync(path.join(dir, STORED))).toBe(false);
  });
  test('zu gross -> 413', async () => {
    mockPrisma.shopFormat.findUnique.mockResolvedValue({ id: 'fm1', digital: true });
    mockForm.parse.mockImplementation((req, cb) => cb(Object.assign(new Error('options.maxFileSize exceeded'), { httpCode: 413 })));
    const r = makeRes();
    await post(r);
    expect(r.status).toHaveBeenCalledWith(413);
  });
  test('GET Liste', async () => {
    mockPrisma.shopFormat.findUnique.mockResolvedValue({ id: 'fm1', digital: true });
    mockPrisma.shopDigitalFile.findMany.mockResolvedValue([{ id: 'f1', filename: 'a.pdf', sizeBytes: 3, createdAt: new Date(0), storedName: 'x', _count: { tokens: 2 } }]);
    const r = makeRes();
    await filesRoute({ method: 'GET', query: { formatId: 'fm1' } }, r);
    expect(r.json.mock.calls[0][0].files[0]).toEqual({ id: 'f1', filename: 'a.pdf', sizeBytes: 3, createdAt: new Date(0), tokenCount: 2 });
  });
  test('DELETE entfernt Zeile und Datei, Fehler beim Entfernen schadet nicht', async () => {
    fs.writeFileSync(path.join(dir, STORED), 'x');
    mockPrisma.shopDigitalFile.findFirst.mockResolvedValue({ id: 'f1', filename: 'a.pdf', storedName: STORED });
    mockPrisma.shopDigitalFile.delete.mockResolvedValue({});
    const r = makeRes();
    await fileRoute({ method: 'DELETE', query: { formatId: 'fm1', fileId: 'f1' } }, r);
    expect(fs.existsSync(path.join(dir, STORED))).toBe(false);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(logAudit.mock.calls[0][0].action).toBe('shop.file.delete');
    // Datei existiert nicht mehr: trotzdem 200
    const r2 = makeRes();
    await fileRoute({ method: 'DELETE', query: { formatId: 'fm1', fileId: 'f1' } }, r2);
    expect(r2.status).toHaveBeenCalledWith(200);
    mockPrisma.shopDigitalFile.findFirst.mockResolvedValue(null);
    const r3 = makeRes();
    await fileRoute({ method: 'DELETE', query: { formatId: 'fm1', fileId: 'zz' } }, r3);
    expect(r3.status).toHaveBeenCalledWith(404);
  });
});

describe('POST /api/shop/orders/[id]/downloads', () => {
  const call = (body) => { const r = makeRes(); return ordersDl({ method: 'POST', query: { id: 'o1' }, body }, r).then(() => r); };
  beforeEach(() => mockPrisma.shopOrder.findUnique.mockResolvedValue({ id: 'o1', reference: 'ORD-1' }));

  test('braucht SHOP_ORDERS_EDIT; ungueltige Aktion 422', async () => {
    const r = await call({ action: 'x' });
    expect(requireAuth.mock.calls[0][2]).toEqual(['ORD']);
    expect(r.status).toHaveBeenCalledWith(422);
  });
  test('reset setzt Zaehler und Ablauf, Ereignis', async () => {
    mockPrisma.shopDownloadToken.updateMany.mockResolvedValue({ count: 2 });
    const r = await call({ action: 'reset' });
    const d = mockPrisma.shopDownloadToken.updateMany.mock.calls[0][0];
    expect(d.where).toEqual({ orderId: 'o1' });
    expect(d.data.downloads).toBe(0);
    expect(d.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(logOrderEvent).toHaveBeenCalledWith('o1', 'DOWNLOAD', expect.any(String), { userId: 'u1' });
    expect(r.json).toHaveBeenCalledWith({ ok: true, count: 2 });
  });
  test('resend mailt Links, Ereignis MAIL; Mailfehler -> mailError', async () => {
    mockPrisma.shopDownloadToken.findMany.mockResolvedValue([{ fileId: 'f1', token: 't', downloads: 0, maxDownloads: 5, expiresAt: new Date(), file: { filename: 'a', sizeBytes: 1 } }]);
    let r = await call({ action: 'resend' });
    expect(sendDownloadsMail.mock.calls[0][1][0].url).toBe('/api/shop/download/t');
    expect(logOrderEvent.mock.calls[0][1]).toBe('MAIL');
    expect(r.json).toHaveBeenCalledWith({ ok: true, count: 1, mailError: false });
    sendDownloadsMail.mockRejectedValue(new Error('smtp'));
    r = await call({ action: 'resend' });
    expect(r.json.mock.calls[0][0].mailError).toBe(true);
  });
  test('resend ohne Downloads -> 409', async () => {
    mockPrisma.shopDownloadToken.findMany.mockResolvedValue([]);
    expect((await call({ action: 'resend' })).status).toHaveBeenCalledWith(409);
    expect(sendDownloadsMail).not.toHaveBeenCalled();
  });
});
