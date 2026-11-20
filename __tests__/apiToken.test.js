/** Zugangs-Token: gültig → Moderator; widerrufen/abgelaufen/unbekannt → 401; Admin-Routen → 403. */
const mockFind = jest.fn()
jest.mock('../lib/prisma', () => ({ prisma: { apiToken: { findUnique: (a) => mockFind(a), update: () => Promise.resolve() }, auditLog: { create: jest.fn() } } }))
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn(async () => null) }))
jest.mock('../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }))

const { requireAuth, PERMISSIONS } = require('../lib/auth')
const { generateToken, hashToken } = require('../lib/apiToken')

const req = (token) => ({ method: 'GET', headers: { authorization: `Bearer ${token}` } })

test('gültiges Token ist MODERATOR, kein ADMIN', async () => {
  const { token, tokenHash } = generateToken()
  mockFind.mockImplementation(async ({ where }) => (where.tokenHash === tokenHash ? { id: 't1', name: 'Claude', revokedAt: null, expiresAt: null } : null))
  const ok = await requireAuth(req(token), {}, PERMISSIONS.PAGES_EDIT)
  expect(ok.authorized).toBe(true)
  expect(ok.user.role).toBe('MODERATOR')
  const admin = await requireAuth(req(token), {}, ['ADMIN'])
  expect(admin.status).toBe(403)
})

test('widerrufen, abgelaufen oder unbekannt → 401', async () => {
  const { token } = generateToken()
  for (const row of [{ id: 't', name: 'x', revokedAt: new Date() }, { id: 't', name: 'x', expiresAt: new Date(Date.now() - 1000) }, null]) {
    mockFind.mockResolvedValue(row)
    expect((await requireAuth(req(token), {}, [])).status).toBe(401)
  }
  expect(hashToken(token)).toHaveLength(64)
})
