/**
 * __tests__/api/shopSettingsRound2.test.js
 * /api/shop/settings: Verkäuferdaten, Zahlen, Währung/Sprache und Zeitplan-Token.
 */

jest.disableAutomock();

const mockPrisma = { setting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() } };
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SHOP_SETTINGS: ['ADMIN'] } }));
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn() }));
jest.mock('../../lib/shop/pages', () => ({ ensureShopPages: jest.fn().mockResolvedValue([]) }));

const { requireAuth } = require('../../lib/auth');
const { logAudit } = require('../../lib/audit');
const shop = require('../../pages/api/shop/settings').default;

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}
const put = async (body) => {
  const res = makeRes();
  await shop({ method: 'PUT', body }, res);
  return res;
};
const saved = () => Object.fromEntries(mockPrisma.setting.upsert.mock.calls.map(([a]) => [a.where.key, a.create.value]));

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.setting.findMany.mockResolvedValue([]);
  mockPrisma.setting.upsert.mockImplementation(async ({ create }) => create);
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1', role: 'ADMIN' } });
});

describe('/api/shop/settings GET effective values', () => {
  test('returns defaults for operating values and empty strings for legal ones, never the cron token', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([{ key: 'shop_seller_name', value: 'Verlag' }, { key: 'shop_cron_token', value: 'GEHEIM123456789012' }]);
    const res = makeRes();
    await shop({ method: 'GET' }, res);
    const body = res.json.mock.calls[0][0];
    expect(body.settings).toMatchObject({
      shop_seller_name: 'Verlag', shop_invoice_prefix: 'RE', shop_currency: 'EUR', shop_default_locale: 'de',
      shop_reservation_minutes: '30', shop_pending_cleanup_days: '3', shop_download_days: '30', shop_download_max: '5',
      shop_return_days: '', shop_low_stock_threshold: '', shop_seller_vat_id: '',
    });
    expect(body.cronTokenSet).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/GEHEIM/);
  });
});

describe('/api/shop/settings PUT settings', () => {
  test('saves valid values normalized (prefix upper case, numbers canonical, empty allowed) and audits the keys', async () => {
    const res = await put({ settings: {
      shop_seller_name: ' Polyfeder ', shop_seller_address: 'Weg 1\r\n12345 Ort', shop_seller_email: 'a@b.de',
      shop_invoice_prefix: 're-1', shop_currency: 'chf', shop_default_locale: 'EN',
      shop_low_stock_threshold: 3, shop_reservation_minutes: '045', shop_return_days: '', shop_download_max: '10',
    } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(saved()).toMatchObject({
      shop_seller_name: 'Polyfeder', shop_seller_address: 'Weg 1\n12345 Ort', shop_seller_email: 'a@b.de',
      shop_invoice_prefix: 'RE-1', shop_currency: 'CHF', shop_default_locale: 'en',
      shop_low_stock_threshold: '3', shop_reservation_minutes: '45', shop_return_days: '', shop_download_max: '10',
    });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'shop.settings.update', details: { settings: expect.arrayContaining(['shop_seller_name']) } }));
  });

  test('rejects invalid values with 422 and a text list, and writes nothing', async () => {
    const res = await put({ settings: {
      shop_seller_name: 'x'.repeat(101), shop_seller_phone: 'a\nb', shop_seller_email: 'kaputt', shop_invoice_prefix: 'ab_c',
      shop_currency: 'JPY', shop_default_locale: 'fr', shop_reservation_minutes: '0', shop_pending_cleanup_days: '366',
      shop_download_days: '1,5', shop_download_max: 'abc', shop_low_stock_threshold: -1, shop_return_days: '99999', shop_unbekannt: 'x',
    } });
    expect(res.status).toHaveBeenCalledWith(422);
    const { code, details } = res.json.mock.calls[0][0];
    expect(code).toBe('VALIDATION_ERROR');
    expect(details.errors).toHaveLength(13);
    expect(details.errors.join('|')).toMatch(/Unbekannte Einstellung/);
    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
  });

  test('rejects a non-object settings value', async () => {
    for (const settings of ['x', [], null]) {
      const res = await put({ settings });
      expect(res.status).toHaveBeenCalledWith(422);
    }
  });
});

describe('/api/shop/settings PUT cronToken', () => {
  test('generate stores a new random token, returns it once and never again via GET', async () => {
    const res = await put({ cronToken: { action: 'generate' } });
    expect(res.status).toHaveBeenCalledWith(200);
    const stored = saved().shop_cron_token;
    expect(stored).toMatch(/^[0-9a-f]{48}$/);
    mockPrisma.setting.findMany.mockResolvedValue([{ key: 'shop_cron_token', value: stored }]);
    const body = res.json.mock.calls[0][0];
    expect(body.generatedCronToken).toBe(stored);
    expect(logAudit.mock.calls[0][0].details).toEqual({ cronToken: 'generate' });
    const get = makeRes();
    await shop({ method: 'GET' }, get);
    expect(get.json.mock.calls[0][0].cronTokenSet).toBe(true);
    expect(JSON.stringify(get.json.mock.calls[0][0])).not.toContain(stored);
  });

  test('set validates length and characters; clear empties the value', async () => {
    let res = await put({ cronToken: { action: 'set', value: 'kurz' } });
    expect(res.status).toHaveBeenCalledWith(422);
    res = await put({ cronToken: { action: 'set', value: 'ein gueltiges token!' } });
    expect(res.status).toHaveBeenCalledWith(422);
    res = await put({ cronToken: { action: 'bogus' } });
    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();

    res = await put({ cronToken: { action: 'set', value: 'abcdefghij_klmnop-1234' } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(saved().shop_cron_token).toBe('abcdefghij_klmnop-1234');
    expect(res.json.mock.calls[0][0].generatedCronToken).toBeUndefined();

    mockPrisma.setting.upsert.mockClear();
    res = await put({ cronToken: { action: 'clear' } });
    expect(saved().shop_cron_token).toBe('');
  });

  test('an invalid token action prevents the settings of the same request from being saved', async () => {
    const res = await put({ settings: { shop_seller_name: 'X' }, cronToken: { action: 'set', value: 'x' } });
    expect(res.status).toHaveBeenCalledWith(422);
    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
  });
});
