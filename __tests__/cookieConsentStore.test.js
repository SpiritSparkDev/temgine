const fs = require('fs');
const path = require('path');
const {
  getServices,
  saveServices,
  getBannerContent,
  saveBannerField,
  DEFAULT_BANNER_HTML,
} = require('../lib/cookieConsentStore');

const CONFIG_FILE = path.join(process.cwd(), 'data', 'cookie-config.json');
const BANNER_DIR = path.join(process.cwd(), 'public', 'assets', 'template', 'cookie-consent');

let originalConfig = null;

beforeAll(() => {
  originalConfig = fs.existsSync(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE, 'utf-8') : null;
});

afterEach(() => {
  if (originalConfig === null) {
    try { fs.rmSync(CONFIG_FILE, { force: true }); } catch (_e) {}
  } else {
    fs.writeFileSync(CONFIG_FILE, originalConfig, 'utf-8');
  }
  try { fs.rmSync(BANNER_DIR, { recursive: true, force: true }); } catch (_e) {}
});

describe('cookieConsentStore', () => {
  test('getServices returns an empty array when no config file exists', () => {
    try { fs.rmSync(CONFIG_FILE, { force: true }); } catch (_e) {}
    expect(getServices()).toEqual([]);
  });

  test('saveServices persists and getServices reads them back', () => {
    const services = [{ id: 'test-service', name: 'Test', category: 'marketing', cookies: [] }];
    saveServices(services);
    expect(getServices()).toEqual(services);
  });

  test('getBannerContent falls back to built-in defaults when files are missing', () => {
    try { fs.rmSync(BANNER_DIR, { recursive: true, force: true }); } catch (_e) {}
    expect(getBannerContent().html).toBe(DEFAULT_BANNER_HTML);
  });

  test('saveBannerField writes a file that getBannerContent then reads back', () => {
    saveBannerField('css', '.tcb-banner { color: red; }');
    expect(getBannerContent().css).toBe('.tcb-banner { color: red; }');
  });

  test('saveBannerField rejects an unknown field', () => {
    expect(saveBannerField('php', 'x')).toBe(false);
  });
});
