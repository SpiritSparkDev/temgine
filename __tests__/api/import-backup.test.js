/**
 * __tests__/api/import-backup.test.js
 * Tests für POST /api/admin/import — insbesondere:
 *  - Blog-Channels/-Beiträge werden importiert (neue Kategorie "blog")
 *  - Bei "Ersetzen" wird nur gelöscht, was laut metadata.filesIncluded auch
 *    tatsächlich im Backup enthalten ist (Kategorien auswählbar per Checkbox,
 *    siehe lib/backupCategories.js) — eine fehlende Kategorie darf nie als
 *    "leeren" interpretiert werden.
 */

jest.disableAutomock();

// sanitize-html zieht ein ESM-only Paket nach — in Tests immer mocken (siehe
// die bekannten, vorbestehenden Failures in page-save.test.js/pages-slots.test.js).
jest.mock('../../lib/htmlSanitize', () => ({ sanitizeRecursive: (v) => v }));

const mockPrisma = {
  snippet: { deleteMany: jest.fn(), upsert: jest.fn().mockResolvedValue({}) },
  page: { deleteMany: jest.fn(), upsert: jest.fn().mockResolvedValue({}) },
  blogChannel: {
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  blogPost: {
    deleteMany: jest.fn(),
    upsert: jest.fn().mockResolvedValue({}),
  },
  globalVariable: { deleteMany: jest.fn(), upsert: jest.fn().mockResolvedValue({}) },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));

const mockRequireAuth = jest.fn().mockResolvedValue({ authorized: true, user: { id: 'admin-1', role: 'ADMIN' } });
jest.mock('../../lib/auth', () => ({ requireAuth: (...args) => mockRequireAuth(...args) }));

jest.mock('../../lib/templateStore', () => ({
  listTemplates: jest.fn().mockReturnValue([]),
  saveTemplate: jest.fn(),
  deleteTemplateByName: jest.fn(),
}));
jest.mock('../../lib/navigationStore', () => ({
  listNavigations: jest.fn().mockReturnValue([]),
  saveNavigation: jest.fn(),
  deleteNavigation: jest.fn(),
}));
jest.mock('../../lib/footerStore', () => ({
  listFooters: jest.fn().mockReturnValue([]),
  saveFooter: jest.fn(),
  deleteFooter: jest.fn(),
}));
jest.mock('../../lib/maintenanceStore', () => ({
  MAINTENANCE_PAGES: { '404': 'maintenance_404' },
  saveMaintenanceField: jest.fn(),
}));

// import.js's CSS/upload-fonts/upload-files importers touch the real
// filesystem (public/extern_css, public/uploads) — including, in "replace"
// mode, deleting existing files there. Mock fs completely so these tests can
// never write to or delete from the actual checkout.
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue('{}'),
  readdirSync: jest.fn().mockReturnValue([]),
  unlinkSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

// CSS/JS-Manager-Dateien: echtes mergeExternConfig, Datei-Import nur beobachten
const mockImportExternFiles = jest.fn().mockReturnValue({ imported: 0, errors: [], writtenFiles: [] });
jest.mock('../../lib/externFiles', () => ({
  ...jest.requireActual('../../lib/externFiles'),
  importExternFiles: (...args) => mockImportExternFiles(...args),
}));

const handler = require('../../pages/api/admin/import').default;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

function makeReq(body, strategy = 'merge') {
  return { method: 'POST', query: { strategy }, body };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ authorized: true, user: { id: 'admin-1', role: 'ADMIN' } });
  mockImportExternFiles.mockReturnValue({ imported: 0, errors: [], writtenFiles: [] });
  mockPrisma.blogChannel.upsert.mockImplementation(({ create }) => Promise.resolve({ id: `new-${create.slug}`, slug: create.slug }));
});

describe('POST /api/admin/import — blog category', () => {
  test('imports blog channels and posts, remapping channelId to the newly upserted channel', async () => {
    const body = {
      metadata: { filesIncluded: ['blog'] },
      blogChannels: [{ id: 'old-channel-1', slug: 'news', name: 'News' }],
      blogPosts: [{ channelId: 'old-channel-1', slug: 'hello-world', title: 'Hello World', status: 'PUBLISHED' }],
    };
    const res = makeRes();
    await handler(makeReq(body, 'merge'), res);

    expect(mockPrisma.blogChannel.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'news' } }));
    expect(mockPrisma.blogPost.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelId_slug: { channelId: 'new-news', slug: 'hello-world' } },
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.importStats.blogChannels).toBe(1);
    expect(payload.importStats.blogPosts).toBe(1);
  });

  test('skips a post whose channel is not present in the backup', async () => {
    const body = {
      metadata: { filesIncluded: ['blog'] },
      blogChannels: [],
      blogPosts: [{ channelId: 'missing-channel', slug: 'orphan' }],
    };
    const res = makeRes();
    await handler(makeReq(body, 'merge'), res);
    expect(mockPrisma.blogPost.upsert).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.importStats.errors.some((e) => e.includes('orphan'))).toBe(true);
  });
});

describe('POST /api/admin/import — "Ersetzen" only wipes categories the backup actually includes', () => {
  test('filesIncluded=["snippets"]: wipes snippets, but never pages or blog', async () => {
    const body = {
      metadata: { filesIncluded: ['snippets'] },
      snippets: [{ label: 'foo', snippet: 'bar' }],
      pages: [],
      blogChannels: [],
      blogPosts: [],
    };
    const res = makeRes();
    await handler(makeReq(body, 'replace'), res);

    expect(mockPrisma.snippet.deleteMany).toHaveBeenCalledWith({});
    expect(mockPrisma.page.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.blogChannel.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.blogPost.deleteMany).not.toHaveBeenCalled();
  });

  test('filesIncluded=["blog"]: wipes blog, but never pages or snippets', async () => {
    const body = {
      metadata: { filesIncluded: ['blog'] },
      pages: [],
      snippets: [],
      blogChannels: [],
      blogPosts: [],
    };
    const res = makeRes();
    await handler(makeReq(body, 'replace'), res);

    expect(mockPrisma.blogChannel.deleteMany).toHaveBeenCalledWith({});
    expect(mockPrisma.blogPost.deleteMany).toHaveBeenCalledWith({});
    expect(mockPrisma.page.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.snippet.deleteMany).not.toHaveBeenCalled();
  });

  test('filesIncluded=["pages"]: wipes pages, but never snippets or blog', async () => {
    const body = {
      metadata: { filesIncluded: ['pages'] },
      pages: [],
      snippets: [],
      blogChannels: [],
      blogPosts: [],
    };
    const res = makeRes();
    await handler(makeReq(body, 'replace'), res);

    expect(mockPrisma.page.deleteMany).toHaveBeenCalledWith({});
    expect(mockPrisma.snippet.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.blogChannel.deleteMany).not.toHaveBeenCalled();
  });

  test('no metadata.filesIncluded (legacy backup): "replace" wipes everything as before', async () => {
    const body = { pages: [], snippets: [], blogChannels: [], blogPosts: [] };
    const res = makeRes();
    await handler(makeReq(body, 'replace'), res);

    expect(mockPrisma.page.deleteMany).toHaveBeenCalledWith({});
    expect(mockPrisma.snippet.deleteMany).toHaveBeenCalledWith({});
    expect(mockPrisma.blogChannel.deleteMany).toHaveBeenCalledWith({});
    expect(mockPrisma.blogPost.deleteMany).toHaveBeenCalledWith({});
  });

  test('"merge" strategy never deletes, regardless of filesIncluded', async () => {
    const body = {
      metadata: { filesIncluded: ['pages', 'snippets', 'blog'] },
      pages: [], snippets: [], blogChannels: [], blogPosts: [],
    };
    const res = makeRes();
    await handler(makeReq(body, 'merge'), res);

    expect(mockPrisma.page.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.snippet.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.blogChannel.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.blogPost.deleteMany).not.toHaveBeenCalled();
  });
});

describe('runImport — Upload-Dateien als Binärdaten (ZIP-Import)', () => {
  test('writes getBuffer() content as-is, alongside classic base64 items', async () => {
    const fs = require('fs');
    const { runImport } = require('../../pages/api/admin/import');
    const video = Buffer.from([0x00, 0x01, 0xfe, 0xff]);
    const result = await runImport({
      metadata: { filesIncluded: ['uploadedFiles'] },
      uploadedFiles: [
        { path: 'tnt/video/teaser.mp4', getBuffer: async () => video },
        { path: 'img/logo.txt', encoding: 'base64', content: Buffer.from('hallo').toString('base64') },
      ],
    }, 'merge');

    expect(result.importStats.uploadedFiles).toBe(2);
    const written = (suffix) => fs.writeFileSync.mock.calls.find(([file]) => String(file).endsWith(suffix))[1];
    expect(Buffer.compare(written('teaser.mp4'), video)).toBe(0);
    expect(written('logo.txt').toString()).toBe('hallo');
  });
});

describe('POST /api/admin/import — JavaScript-Dateien (JS-Manager)', () => {
  const jsCalls = () => mockImportExternFiles.mock.calls.filter(([kind]) => kind === 'js');

  test('imports JS files and the JS config (incl. Consent-Kategorien)', async () => {
    mockImportExternFiles.mockImplementation((kind, files) => ({ imported: files.length, errors: [], writtenFiles: files.map((f) => f.filename) }));
    const fs = require('fs');
    const body = {
      metadata: { filesIncluded: ['js'] },
      js: [{ filename: 'tnt.js', content: 'console.log(1)' }],
      jsConfig: { disabled: [], categories: { 'extern_js/tnt.js': 'necessary' } },
    };
    const res = makeRes();
    await handler(makeReq(body, 'replace'), res);

    expect(jsCalls()).toEqual([['js', body.js, 'replace']]);
    expect(res.json.mock.calls[0][0].importStats.js).toBe(1);
    const configWrite = fs.writeFileSync.mock.calls.find(([file]) => String(file).endsWith('js-config.json'));
    expect(JSON.parse(configWrite[1]).categories).toEqual({ 'extern_js/tnt.js': 'necessary' });
  });

  test('legacy backup without filesIncluded never wipes existing JS on "replace"', async () => {
    const res = makeRes();
    await handler(makeReq({ pages: [], snippets: [] }, 'replace'), res);

    expect(jsCalls()).toEqual([['js', [], 'merge']]);
  });

  test('backup whose filesIncluded lacks "js" never wipes existing JS on "replace"', async () => {
    const res = makeRes();
    await handler(makeReq({ metadata: { filesIncluded: ['css'] }, css: [] }, 'replace'), res);

    expect(jsCalls()).toEqual([['js', [], 'merge']]);
  });
});

test('rejects non-POST methods', async () => {
  const res = makeRes();
  await handler({ method: 'GET' }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

test('requires ADMIN auth', async () => {
  mockRequireAuth.mockResolvedValue({ authorized: false, status: 403, error: 'Zugriff verweigert' });
  const res = makeRes();
  await handler(makeReq({}), res);
  expect(res.status).toHaveBeenCalledWith(403);
});
