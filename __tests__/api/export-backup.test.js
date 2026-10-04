/**
 * __tests__/api/export-backup.test.js
 * Tests für GET /api/admin/export (reiner JSON-Pfad, kein format=...) —
 * insbesondere die neue, per Checkbox wählbare Kategorien-Liste (siehe
 * lib/backupCategories.js) und dass Blog-Channels/-Beiträge jetzt mit
 * exportiert werden.
 */

jest.disableAutomock();

const mockPrisma = {
  page: { findMany: jest.fn().mockResolvedValue([]) },
  snippet: { findMany: jest.fn().mockResolvedValue([]) },
  globalVariable: { findMany: jest.fn().mockResolvedValue([]) },
  blogChannel: { findMany: jest.fn().mockResolvedValue([{ id: 'ch-1', slug: 'news', name: 'News' }]) },
  blogPost: { findMany: jest.fn().mockResolvedValue([{ id: 'post-1', channelId: 'ch-1', slug: 'hello', title: 'Hello' }]) },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));

const mockRequireAuth = jest.fn().mockResolvedValue({ authorized: true, user: { id: 'admin-1', role: 'ADMIN' } });
jest.mock('../../lib/auth', () => ({ requireAuth: (...args) => mockRequireAuth(...args) }));

jest.mock('../../lib/templateStore', () => ({ listTemplates: jest.fn().mockReturnValue([]) }));
jest.mock('../../lib/navigationStore', () => ({ listNavigations: jest.fn().mockReturnValue([]) }));
jest.mock('../../lib/footerStore', () => ({ listFooters: jest.fn().mockReturnValue([]) }));
jest.mock('../../lib/maintenanceStore', () => ({ getAllMaintenanceAsSettings: jest.fn().mockReturnValue({}) }));
jest.mock('../../lib/templateEngine', () => ({ renderPage: jest.fn(), buildNavHtml: jest.fn(), collectFolderBlockPaths: jest.fn() }));
jest.mock('../../lib/uploadFolder', () => ({ listFolderItemsRecursive: jest.fn().mockReturnValue([]) }));
jest.mock('../../lib/navTreeHelpers', () => ({ findRawPageNodeById: jest.fn() }));
jest.mock('../../lib/globalVariables', () => ({ buildGlobalContext: jest.fn() }));

const handler = require('../../pages/api/admin/export').default;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

function makeReq(query = {}) {
  return { method: 'GET', query, headers: { host: 'localhost:3000' } };
}

function getSentBackup(res) {
  expect(res.send).toHaveBeenCalled();
  return JSON.parse(res.send.mock.calls[0][0]);
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/admin/export (plain JSON)', () => {
  test('default (no categories param) includes everything, including blog', async () => {
    const res = makeRes();
    await handler(makeReq(), res);
    const backup = getSentBackup(res);

    expect(backup.metadata.filesIncluded).toContain('blog');
    expect(backup.blogChannels).toHaveLength(1);
    expect(backup.blogPosts).toHaveLength(1);
    expect(backup.metadata.itemCounts.blogChannels).toBe(1);
    expect(backup.metadata.itemCounts.blogPosts).toBe(1);
  });

  test('categories=pages,snippets excludes blog and everything else', async () => {
    const res = makeRes();
    await handler(makeReq({ categories: 'pages,snippets' }), res);
    const backup = getSentBackup(res);

    expect(backup.metadata.filesIncluded.sort()).toEqual(['pages', 'snippets'].sort());
    expect(backup.blogChannels).toEqual([]);
    expect(backup.blogPosts).toEqual([]);
    expect(backup.templates).toEqual([]);
    expect(backup.navigations).toEqual([]);
    expect(backup.metadata.itemCounts.blogChannels).toBe(0);
  });

  test('categories=blog includes only blog data', async () => {
    const res = makeRes();
    await handler(makeReq({ categories: 'blog' }), res);
    const backup = getSentBackup(res);

    expect(backup.metadata.filesIncluded).toEqual(['blog']);
    expect(backup.blogChannels).toHaveLength(1);
    expect(backup.blogPosts).toHaveLength(1);
    expect(backup.pages).toEqual([]);
    expect(backup.snippets).toEqual([]);
  });
});
