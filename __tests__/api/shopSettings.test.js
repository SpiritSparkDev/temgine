/**
 * __tests__/api/shopSettings.test.js
 * /api/shop/settings (nur Admin) und die Absicherung der shop_*-Schlüssel in /api/settings.
 */

jest.disableAutomock();

const mockPrisma = { setting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() } };
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_SETTINGS: ['ADMIN'] } }));
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }));
jest.mock('../../lib/maintenanceStore', () => ({ parseSettingKey: () => null, getAllMaintenanceAsSettings: () => ({}), saveMaintenanceField: jest.fn() }));

const { requireAuth } = require('../../lib/auth');
const { logAudit } = require('../../lib/audit');
const shop = require('../../pages/api/shop/settings').default;
const settings = require('../../pages/api/settings').default;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}
const admin = { authorized: true, user: { id: 'u1', role: 'ADMIN' } };
const moderator = { authorized: true, user: { id: 'u2', role: 'MODERATOR' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.setting.findMany.mockResolvedValue([]);
  mockPrisma.setting.upsert.mockImplementation(async ({ create }) => create);
  requireAuth.mockResolvedValue(admin);
});

describe('/api/shop/settings', () => {
  test('requires the SHOP_SETTINGS roles and passes the auth failure through', async () => {
    requireAuth.mockResolvedValue({ authorized: false, error: 'Zugriff verweigert', status: 403 });
    const res = makeRes();
    await shop({ method: 'GET' }, res);
    expect(requireAuth.mock.calls[0][2]).toEqual(['ADMIN']);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.setting.findMany).not.toHaveBeenCalled();
  });

  test('GET returns the status with no-store', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([{ key: 'shop_enabled', value: 'true' }]);
    const res = makeRes();
    await shop({ method: 'GET' }, res);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].enabled).toBe(true);
  });

  test('PUT toggles the add-on, writes an audit entry and returns the new status', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([{ key: 'shop_enabled', value: 'true' }]);
    const res = makeRes();
    await shop({ method: 'PUT', body: { enabled: true } }, res);
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'shop_enabled' } }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.settings.update', userId: 'u1', details: { enabled: true } }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('PUT rejects a non-boolean value and unsupported methods', async () => {
    for (const body of [{}, { enabled: 'true' }, { enabled: 1 }]) {
      const res = makeRes();
      await shop({ method: 'PUT', body }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
    const res = makeRes();
    await shop({ method: 'DELETE' }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

describe('/api/settings with shop_ keys', () => {
  test('GET never exposes shop credentials but still shows the public flags', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([
      { key: 'shop_enabled', value: 'true' },
      { key: 'shop_sumup_merchant_code', value: 'MCODE' },
      { key: 'shop_sumup_api_key', value: 'sup_sk_SECRET' },
      { key: 'shop_stripe_secret_key', value: 'sk_test_SECRET' },
      { key: 'shop_stripe_webhook_secret', value: 'whsec_SECRET' },
      { key: 'shop_paypal_client_secret', value: 'pp_SECRET' },
      { key: 'shop_paypal_webhook_id', value: 'WH-SECRET' },
    ]);
    const res = makeRes();
    await settings({ method: 'GET' }, res);
    const body = res.json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toMatch(/SECRET/);
    expect(body.shop_sumup_api_key_set).toBe(true);
    expect(body.shop_stripe_webhook_secret_set).toBe(true);
    expect(body.shop_enabled).toBe('true');
    expect(body.shop_sumup_merchant_code).toBe('MCODE');
  });

  test('a moderator may not write shop_ keys, but other keys as before', async () => {
    requireAuth.mockResolvedValue(moderator);
    let res = makeRes();
    await settings({ method: 'PUT', body: { key: 'shop_stripe_secret_key', value: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    res = makeRes();
    await settings({ method: 'PUT', body: { key: 'shop_enabled', value: 'true' } }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();

    res = makeRes();
    await settings({ method: 'PUT', body: { key: 'site_title', value: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.setting.upsert).toHaveBeenCalledTimes(1);
  });

  test('an admin may write shop_ keys and a secret write answers with set:true only', async () => {
    const res = makeRes();
    await settings({ method: 'PUT', body: { key: 'shop_stripe_secret_key', value: 'sk_test_SECRET' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ key: 'shop_stripe_secret_key', set: true });
  });
});
