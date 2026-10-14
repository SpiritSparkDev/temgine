jest.disableAutomock();

const mockPrisma = { setting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() } };
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_SETTINGS: ['ADMIN'] } }));
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }));
jest.mock('../../lib/shop/pages', () => ({ ensureShopPages: jest.fn() }));
const mockDriver = { testConnection: jest.fn() };
jest.mock('../../lib/shop/providers', () => ({ getProvider: () => mockDriver }), { virtual: true });

const { requireAuth } = require('../../lib/auth');
const { logAudit } = require('../../lib/audit');
const payments = require('../../pages/api/shop/payments').default;
const test_ = require('../../pages/api/shop/payments/test-connection').default;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}
let store;
const admin = { authorized: true, user: { id: 'u1' } };

beforeEach(() => {
  jest.clearAllMocks();
  store = { shop_enabled: 'true', shop_sumup_api_key: 'GEHEIM-KEY', shop_sumup_merchant_code: 'MC1' };
  mockPrisma.setting.findUnique.mockImplementation(async ({ where }) => (where.key in store ? { value: store[where.key] } : null));
  mockPrisma.setting.findMany.mockImplementation(async ({ where }) => where.key.in.filter((k) => k in store).map((key) => ({ key, value: store[key] })));
  mockPrisma.setting.upsert.mockImplementation(async ({ where, create }) => { store[where.key] = create.value; return create; });
  requireAuth.mockResolvedValue(admin);
});

describe('/api/shop/payments', () => {
  test('passes auth failure through with SHOP_SETTINGS roles', async () => {
    requireAuth.mockResolvedValue({ authorized: false, error: 'Zugriff verweigert', status: 403 });
    const res = makeRes();
    await payments({ method: 'GET' }, res);
    expect(requireAuth.mock.calls[0][2]).toEqual(['ADMIN']);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('403 ADDON_DISABLED when the shop is off', async () => {
    store.shop_enabled = 'false';
    const res = makeRes();
    await payments({ method: 'GET' }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'ADDON_DISABLED' }));
  });

  test('GET never leaks secrets and reports set/configured', async () => {
    const res = makeRes();
    await payments({ method: 'GET' }, res);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    const body = res.json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('GEHEIM-KEY');
    const f = body.providers.sumup.fields;
    expect(f.find((x) => x.key === 'shop_sumup_api_key')).toEqual(expect.objectContaining({ secret: true, set: true }));
    expect(f.find((x) => x.key === 'shop_sumup_api_key').value).toBeUndefined();
    expect(f.find((x) => x.key === 'shop_sumup_merchant_code').value).toBe('MC1');
    expect(body.providers.sumup.configured).toBe(true);
    expect(body.providers.stripe.configured).toBe(false);
  });

  test('PUT saves values, empty secret keeps the old one, response and audit have no secrets', async () => {
    const res = makeRes();
    await payments({ method: 'PUT', body: { providers: { sumup: { enabled: true, values: { shop_sumup_api_key: '  ', shop_sumup_merchant_code: ' MC2 ' } } } } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(store.shop_sumup_api_key).toBe('GEHEIM-KEY');
    expect(store.shop_sumup_merchant_code).toBe('MC2');
    expect(store.shop_sumup_enabled).toBe('true');
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('GEHEIM-KEY');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.payments.update' }));
    expect(JSON.stringify(logAudit.mock.calls[0][0])).not.toContain('MC2');
  });

  test('PUT stores a new secret but does not echo it', async () => {
    const res = makeRes();
    await payments({ method: 'PUT', body: { providers: { stripe: { values: { shop_stripe_secret_key: 'sk_neu' } } } } }, res);
    expect(store.shop_stripe_secret_key).toBe('sk_neu');
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('sk_neu');
  });

  test('PUT rejects foreign keys, unknown providers, bad options and long values (422, nothing written)', async () => {
    const bodies = [
      { sumup: { values: { shop_stripe_secret_key: 'x' } } },
      { nope: { enabled: true } },
      { paypal: { values: { shop_paypal_mode: 'bogus' } } },
      { sumup: { values: { shop_sumup_merchant_code: 'a'.repeat(501) } } },
    ];
    for (const providers of bodies) {
      const res = makeRes();
      await payments({ method: 'PUT', body: { providers } }, res);
      expect(res.status).toHaveBeenCalledWith(422);
    }
    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
  });
});

describe('/api/shop/payments/test-connection', () => {
  test('input takes precedence over stored values and stored fill the gaps', async () => {
    mockDriver.testConnection.mockResolvedValue({ ok: true, info: 'Konto X' });
    const res = makeRes();
    await test_({ method: 'POST', body: { provider: 'sumup', values: { shop_sumup_merchant_code: 'NEU', shop_sumup_api_key: '' } } }, res);
    const { settings } = mockDriver.testConnection.mock.calls[0][0];
    expect(settings.shop_sumup_merchant_code).toBe('NEU');
    expect(settings.shop_sumup_api_key).toBe('GEHEIM-KEY');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, info: 'Konto X' });
  });

  test('driver errors give a generic message without details', async () => {
    mockDriver.testConnection.mockRejectedValue(new Error('401 Bearer GEHEIM-KEY'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    await test_({ method: 'POST', body: { provider: 'sumup' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain('GEHEIM-KEY');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('GEHEIM-KEY');
    spy.mockRestore();
  });

  test('requires admin, add-on and a known provider', async () => {
    requireAuth.mockResolvedValue({ authorized: false, error: 'x', status: 403 });
    let res = makeRes();
    await test_({ method: 'POST', body: { provider: 'sumup' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    requireAuth.mockResolvedValue(admin);
    store.shop_enabled = 'false';
    res = makeRes();
    await test_({ method: 'POST', body: { provider: 'sumup' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    store.shop_enabled = 'true';
    res = makeRes();
    await test_({ method: 'POST', body: { provider: 'xx' } }, res);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Unbekannter Anbieter' });
  });
});
