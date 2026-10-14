/**
 * Paginiertes Datei-Listing (lib/fileListing.js) + Thumbnail-Endpoint.
 */
jest.disableAutomock();

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { UPLOAD_DIR, scanUploads, queryFiles, invalidateFileCache, fileCategory } = require('../lib/fileListing');

const DIR = path.join(UPLOAD_DIR, '__listing_test');

beforeAll(async () => {
  fs.mkdirSync(path.join(DIR, 'sub'), { recursive: true });
  await sharp({ create: { width: 800, height: 600, channels: 3, background: '#f00' } }).jpeg().toFile(path.join(DIR, 'b_foto.jpg'));
  fs.writeFileSync(path.join(DIR, 'a_doc.pdf'), 'x'.repeat(50));
  fs.writeFileSync(path.join(DIR, 'b_foto_small.jpg'), 'variante');
  fs.writeFileSync(path.join(DIR, 'sub', 'c.zip'), 'zz');
  invalidateFileCache();
});
afterAll(() => { fs.rmSync(DIR, { recursive: true, force: true }); invalidateFileCache(); });

test('Kategorien', () => {
  expect(fileCategory('.JPG')).toBe('image');
  expect(fileCategory('.pdf')).toBe('document');
  expect(fileCategory('.xyz')).toBe('other');
});

test('Suche, Typfilter, Sortierung, Paging, Varianten ausgeblendet', async () => {
  const all = await scanUploads();
  const mine = all.filter((f) => f.filename.startsWith('__listing_test/'));
  expect(mine.map((f) => f.name).sort()).toEqual(['a_doc.pdf', 'b_foto.jpg', 'c.zip']);

  const base = { folder: '__listing_test' };
  expect(queryFiles(all, { ...base, q: 'FOTO' }).total).toBe(1);
  expect(queryFiles(all, { ...base, types: 'document,archive' }).total).toBe(2);
  expect(queryFiles(all, { ...base, sort: 'size', dir: 'desc' }).files[0].name).toBe('b_foto.jpg');
  const p2 = queryFiles(all, { ...base, pageSize: 2, page: 2 });
  expect(p2.files).toHaveLength(1);
  expect(p2.total).toBe(3);
  expect(queryFiles(all, { ...base, createdWithin: 'today' }).total).toBe(3);
  expect(queryFiles(all, base).files.find((f) => f.name === 'b_foto.jpg').thumbUrl).toMatch(/^\/api\/files\/thumb\?url=/);
  expect(queryFiles(all, { pageSize: 9999 }).pageSize).toBe(200);
});

test('Thumbnail-Endpoint: verkleinert, Traversal blockiert, PDF -> Redirect', async () => {
  const handler = require('../pages/api/files/thumb').default;
  const run = async (query) => {
    const r = { code: 0, headers: {}, body: null, loc: null };
    const res = {
      setHeader: (k, v) => { r.headers[k] = v; },
      status(c) { r.code = c; return this; },
      json(b) { r.body = b; return this; },
      send(b) { r.body = b; return this; },
      redirect(c, l) { r.code = c; r.loc = l; return this; },
    };
    await handler({ method: 'GET', query }, res);
    return r;
  };
  const ok = await run({ url: '/uploads/__listing_test/b_foto.jpg', w: '100' });
  expect(ok.code).toBe(200);
  expect((await sharp(ok.body).metadata()).width).toBe(100);
  expect((await run({ url: '/uploads/../package.json' })).code).toBe(400);
  expect((await run({ url: '/uploads/__listing_test/a_doc.pdf' })).code).toBe(302);
  expect((await run({ url: '/uploads/__listing_test/fehlt.jpg' })).code).toBe(404);
});
