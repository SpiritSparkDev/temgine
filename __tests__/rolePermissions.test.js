/** @jest-environment node */
jest.mock('../lib/prisma', () => ({ prisma: {} }))
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }))
jest.mock('../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }))

const { PERMISSIONS, rolesFor } = require('../lib/auth')

test('Defaults unverändert, neue Rechte vorhanden', () => {
  expect(PERMISSIONS.PAGES_DELETE).toEqual(['ADMIN', 'MODERATOR'])
  expect(PERMISSIONS.FILES_DELETE).toEqual(['ADMIN', 'MODERATOR'])
  expect(PERMISSIONS.PAGES_CREATE).toContain('EDITOR')
  expect(rolesFor('FILES_FOLDERS')).toContain('ADMIN')
})
