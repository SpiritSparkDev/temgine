jest.disableAutomock()
jest.mock('../lib/shop/providers/sumup', () => ({ id: 'sumup', label: 'SumUp' }), { virtual: true })
const { getProvider, listAvailableProviders } = require('../lib/shop/providers')

const ok = { shop_sumup_enabled: 'true', shop_sumup_api_key: 'k', shop_sumup_merchant_code: 'M' }

test('available only when enabled and all required keys set', () => {
  expect(listAvailableProviders(ok)).toEqual([{ id: 'sumup', label: 'SumUp' }])
  expect(listAvailableProviders({ ...ok, shop_sumup_enabled: 'false' })).toEqual([])
  expect(listAvailableProviders({ ...ok, shop_sumup_api_key: '' })).toEqual([])
  expect(listAvailableProviders({ ...ok, shop_sumup_merchant_code: undefined })).toEqual([])
  expect(listAvailableProviders({})).toEqual([])
  // Stripe ist noch nicht registriert
  expect(listAvailableProviders({ ...ok, shop_stripe_enabled: 'true', shop_stripe_secret_key: 'k', shop_stripe_webhook_secret: 'w' })).toHaveLength(1)
})

test('getProvider knows only registered ids', () => {
  expect(getProvider('sumup').id).toBe('sumup')
  for (const x of ['stripe', '__proto__', 'constructor', '', null, 5]) expect(getProvider(x)).toBeNull()
})
