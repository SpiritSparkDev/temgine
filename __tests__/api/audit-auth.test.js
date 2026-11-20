/** GET /api/audit: nur ADMIN – ohne Login 401, mit Token (MODERATOR) 403. */
const mockRequireAuth = jest.fn()
jest.mock('../../lib/auth', () => ({ requireAuth: (...a) => mockRequireAuth(...a) }))
jest.mock('../../lib/prisma', () => ({ prisma: { auditLog: { findMany: jest.fn(async () => [{ id: 'a1' }]) } } }))

const handler = require('../../pages/api/audit').default
const run = async () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) }
  await handler({ method: 'GET', query: {} }, res)
  return res
}

test('ohne Berechtigung kein Zugriff', async () => {
  mockRequireAuth.mockResolvedValue({ authorized: false, status: 403, error: 'nein' })
  const res = await run()
  expect(res.status).toHaveBeenCalledWith(403)
  expect(mockRequireAuth).toHaveBeenCalledWith(expect.anything(), expect.anything(), ['ADMIN'])
})

test('Admin sieht das Log', async () => {
  mockRequireAuth.mockResolvedValue({ authorized: true, user: { role: 'ADMIN' } })
  const res = await run()
  expect(res.status).toHaveBeenCalledWith(200)
})
