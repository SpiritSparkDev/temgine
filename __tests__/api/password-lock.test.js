/**
 * __tests__/api/password-lock.test.js
 * Tests für GET/POST /api/pages/password-lock — Passwortschutz "ohne Konto"
 * (entschärfte Alternative zur Mitglieder-Zugangskontrolle).
 */

jest.disableAutomock();

const bcrypt = require('bcryptjs');

const mockPrisma = {
  page: {
    findMany: jest.fn(),
  },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));

process.env.NEXTAUTH_SECRET = 'test-secret';

const handler = require('../../pages/api/pages/password-lock').default;
const { buildUnlockCookieValue, PASSWORD_UNLOCK_COOKIE } = require('../../lib/pagePasswordLock');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

describe('GET /api/pages/password-lock', () => {
  beforeEach(() => jest.clearAllMocks());

  test('unlocked: false when no cookie present', async () => {
    const req = { method: 'GET', query: { pageId: 'page-1' }, cookies: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ unlocked: false });
  });

  test('unlocked: true when a valid cookie already lists the pageId', async () => {
    const cookieValue = buildUnlockCookieValue(['page-1']);
    const req = { method: 'GET', query: { pageId: 'page-1' }, cookies: { [PASSWORD_UNLOCK_COOKIE]: cookieValue } };
    const res = makeRes();
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith({ unlocked: true });
  });

  test('400 when pageId missing', async () => {
    const req = { method: 'GET', query: {}, cookies: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/pages/password-lock', () => {
  beforeEach(() => jest.clearAllMocks());

  test('404 when the page has no password set', async () => {
    mockPrisma.page.findMany.mockResolvedValue([{ id: 'page-1', accessPasswordHash: null, children: [] }]);
    const req = { method: 'POST', body: { pageId: 'page-1', password: 'secret' }, cookies: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('401 on wrong password', async () => {
    const hash = await bcrypt.hash('correct-password', 10);
    mockPrisma.page.findMany.mockResolvedValue([{ id: 'page-1', accessPasswordHash: hash, children: [] }]);
    const req = { method: 'POST', body: { pageId: 'page-1', password: 'wrong' }, cookies: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('200 + Set-Cookie on correct password, finds nested pages too', async () => {
    const hash = await bcrypt.hash('correct-password', 10);
    mockPrisma.page.findMany.mockResolvedValue([
      { id: 'top', accessPasswordHash: null, children: [{ id: 'nested-1', accessPasswordHash: hash, children: [] }] },
    ]);
    const req = { method: 'POST', body: { pageId: 'nested-1', password: 'correct-password' }, cookies: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining(PASSWORD_UNLOCK_COOKIE));
  });

  test('400 when pageId or password missing', async () => {
    const req = { method: 'POST', body: { pageId: 'page-1' }, cookies: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

test('unsupported method returns 405', async () => {
  const req = { method: 'DELETE', cookies: {} };
  const res = makeRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(405);
});
