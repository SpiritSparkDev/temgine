/**
 * __tests__/shopConfig.test.js
 * Shop-Add-on, Fundament: Setting-Schlüssel, Statusermittlung ohne Herausgabe von Zugangsdaten.
 */

jest.disableAutomock();

const mockPrisma = { setting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() } };
jest.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
const mockEnsurePages = jest.fn().mockResolvedValue([]);
jest.mock('../lib/shop/pages', () => ({ ensureShopPages: (...a) => mockEnsurePages(...a) }));

const fs = require('fs');
const path = require('path');
const keys = require('../lib/shop/keys');
const { getShopStatus, isShopEnabled, setShopEnabled } = require('../lib/shop/config');

beforeEach(() => jest.clearAllMocks());

describe('lib/shop/keys', () => {
  test('all keys share the shop_ prefix and secrets are a subset of the provider credentials', () => {
    const all = Object.values(keys.SHOP_PROVIDERS).flatMap((p) => p.requiredKeys);
    for (const k of [...all, ...keys.SHOP_SECRET_KEYS, keys.SHOP_ENABLED_KEY]) expect(k.startsWith(keys.SHOP_KEY_PREFIX)).toBe(true);
    for (const k of keys.SHOP_SECRET_KEYS) expect(all).toContain(k);
  });

  test('each provider has its own enable switch and the three providers are SumUp, Stripe, PayPal', () => {
    expect(Object.keys(keys.SHOP_PROVIDERS)).toEqual(['sumup', 'stripe', 'paypal']);
    expect(keys.providerEnabledKey('stripe')).toBe('shop_stripe_enabled');
  });

  test('API secrets and webhook secrets are classified as secret, public ids are not', () => {
    for (const k of ['shop_sumup_api_key', 'shop_stripe_secret_key', 'shop_stripe_webhook_secret', 'shop_paypal_client_secret']) {
      expect(keys.SHOP_SECRET_KEYS).toContain(k);
    }
    expect(keys.SHOP_SECRET_KEYS).not.toContain('shop_sumup_merchant_code');
    expect(keys.SHOP_SECRET_KEYS).not.toContain('shop_paypal_client_id');
  });
});

describe('lib/shop/config', () => {
  test('isShopEnabled only for the exact value "true"', async () => {
    mockPrisma.setting.findUnique.mockResolvedValueOnce({ value: 'true' });
    expect(await isShopEnabled()).toBe(true);
    mockPrisma.setting.findUnique.mockResolvedValueOnce({ value: 'false' });
    expect(await isShopEnabled()).toBe(false);
    mockPrisma.setting.findUnique.mockResolvedValueOnce(null);
    expect(await isShopEnabled()).toBe(false);
  });

  test('setShopEnabled upserts the string flag', async () => {
    await setShopEnabled(true);
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({ where: { key: 'shop_enabled' }, update: { value: 'true' }, create: { key: 'shop_enabled', value: 'true' } });
    await setShopEnabled(false);
    expect(mockPrisma.setting.upsert.mock.calls[1][0].update.value).toBe('false');
  });

  test('enabling creates the shop pages, disabling does not, and a page error does not block enabling', async () => {
    await setShopEnabled(true);
    expect(mockEnsurePages).toHaveBeenCalledTimes(1);
    await setShopEnabled(false);
    expect(mockEnsurePages).toHaveBeenCalledTimes(1);
    mockEnsurePages.mockRejectedValueOnce(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(setShopEnabled(true)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('getShopStatus reports flags per provider and never returns credential values', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([
      { key: 'shop_enabled', value: 'true' },
      { key: 'shop_sumup_enabled', value: 'true' },
      { key: 'shop_sumup_api_key', value: 'sup_sk_SECRET' },
      { key: 'shop_sumup_merchant_code', value: 'MCODE' },
      { key: 'shop_stripe_secret_key', value: 'sk_test_SECRET' }, // webhook secret missing -> not configured
    ]);
    const status = await getShopStatus();
    expect(status).toEqual({
      enabled: true,
      providers: {
        sumup: { label: 'SumUp', enabled: true, configured: true },
        stripe: { label: 'Stripe', enabled: false, configured: false },
        paypal: { label: 'PayPal', enabled: false, configured: false },
      },
    });
    expect(JSON.stringify(status)).not.toMatch(/SECRET|MCODE/);
  });
});

describe('PERMISSIONS (lib/auth.js)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/auth.js'), 'utf8');
  const perm = (name) => new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`).exec(src)[1].replace(/['\s]/g, '').split(',');

  test('payment/shop settings are admin only; products open to editors; orders to moderators and admins', () => {
    expect(perm('SHOP_SETTINGS')).toEqual(['ADMIN']);
    expect(perm('SHOP_PRODUCTS_EDIT')).toEqual(['ADMIN', 'MODERATOR', 'EDITOR']);
    expect(perm('SHOP_ORDERS_VIEW')).toEqual(['ADMIN', 'MODERATOR']);
    expect(perm('SHOP_ORDERS_EDIT')).toEqual(['ADMIN', 'MODERATOR']);
  });
});
