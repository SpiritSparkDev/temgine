/**
 * __tests__/api/change-password.test.js
 * Tests für POST /api/users/change-password — Selbstbedienung "eigenes
 * Passwort ändern" in der Benutzerverwaltung.
 */

jest.disableAutomock();

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));

const mockGetServerSession = jest.fn();
jest.mock('next-auth/next', () => ({ getServerSession: (...args) => mockGetServerSession(...args) }));
jest.mock('../../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/rateLimit', () => ({
  rateLimit: () => ({ check: () => ({ ok: true, remaining: 99 }) }),
}));

const handler = require('../../pages/api/users/change-password').default;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeReq(body) {
  return { method: 'POST', body, headers: {}, socket: {} };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
});

test('401 when not authenticated', async () => {
  mockGetServerSession.mockResolvedValue(null);
  const res = makeRes();
  await handler(makeReq({ currentPassword: 'a', newPassword: 'newpassword1' }), res);
  expect(res.status).toHaveBeenCalledWith(401);
});

test('405 for non-POST methods', async () => {
  const res = makeRes();
  await handler({ method: 'GET' }, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

test('400 when fields are missing', async () => {
  const res = makeRes();
  await handler(makeReq({ currentPassword: 'a' }), res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test('400 when new password is too short', async () => {
  const res = makeRes();
  await handler(makeReq({ currentPassword: 'a', newPassword: 'short' }), res);
  expect(res.status).toHaveBeenCalledWith(400);
});

test('404 when the session user no longer exists', async () => {
  mockPrisma.user.findUnique.mockResolvedValue(null);
  const res = makeRes();
  await handler(makeReq({ currentPassword: 'a', newPassword: 'newpassword1' }), res);
  expect(res.status).toHaveBeenCalledWith(404);
});

test('400 when the account has no password (OAuth-only)', async () => {
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'admin@example.com', password: null });
  const res = makeRes();
  await handler(makeReq({ currentPassword: 'a', newPassword: 'newpassword1' }), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
});

test('401 when the current password (bcrypt) is wrong', async () => {
  const hash = await bcrypt.hash('correct-password', 10);
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'admin@example.com', password: hash });
  const res = makeRes();
  await handler(makeReq({ currentPassword: 'wrong-password', newPassword: 'newpassword1' }), res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
});

test('200 and updates to a new bcrypt hash when the current bcrypt password is correct', async () => {
  const hash = await bcrypt.hash('correct-password', 10);
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'admin@example.com', password: hash });
  const res = makeRes();
  await handler(makeReq({ currentPassword: 'correct-password', newPassword: 'newpassword1' }), res);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(mockPrisma.user.update).toHaveBeenCalledWith({
    where: { id: 'u1' },
    data: { password: expect.any(String) },
  });
  const newHash = mockPrisma.user.update.mock.calls[0][0].data.password;
  expect(newHash.startsWith('$2')).toBe(true);
  expect(await bcrypt.compare('newpassword1', newHash)).toBe(true);
});

test('accepts a legacy SHA-256 current password and upgrades to bcrypt', async () => {
  const legacyHash = crypto.createHash('sha256').update('legacy-password').digest('hex');
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'admin@example.com', password: legacyHash });
  const res = makeRes();
  await handler(makeReq({ currentPassword: 'legacy-password', newPassword: 'newpassword1' }), res);

  expect(res.status).toHaveBeenCalledWith(200);
  const newHash = mockPrisma.user.update.mock.calls[0][0].data.password;
  expect(newHash.startsWith('$2')).toBe(true);
});

test('rejects a wrong legacy SHA-256 current password', async () => {
  const legacyHash = crypto.createHash('sha256').update('legacy-password').digest('hex');
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'admin@example.com', password: legacyHash });
  const res = makeRes();
  await handler(makeReq({ currentPassword: 'wrong', newPassword: 'newpassword1' }), res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(mockPrisma.user.update).not.toHaveBeenCalled();
});
