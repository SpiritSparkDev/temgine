/**
 * __tests__/api/users-roles.test.js
 * Tests für GET/PUT /api/users/roles — insbesondere, dass GET nur ein
 * hasPassword-Flag statt des rohen Passwort-Hashs ausliefert.
 */

jest.disableAutomock();

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
};
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));

const mockGetServerSession = jest.fn();
jest.mock('next-auth/next', () => ({ getServerSession: (...args) => mockGetServerSession(...args) }));
jest.mock('../../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));

const handler = require('../../pages/api/users/roles').default;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetServerSession.mockResolvedValue({ user: { email: 'admin@example.com' } });
});

test('GET never leaks the raw password hash, only hasPassword', async () => {
  mockPrisma.user.findMany.mockResolvedValue([
    { id: 'u1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', createdAt: new Date(), image: null, password: '$2a$10$hash' },
    { id: 'u2', name: 'OAuth User', email: 'oauth@example.com', role: 'EDITOR', createdAt: new Date(), image: null, password: null },
  ]);
  const res = makeRes();
  await handler({ method: 'GET' }, res);

  expect(res.status).toHaveBeenCalledWith(200);
  const payload = res.json.mock.calls[0][0];
  expect(payload.users).toHaveLength(2);
  for (const u of payload.users) {
    expect(u.password).toBeUndefined();
  }
  expect(payload.users[0].hasPassword).toBe(true);
  expect(payload.users[1].hasPassword).toBe(false);
});

test('401 for GET without a session', async () => {
  mockGetServerSession.mockResolvedValue(null);
  const res = makeRes();
  await handler({ method: 'GET' }, res);
  expect(res.status).toHaveBeenCalledWith(401);
});
