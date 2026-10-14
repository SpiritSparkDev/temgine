/**
 * __tests__/api/import-zip.test.js
 * POST /api/admin/import-zip — Projekttransfer-ZIP wird roh hochgeladen und
 * serverseitig entpackt. Upload-Dateien gehen als Binärdaten (getBuffer) an
 * runImport, nicht mehr als Base64-String im JSON (scheiterte bei großen
 * Videos an der maximalen String-Länge).
 */

jest.disableAutomock();

const { Readable } = require('stream');
const JSZip = require('jszip');

const mockRequireAuth = jest.fn();
jest.mock('../../lib/auth', () => ({ requireAuth: (...args) => mockRequireAuth(...args) }));

const mockRunImport = jest.fn();
jest.mock('../../pages/api/admin/import', () => ({ runImport: (...args) => mockRunImport(...args) }));

const { default: handler, readRequestBody } = require('../../pages/api/admin/import-zip');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

function makeReq(buffer, { method = 'POST', strategy = 'merge' } = {}) {
  const req = Readable.from(buffer.length ? [buffer] : []);
  req.method = method;
  req.query = { strategy };
  req.headers = { 'content-type': 'application/zip' };
  return req;
}

async function buildZip(manifest, extra = {}) {
  const zip = new JSZip();
  zip.file('manifest/projekt.json', JSON.stringify(manifest));
  zip.file('templates/Hero.html', '<div></div>');
  for (const [name, content] of Object.entries(extra)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ authorized: true, user: { id: 'admin-1', role: 'ADMIN' } });
  mockRunImport.mockResolvedValue({ ok: true, importStats: { uploadedFiles: 1 } });
});

test('unpacks the ZIP on the server and hands uploads to runImport as binary data', async () => {
  const video = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0xff, 0x01]);
  const font = Buffer.from('fake-font');
  const manifest = { metadata: { filesIncluded: ['pages', 'uploadedFiles'] }, pages: [{ slug: 'home' }] };
  const res = makeRes();

  await handler(makeReq(await buildZip(manifest, { 'uploads/tnt/video/teaser.mp4': video, 'uploads-fonts/brand.ttf': font })), res);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(mockRunImport).toHaveBeenCalledTimes(1);
  const [data, strategy] = mockRunImport.mock.calls[0];
  expect(strategy).toBe('merge');
  expect(data.pages).toEqual([{ slug: 'home' }]);
  expect(data.uploadedFiles.map((f) => f.path)).toEqual(['tnt/video/teaser.mp4']);
  expect(data.uploadFonts.map((f) => f.path)).toEqual(['brand.ttf']);
  expect(data.uploadedFiles[0].content).toBeUndefined();
  expect(Buffer.compare(await data.uploadedFiles[0].getBuffer(), video)).toBe(0);
  expect(Buffer.compare(await data.uploadFonts[0].getBuffer(), font)).toBe(0);
});

test('passes the "replace" strategy through', async () => {
  const res = makeRes();
  await handler(makeReq(await buildZip({ metadata: { filesIncluded: ['pages'] } }), { strategy: 'replace' }), res);
  expect(mockRunImport.mock.calls[0][1]).toBe('replace');
});

test('rejects static-site ZIPs with 400', async () => {
  const res = makeRes();
  await handler(makeReq(await buildZip({ metadata: { exportType: 'static-site' } })), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockRunImport).not.toHaveBeenCalled();
});

test('rejects a ZIP without JSON manifest with 400', async () => {
  const zip = new JSZip();
  zip.file('uploads/a.png', 'x');
  const res = makeRes();
  await handler(makeReq(await zip.generateAsync({ type: 'nodebuffer' })), res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test('rejects an empty body with 400 and an invalid strategy with 400', async () => {
  let res = makeRes();
  await handler(makeReq(Buffer.alloc(0)), res);
  expect(res.status).toHaveBeenCalledWith(400);

  res = makeRes();
  await handler(makeReq(await buildZip({ metadata: {} }), { strategy: 'wipe' }), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockRunImport).not.toHaveBeenCalled();
});

test('requires ADMIN auth and POST', async () => {
  mockRequireAuth.mockResolvedValueOnce({ authorized: false, status: 403, error: 'Forbidden' });
  let res = makeRes();
  await handler(makeReq(await buildZip({ metadata: {} })), res);
  expect(res.status).toHaveBeenCalledWith(403);

  res = makeRes();
  await handler(makeReq(Buffer.alloc(0), { method: 'GET' }), res);
  expect(res.status).toHaveBeenCalledWith(405);
  expect(mockRunImport).not.toHaveBeenCalled();
});

test('readRequestBody enforces the size limit (413)', async () => {
  const req = Readable.from([Buffer.alloc(10), Buffer.alloc(10)]);
  await expect(readRequestBody(req, 15)).rejects.toMatchObject({ status: 413 });
});
