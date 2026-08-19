/**
 * __tests__/api/setup-create-admin.test.js
 * Tests for POST /api/setup/create-admin: single-use gate, bcrypt hashing.
 */

jest.disableAutomock();

const mockPrisma = {
  user: {
    count: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('POST /api/setup/create-admin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.user.create.mockResolvedValue({ id: 'user-1' });
  });

  const handler = require('../../pages/api/setup/create-admin').default;

  it('rejects when a user already exists (single-use)', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    const req = { method: 'POST', body: { name: 'A', email: 'a@b.com', password: 'password1' } };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('creates the admin with a bcrypt hash while the user table is empty', async () => {
    const req = {
      method: 'POST',
      body: { name: 'Admin', email: 'Admin@Example.com', password: 'password1' },
    };
    const res = makeRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    const createdData = mockPrisma.user.create.mock.calls[0][0].data;
    expect(createdData.role).toBe('ADMIN');
    expect(createdData.email).toBe('admin@example.com');
    expect(createdData.password).toMatch(/^\$2[aby]\$/); // bcrypt hash, not sha256 hex
  });
});
