jest.disableAutomock()

const { request } = require('../lib/shop/providers/http')

const res = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) })

beforeEach(() => {
  global.fetch = jest.fn()
})

test('sendet JSON-Body mit Content-Type und liefert geparste Antwort', async () => {
  global.fetch.mockResolvedValue(res(201, { id: 'x' }))
  const out = await request('https://api.example.com/a', { method: 'POST', headers: { Authorization: 'Bearer K' }, body: { a: 1 } })
  expect(out).toEqual({ status: 201, data: { id: 'x' } })
  const [url, init] = global.fetch.mock.calls[0]
  expect(url).toBe('https://api.example.com/a')
  expect(init.method).toBe('POST')
  expect(init.body).toBe('{"a":1}')
  expect(init.headers).toEqual({ Authorization: 'Bearer K', 'Content-Type': 'application/json' })
  expect(init.signal).toBeDefined()
})

test('String-Body unverändert, leere Antwort -> data null', async () => {
  global.fetch.mockResolvedValue(res(200))
  const out = await request('https://api.example.com/a', { method: 'POST', body: 'a=1' })
  expect(global.fetch.mock.calls[0][1].body).toBe('a=1')
  expect(out.data).toBeNull()
})

test('HTTP-Fehler: status gesetzt, Meldung ohne Header/Body/Query', async () => {
  global.fetch.mockResolvedValue(res(401, { secret: 'BODYSECRET' }))
  const p = request('https://api.example.com/v1/x?token=QSECRET', { headers: { Authorization: 'Bearer HSECRET' }, body: { k: 'BSECRET' }, method: 'POST' })
  await expect(p).rejects.toMatchObject({ status: 401 })
  const err = await p.catch((e) => e)
  for (const s of ['BODYSECRET', 'QSECRET', 'HSECRET', 'BSECRET', 'Bearer']) expect(err.message).not.toContain(s)
  expect(err.message).toContain('HTTP 401')
})

test('Netzwerkfehler ohne Rohmeldung, kein Retry', async () => {
  global.fetch.mockRejectedValue(new Error('connect ECONNREFUSED token=ZZZ'))
  const err = await request('https://api.example.com/a').catch((e) => e)
  expect(err.status).toBe(0)
  expect(err.code).toBe('NETWORK')
  expect(err.message).not.toContain('ZZZ')
  expect(global.fetch).toHaveBeenCalledTimes(1)
})

test('Timeout bricht per AbortController ab', async () => {
  global.fetch.mockImplementation((u, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')))
  }))
  const err = await request('https://api.example.com/a', { timeoutMs: 20 }).catch((e) => e)
  expect(err.code).toBe('TIMEOUT')
  expect(err.status).toBe(0)
})
