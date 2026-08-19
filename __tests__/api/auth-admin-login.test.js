/**
 * __tests__/api/auth-admin-login.test.js
 * Tests the admin-credentials authorize() function: bcrypt login, and
 * transparent migration of legacy (pre-bcrypt) SHA-256 password hashes.
 */

jest.disableAutomock();

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));

// Loading the real next-auth pulls in openid-client/jose, which this repo's
// jest config doesn't transform (unrelated pre-existing ESM gap). Stub the
// provider factories just enough to capture the authorize() closure we
// actually want to test, without loading that dependency graph.
const capturedProviders = [];
jest.mock('next-auth', () => jest.fn(() => ({})));
jest.mock('next-auth/providers/credentials', () => jest.fn((config) => {
  capturedProviders.push(config);
  return config;
}));
jest.mock('next-auth/providers/github', () => jest.fn(() => ({})));

describe('admin-credentials authorize()', () => {
  let authorize;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    capturedProviders.length = 0;
    require('../../pages/api/auth/[...nextauth]');
    authorize = capturedProviders.find(p => p.id === 'admin-credentials').authorize;
  });

  it('logs in with a bcrypt-hashed password', async () => {
    const hash = await bcrypt.hash('mypassword1', 12);
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u1', name: 'Admin', email: 'admin@example.com', password: hash, role: 'ADMIN',
    });

    const result = await authorize({ username: 'admin@example.com', password: 'mypassword1' });

    expect(result).toMatchObject({ id: 'u1', role: 'ADMIN', accountType: 'admin' });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('accepts a legacy SHA-256 hash once and migrates it to bcrypt', async () => {
    const legacyHash = crypto.createHash('sha256').update('mypassword1').digest('hex');
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u1', name: 'Admin', email: 'admin@example.com', password: legacyHash, role: 'ADMIN',
    });

    const result = await authorize({ username: 'admin@example.com', password: 'mypassword1' });

    expect(result).toMatchObject({ id: 'u1', role: 'ADMIN', accountType: 'admin' });
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    const newHash = mockPrisma.user.update.mock.calls[0][0].data.password;
    expect(newHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare('mypassword1', newHash)).toBe(true);
  });

  it('rejects a wrong password without migrating anything', async () => {
    const legacyHash = crypto.createHash('sha256').update('mypassword1').digest('hex');
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u1', name: 'Admin', email: 'admin@example.com', password: legacyHash, role: 'ADMIN',
    });

    const result = await authorize({ username: 'admin@example.com', password: 'wrongpassword' });

    expect(result).toBeNull();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
