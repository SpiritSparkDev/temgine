const findMany = jest.fn()
jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => ({ setting: { findMany } })) }))

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
const BASE = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self'; frame-src 'self' https://www.youtube.com"

function fakeRes(csp) {
  const headers = { 'content-security-policy': csp }
  const orig = jest.fn()
  return {
    headers,
    getHeader: k => headers[k.toLowerCase()],
    setHeader: (k, v) => { headers[k.toLowerCase()] = v },
    orig,
    writeHead: orig,
  }
}
const rows = (shop, sumup) => [{ key: 'shop_enabled', value: shop }, { key: 'shop_sumup_enabled', value: sumup }]

let mod, matomo
beforeEach(() => {
  jest.resetModules()
  findMany.mockReset()
  process.env.DATABASE_URL = 'x'
  mod = require('../lib/shopCsp')
  matomo = require('../lib/pluginCsp')
})

describe('buildShopCspAdditions', () => {
  test('only when shop and sumup are both on', () => {
    expect(mod.buildShopCspAdditions({})).toEqual({})
    expect(mod.buildShopCspAdditions({ shop_enabled: 'false', shop_sumup_enabled: 'true' })).toEqual({})
    expect(mod.buildShopCspAdditions({ shop_enabled: 'true', shop_sumup_enabled: 'false' })).toEqual({})
    const a = mod.buildShopCspAdditions({ shop_enabled: 'true', shop_sumup_enabled: 'true' })
    expect(a['script-src']).toEqual(['https://gateway.sumup.com'])
    expect(a['frame-src']).toContain('https://*.oppwa.com')
  })
})

describe('applyShopCsp', () => {
  async function run(res) {
    mod.applyShopCsp(res)
    res.writeHead(200) // first call starts the load
    await flush()
    res.setHeader('Content-Security-Policy', BASE)
    res.writeHead(200)
  }

  test('shop off -> unchanged', async () => {
    findMany.mockResolvedValue(rows('false', 'true'))
    const res = fakeRes(BASE)
    await run(res)
    expect(res.headers['content-security-policy']).toBe(BASE)
  })

  test('shop on, sumup off -> unchanged', async () => {
    findMany.mockResolvedValue(rows('true', 'false'))
    const res = fakeRes(BASE)
    await run(res)
    expect(res.headers['content-security-policy']).toBe(BASE)
  })

  test('both on -> origins added once, others kept', async () => {
    findMany.mockResolvedValue(rows('true', 'true'))
    const res = fakeRes(BASE)
    await run(res)
    const csp = res.headers['content-security-policy']
    expect(csp).toContain("script-src 'self' https://cdn.jsdelivr.net https://gateway.sumup.com")
    expect(csp).toContain("connect-src 'self' https://*.sumup.com")
    expect(csp).toContain("frame-src 'self' https://www.youtube.com https://*.sumup.com https://*.ppipe.net https://*.oppwa.com")
    res.writeHead(200)
    expect(res.headers['content-security-policy']).toBe(csp)
  })

  test('works together with applyPluginCsp in both orders', async () => {
    findMany.mockResolvedValue([...rows('true', 'true'), { key: 'matomo_enabled', value: 'true' }, { key: 'matomo_url', value: 'https://m.example.de' }])
    for (const order of [['applyPluginCsp', 'applyShopCsp'], ['applyShopCsp', 'applyPluginCsp']]) {
      const res = fakeRes(BASE)
      const lib = { applyPluginCsp: matomo.applyPluginCsp, applyShopCsp: mod.applyShopCsp }
      order.forEach(n => lib[n](res))
      res.writeHead(200)
      await flush()
      res.setHeader('Content-Security-Policy', BASE)
      res.writeHead(200)
      const csp = res.headers['content-security-policy']
      expect(csp).toContain('https://m.example.de')
      expect(csp).toContain('https://gateway.sumup.com')
      expect(csp).toContain('https://*.ppipe.net')
    }
  })

  test('caches settings for 30 s', async () => {
    findMany.mockResolvedValue(rows('true', 'true'))
    const res = fakeRes(BASE)
    await run(res)
    res.writeHead(200)
    expect(findMany).toHaveBeenCalledTimes(1)
  })

  test('settings error never blocks the response', async () => {
    findMany.mockRejectedValue(new Error('db down'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = fakeRes(BASE)
    await run(res)
    expect(res.orig).toHaveBeenCalledTimes(2)
    expect(res.headers['content-security-policy']).toBe(BASE)
    spy.mockRestore()
  })
})
