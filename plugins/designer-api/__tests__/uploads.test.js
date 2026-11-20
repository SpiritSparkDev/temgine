import { signToken } from '../lib/tokens';
import { createRoutes } from '../lib/api';
import { cleanFileName, cleanFolder, sniff, CHUNK_SIZE } from '../lib/uploads';

function fakeCore(role = 'ADMIN') {
  const files = new Map();
  const audits = [];
  const core = {
    roles: { view: ['ADMIN'], edit: ['ADMIN'], delete: ['ADMIN'], cssView: ['ADMIN'], cssEdit: ['ADMIN'], cssDelete: ['ADMIN'], filesView: ['ADMIN'], upload: ['ADMIN'] },
    secret: () => 'geheim', now: () => Date.now(), version: '0.66.0', bcrypt: {}, store: {}, externCss: {}, sectionProviders: () => ({}),
    listUploads: () => [],
    uploads: {
      maxFileSize: 10 * 1024 * 1024,
      listFolders: () => ['a'],
      commit: async (folder, name, buf) => { const rel = folder ? `${folder}/${name}` : name; files.set(rel, buf); return { name, path: rel, url: `/uploads/${rel}` }; },
    },
    audit: async (a) => audits.push(a),
  };
  return { core, files, audits, role };
}

const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const jpeg = (n) => Buffer.concat([JPEG_HEAD, Buffer.alloc(n - 4, 7)]);

function setup(role = 'ADMIN', sub = 'u1') {
  const f = fakeCore();
  const routes = createRoutes(f.core);
  const token = signToken({ sub, name: 'A', role }, 'geheim', undefined, Date.now()).token;
  const call = async (key, { body, params = {} } = {}) => {
    const res = { code: 200, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } };
    await routes[key].handler({ body, headers: { authorization: `Bearer ${token}`, 'x-designer-api': '1,2' } }, res, { params, query: {}, log: { error() {} } });
    return res;
  };
  // kompletter Ablauf; parts = Liste der Indizes, die gesendet werden (Standard alle)
  const send = async (buf, { name = 'foto.jpg', folder = '', only } = {}) => {
    const init = await call('POST v1/assets/uploads', { body: { name, size: buf.length, folder } });
    if (init.code !== 201) return { init };
    const id = init.body.uploadId;
    const n = init.body.parts;
    for (let i = 0; i < n; i++) {
      if (only && !only.includes(i)) continue;
      const put = await call('PUT v1/assets/uploads/:id/:index', { params: { id, index: String(i) }, body: { data: buf.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).toString('base64') } });
      expect(put.code).toBe(200);
    }
    return { init, id };
  };
  const done = (id) => call('POST v1/assets/uploads/:id/complete', { params: { id } });
  return { f, call, send, done };
}

test('capabilities: Feature assets-upload; Teile passen unter das 1-MB-Limit', async () => {
  const { call } = setup();
  const caps = await call('GET v1/capabilities');
  expect(caps.body.features).toContain('assets-upload');
  expect(Math.ceil(CHUNK_SIZE / 3) * 4 + 200).toBeLessThan(1024 * 1024);
});

test('5-MB-JPEG: Zusammenbau aus Teilen ≤ 700 KB ist byte-genau, Audit-Eintrag, Name bereinigt', async () => {
  const { f, send, done } = setup();
  const buf = jpeg(5 * 1024 * 1024);
  const { init, id } = await send(buf, { name: 'Mein Bild ö.PHP.JPG', folder: 'galerie/2026' });
  expect(init.body.chunkSize).toBeLessThanOrEqual(700 * 1024);
  expect(init.body.parts).toBe(Math.ceil(buf.length / CHUNK_SIZE));
  const r = await done(id);
  expect(r.code).toBe(201);
  expect(r.body).toMatchObject({ name: 'Mein_Bild_oe_PHP.jpg', path: 'galerie/2026/Mein_Bild_oe_PHP.jpg', size: buf.length });
  expect(f.files.get(r.body.path).equals(buf)).toBe(true);
  expect(f.audits).toEqual([expect.objectContaining({ action: 'designer.asset.upload', resourceId: r.body.path })]);
});

test('unzulässige Typen: .exe, .html, ohne Endung, Doppelendung mit falschem Inhalt', async () => {
  const { f, call, send, done } = setup();
  for (const name of ['virus.exe', 'seite.html', 'datei', 'a.jpg.exe', '.jpg', 'x.php']) {
    const r = await call('POST v1/assets/uploads', { body: { name, size: 10 } });
    expect([name, r.code, r.body.code]).toEqual([name, 415, 'UPLOAD_TYPE_NOT_ALLOWED']);
  }
  // EXE als .jpg getarnt: Magic Bytes passen nicht
  const { id } = await send(Buffer.from('MZ\x90\x00 programm'), { name: 'tarn.jpg' });
  const r = await done(id);
  expect([r.code, r.body.code]).toEqual([415, 'UPLOAD_CONTENT_REJECTED']);
  // HTML als .png getarnt
  const h = await send(Buffer.from('<html><script>alert(1)</script></html>'), { name: 'h.png' });
  expect((await done(h.id)).code).toBe(415);
  expect(f.files.size).toBe(0);
});

test('SVG: harmlose Datei ok, Skript/Ereignis/javascript:/foreignObject/externe Verweise abgelehnt', () => {
  const svg = (inner, attrs = '') => Buffer.from(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`);
  expect(sniff(svg('<rect width="1" height="1"/><image href="data:image/png;base64,AAAA"/>'), 'svg')).toBeNull();
  for (const bad of [
    svg('<script>alert(1)</script>'), svg('<rect/>', 'onload="alert(1)"'), svg('<a href="javascript:alert(1)"><rect/></a>'),
    svg('<foreignObject><div/></foreignObject>'), svg('<image href="https://evil.example/x.png"/>'), svg('<a xlink:href="data:text/html,x"><rect/></a>'),
    svg('<style>@import "x.css";</style>'), svg('<a href="&#106;avascript:alert(1)"/>'), Buffer.from('<html><svg></svg></html>'),
  ]) expect(sniff(bad, 'svg')).toEqual(expect.any(String));
});

test('Ordner: Pfadausbruch, Laufwerke, Tiefe abgelehnt', async () => {
  for (const bad of ['../x', 'a/../../b', '..', 'C:/Windows', 'a/./b', 'a\\..\\b', 'a/b/c/d/e/f', 'x\u0000y']) expect([bad, cleanFolder(bad).error ? 'fehler' : 'ok']).toEqual([bad, 'fehler']);
  expect(cleanFolder('').folder).toBe('');
  expect(cleanFolder('/etc').folder).toBe('etc'); // führender Schrägstrich = relativ zu public/uploads, kein Systempfad
  expect(cleanFolder('/galerie//2026/').folder).toBe('galerie/2026');
  const { f, call } = setup();
  const r = await call('POST v1/assets/uploads', { body: { name: 'a.png', size: 5, folder: '../../etc' } });
  expect([r.code, r.body.errors[0].path]).toEqual([400, 'folder']);
  expect(f.files.size).toBe(0);
  expect(cleanFileName('../../evil/..\\x.png').name).toBe('x.png');
});

test('Größe: zu groß (413), ungültig (400), Teilgröße falsch (400), unvollständig (409)', async () => {
  const { call, send, done } = setup();
  expect((await call('POST v1/assets/uploads', { body: { name: 'a.jpg', size: 10 * 1024 * 1024 + 1 } })).body.code).toBe('FILE_TOO_LARGE');
  expect((await call('POST v1/assets/uploads', { body: { name: 'a.jpg', size: 0 } })).code).toBe(400);
  expect((await call('POST v1/assets/uploads', { body: { name: 'a.jpg', size: '5' } })).code).toBe(400);
  const init = await call('POST v1/assets/uploads', { body: { name: 'a.jpg', size: CHUNK_SIZE + 10 } });
  const id = init.body.uploadId;
  const bad = await call('PUT v1/assets/uploads/:id/:index', { params: { id, index: '0' }, body: { data: Buffer.alloc(100).toString('base64') } });
  expect(bad.body.code).toBe('CHUNK_SIZE_MISMATCH');
  const oob = await call('PUT v1/assets/uploads/:id/:index', { params: { id, index: '5' }, body: { data: 'AAAA' } });
  expect(oob.code).toBe(400);
  const nob64 = await call('PUT v1/assets/uploads/:id/:index', { params: { id, index: '0' }, body: { data: '<<<' } });
  expect(nob64.code).toBe(400);
  const huge = await call('PUT v1/assets/uploads/:id/:index', { params: { id, index: '0' }, body: { data: 'A'.repeat(1_000_000) } });
  expect(huge.code).toBe(400);
  const inc = await done(id);
  expect([inc.code, inc.body.code, inc.body.missing]).toEqual([409, 'UPLOAD_INCOMPLETE', [0, 1]]);
  await send(jpeg(100)); // Rest bleibt unberührt
});

test('Wiederaufnahme: Status nennt vorhandene Teile, Rest nachsenden, Teil wiederholbar; Abbruch hinterlässt nichts', async () => {
  const { f, call, send, done } = setup();
  const buf = jpeg(2 * CHUNK_SIZE + 123);
  const { id } = await send(buf, { only: [0, 2] });
  const st = await call('GET v1/assets/uploads/:id', { params: { id } });
  expect(st.body).toMatchObject({ parts: 3, received: [0, 2] });
  expect((await done(id)).code).toBe(409);
  for (const i of [1, 1]) { // zweimal: idempotent
    expect((await call('PUT v1/assets/uploads/:id/:index', { params: { id, index: String(i) }, body: { data: buf.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).toString('base64') } })).code).toBe(200);
  }
  const ok = await done(id);
  expect(ok.code).toBe(201);
  expect(f.files.get(ok.body.path).equals(buf)).toBe(true);
  // nach Abschluss ist die Sitzung weg
  expect((await call('GET v1/assets/uploads/:id', { params: { id } })).code).toBe(404);

  const before = f.files.size;
  const a = await send(buf, { only: [0, 1] });
  expect((await call('DELETE v1/assets/uploads/:id', { params: { id: a.id } })).body.aborted).toBe(true);
  expect((await done(a.id)).code).toBe(404);
  expect(f.files.size).toBe(before); // nichts geschrieben
});

test('Berechtigung und Besitz: ohne Schreibrolle 403, fremde Sitzung 404, ohne Token 401', async () => {
  const f = fakeCore();
  f.core.roles.upload = ['ADMIN'];
  const routes = createRoutes(f.core);
  const run = async (key, role, sub, params = {}, body = { name: 'a.png', size: 5 }) => {
    const token = signToken({ sub, name: 'A', role }, 'geheim', undefined, Date.now()).token;
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader() {} };
    await routes[key].handler({ body, headers: { authorization: role ? `Bearer ${token}` : '' } }, res, { params, query: {}, log: { error() {} } });
    return res;
  };
  expect((await run('POST v1/assets/uploads', 'EDITOR', 'u2')).code).toBe(403);
  expect((await run('POST v1/assets/uploads', null, 'u2')).code).toBe(401);
  expect((await run('GET v1/assets/folders', 'EDITOR', 'u2')).code).toBe(403);
  const init = await run('POST v1/assets/uploads', 'ADMIN', 'u1');
  expect(init.code).toBe(201);
  expect((await run('GET v1/assets/uploads/:id', 'ADMIN', 'u9', { id: init.body.uploadId })).code).toBe(404);
  expect((await run('GET v1/assets/folders', 'ADMIN', 'u1')).body).toEqual({ folders: ['a'] });
});
