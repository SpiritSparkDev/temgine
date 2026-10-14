jest.disableAutomock()
jest.mock('../lib/shop/providers/sumup', () => ({ id: 'sumup', label: 'SumUp' }))
jest.mock('../lib/shop/providers/stripe', () => ({ id: 'stripe', label: 'Stripe' }))
jest.mock('../lib/shop/providers/paypal', () => ({ id: 'paypal', label: 'PayPal' }))
const { getProvider, listAvailableProviders, isProviderAvailable } = require('../lib/shop/providers')

const sumup = { shop_sumup_enabled: 'true', shop_sumup_api_key: 'k', shop_sumup_merchant_code: 'M' }
const stripe = { shop_stripe_enabled: 'true', shop_stripe_secret_key: 'k', shop_stripe_webhook_secret: 'w' }
const paypal = { shop_paypal_enabled: 'true', shop_paypal_client_id: 'c', shop_paypal_client_secret: 's', shop_paypal_webhook_id: 'w' }

test('a provider is available only when enabled and all required keys are set', () => {
  expect(listAvailableProviders(sumup)).toEqual([{ id: 'sumup', label: 'SumUp' }])
  expect(listAvailableProviders({ ...sumup, shop_sumup_enabled: 'false' })).toEqual([])
  expect(listAvailableProviders({ ...sumup, shop_sumup_api_key: '' })).toEqual([])
  expect(listAvailableProviders({ ...sumup, shop_sumup_merchant_code: undefined })).toEqual([])
  expect(listAvailableProviders({})).toEqual([])
})

test('SumUp, Stripe and PayPal are independent of each other', () => {
  expect(listAvailableProviders({ ...sumup, ...stripe, ...paypal }).map((p) => p.id)).toEqual(['sumup', 'stripe', 'paypal'])
  expect(listAvailableProviders(stripe)).toEqual([{ id: 'stripe', label: 'Stripe' }])
  expect(listAvailableProviders(paypal)).toEqual([{ id: 'paypal', label: 'PayPal' }])
  // Stripe ohne Webhook-Secret oder PayPal ohne Webhook-ID ist nicht verfügbar
  expect(isProviderAvailable('stripe', { ...stripe, shop_stripe_webhook_secret: '' })).toBe(false)
  expect(isProviderAvailable('paypal', { ...paypal, shop_paypal_webhook_id: '' })).toBe(false)
  // Ein aktivierter Anbieter schaltet die anderen nicht mit frei
  expect(isProviderAvailable('stripe', { ...sumup, shop_stripe_enabled: 'true' })).toBe(false)
})

test('getProvider knows only registered ids', () => {
  for (const id of ['sumup', 'stripe', 'paypal']) expect(getProvider(id).id).toBe(id)
  for (const x of ['foo', '__proto__', 'constructor', 'toString', '', null, 5]) expect(getProvider(x)).toBeNull()
})
