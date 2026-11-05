const { clientIp } = require('../lib/shop/clientIp')

describe('clientIp', () => {
  const old = process.env.TRUST_PROXY
  afterEach(() => { if (old === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = old })
  const req = (xff) => ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: '10.0.0.1' } })

  test('ignores x-forwarded-for without TRUST_PROXY', () => {
    delete process.env.TRUST_PROXY
    expect(clientIp(req('6.6.6.6, 1.2.3.4'))).toBe('10.0.0.1')
  })
  test('uses the last x-forwarded-for element with TRUST_PROXY=true', () => {
    process.env.TRUST_PROXY = 'true'
    expect(clientIp(req('6.6.6.6, 1.2.3.4'))).toBe('1.2.3.4')
    expect(clientIp(req())).toBe('10.0.0.1')
  })
  test('falls back to unknown', () => {
    delete process.env.TRUST_PROXY
    expect(clientIp({ headers: {} })).toBe('unknown')
  })
})
