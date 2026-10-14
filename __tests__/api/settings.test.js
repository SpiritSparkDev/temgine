/**
 * __tests__/api/settings.test.js
 * PUT /api/settings: Allow-List (lib/settingsKeys.js) — bekannte Keys werden gespeichert,
 * unbekannte mit 400 abgelehnt, und jeder Key, den das Admin-UI schreibt, ist erlaubt.
 */

jest.disableAutomock();

const mockPrisma = { setting: { findMany: jest.fn(), upsert: jest.fn() } };
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(async () => ({ authorized: true })) }));
const mockSaveMaintenanceField = jest.fn();
jest.mock('../../lib/maintenanceStore', () => ({
  ...jest.requireActual('../../lib/maintenanceStore'),
  getAllMaintenanceAsSettings: () => ({}),
  saveMaintenanceField: (...args) => mockSaveMaintenanceField(...args),
}));

const fs = require('fs');
const path = require('path');
const settings = require('../../pages/api/settings').default;
const { CORE_SETTING_KEYS } = require('../../lib/settingsKeys');
const { RICH_TEXT_EDITOR_MODE_KEY } = require('../../lib/useRichTextEditorMode');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const put = async (key, value = 'x') => {
  const res = makeRes();
  await settings({ method: 'PUT', body: { key, value } }, res);
  return res;
};

// Alle Keys, die Komponenten per PUT /api/settings schreiben: { key: 'key', value: … },
// putSetting('key', …), Paar-Listen [['key', …], …] und saveKeys(…, ['a', 'b'], …).
function keysWrittenByUi() {
  const dir = path.join(__dirname, '../../components');
  const keys = new Set([RICH_TEXT_EDITOR_MODE_KEY]);
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    if (!src.includes("'/api/settings'") || !/method:\s*'PUT'/.test(src)) continue;
    for (const re of [/key:\s*'([A-Za-z0-9_]+)',\s*value:/g, /putSetting\('([A-Za-z0-9_]+)'/g, /\[\['([A-Za-z0-9_]+)',/g]) {
      for (const m of src.matchAll(re)) keys.add(m[1]);
    }
    // Paar-Listen: `pairs/entries = [[…], …];`, `.push(['key', …])`, `saveEntries('…', [[…]]`
    for (const m of src.matchAll(/(?:(?:pairs|entries)\s*=\s*\[([\s\S]*?)\];|\.push\((\[[^\]]*\])\)|saveEntries\('[^']*',\s*\[([\s\S]*?\])\])/g)) {
      for (const k of (m[1] || m[2] || m[3]).matchAll(/\[\s*'([A-Za-z0-9_]+)'\s*,/g)) keys.add(k[1]);
    }
    for (const m of src.matchAll(/saveKeys\('[^']*',\s*\[([^\]]*)\]/g)) {
      for (const k of m[1].matchAll(/'([A-Za-z0-9_]+)'/g)) keys.add(k[1]);
    }
  }
  return [...keys];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.setting.upsert.mockImplementation(async ({ create }) => create);
});

describe('PUT /api/settings allow-list', () => {
  test('stores an allowed core key', async () => {
    const res = await put('seo_site_name', 'Temgine');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: 'seo_site_name' } }));
  });

  test('stores maintenance page keys in the file store', async () => {
    const res = await put('maintenance_404_html', '<h1>404</h1>');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSaveMaintenanceField).toHaveBeenCalledWith('404', 'html', '<h1>404</h1>');
  });

  test('rejects an unknown key with 400, naming the key, and logs it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await put('liveRenderLastStatus', 'success');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'UNKNOWN_SETTING_KEY', error: expect.stringContaining('liveRenderLastStatus') });
    expect(warn).toHaveBeenCalledWith(expect.any(String), 'liveRenderLastStatus');
    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test('accepts every key the admin UI writes', async () => {
    const uiKeys = keysWrittenByUi();
    expect(uiKeys.length).toBeGreaterThan(30);
    const rejected = [];
    for (const key of uiKeys) {
      const res = await put(key);
      if (res.status.mock.calls[0][0] !== 200) rejected.push(key);
    }
    expect(rejected).toEqual([]);
  });

  test('every allow-listed key is written somewhere in the UI', () => {
    const uiKeys = new Set(keysWrittenByUi());
    expect(CORE_SETTING_KEYS.filter((k) => !uiKeys.has(k))).toEqual([]);
  });
});
