/** /api/health ist öffentlich: die NEXTAUTH_URL darf nicht in der Antwort stehen. */
jest.mock('../../lib/prisma', () => ({ prisma: { $queryRaw: jest.fn(async () => []), user: { count: jest.fn(async () => 1) } } }))
const handler = require('../../pages/api/health').default

test('Antwort enthält die NEXTAUTH_URL nicht', async () => {
  Object.assign(process.env, { NEXTAUTH_URL: 'http://geheim.example:3006', NEXTAUTH_SECRET: 's', DATABASE_URL: 'd' })
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) }
  await handler({ method: 'GET' }, res)
  const body = res.json.mock.calls[0][0]
  expect(body.env.ok).toBe(true)
  expect(JSON.stringify(body)).not.toContain('geheim.example')
})
