/**
 * Tests for pages/api/snippets.js
 * These tests mock `lib/prisma` and call the Next.js handler directly
 */
jest.disableAutomock()

// Mock the prisma client used by the API handler
const mockSnippets = [
  { key: 'Titel', value: JSON.stringify({ snippet: '#title', type: 'bound' }), createdAt: new Date(), updatedAt: new Date() },
  { key: 'Text', value: '{{text}}', createdAt: new Date(), updatedAt: new Date() }
]

const mockPrisma = {
  snippet: {
    findMany: jest.fn().mockResolvedValue(mockSnippets),
    upsert: jest.fn().mockImplementation(async ({ where, create, update }) => ({ key: where.key, value: create ? create.value : update.value })),
    delete: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 })
  }
}

describe('/api/snippets handler', () => {
  let handler

  beforeAll(() => {
    // require the CommonJS helper directly and pass mocked prisma to it
    handler = require('../../lib/snippetsHandler.cjs')
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function makeRes() {
    const res = {}
    res.status = jest.fn().mockReturnValue(res)
    res.json = jest.fn().mockReturnValue(res)
    res.end = jest.fn().mockReturnValue(res)
    return res
  }

  test('GET returns mapped snippets', async () => {
    const req = { method: 'GET' }
    const res = makeRes()
    await handler(req, res, mockPrisma)
    expect(mockPrisma.snippet.findMany).toHaveBeenCalled()
    // handler maps DB shape to label/snippet/type
    expect(res.status).toHaveBeenCalledWith(200)
    const out = res.json.mock.calls[0][0]
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeGreaterThanOrEqual(2)
    expect(out[0]).toHaveProperty('label')
    expect(out[0]).toHaveProperty('snippet')
  })

  test('POST single snippet upserts', async () => {
    const req = { method: 'POST', body: { label: 'New', snippet: '<p>ok</p>', type: 'free' } }
    const res = makeRes()
    await handler(req, res, mockPrisma)
    expect(mockPrisma.snippet.upsert).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test('POST array upserts and deletes missing', async () => {
    const payload = [ { label: 'Titel', snippet: '#title' }, { label: 'Extra', snippet: 'x' } ]
    const req = { method: 'POST', body: payload }
    const res = makeRes()
    await handler(req, res, mockPrisma)
    // upsert called for each
    expect(mockPrisma.snippet.upsert).toHaveBeenCalled()
    // deleteMany called to remove keys not present
    expect(mockPrisma.snippet.deleteMany).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test('DELETE removes by key', async () => {
    const req = { method: 'DELETE', body: { key: 'Titel' } }
    const res = makeRes()
    await handler(req, res, mockPrisma)
    expect(mockPrisma.snippet.delete).toHaveBeenCalledWith({ where: { key: 'Titel' } })
    expect(res.status).toHaveBeenCalledWith(200)
  })
})
