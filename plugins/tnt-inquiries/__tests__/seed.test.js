/** @jest-environment node */
jest.disableAutomock();
const seed = require('../seed.cjs');
const { makePrisma } = require('./fixtures/fakePrisma');

const OLD = { enabled: true, baseUrl: 'https://tnt.example.de', tokenEnc: 'v1:aXY=:dGFn:Y3Q=', mappings: { Anfrage: { fields: { name: 'customer.lastName' }, privacyField: 'datenschutz' } } };
const withOld = (cfg, alert) => {
  const p = makePrisma();
  if (cfg) p._settings.set('tnt_inquiries', JSON.stringify(cfg));
  if (alert) p._settings.set('tnt_inquiries_alert', alert);
  return p;
};

test('übernimmt Werte (Token unverändert verschlüsselt), aktiviert bei aktivem Alt-Add-on, löscht alte Zeilen', async () => {
  const p = withOld(OLD, JSON.stringify({ code: 'AUTH', since: 'x' }));
  expect(await seed(p)).toEqual({ migrated: true, enabled: true });
  const s = p._settings;
  expect(s.get('tnt-inquiries_base_url')).toBe(OLD.baseUrl);
  expect(s.get('tnt-inquiries_token')).toBe(OLD.tokenEnc);
  expect(JSON.parse(s.get('tnt-inquiries_mappings'))).toEqual(OLD.mappings);
  expect(JSON.parse(s.get('tnt-inquiries_alert')).code).toBe('AUTH');
  expect(s.get('plugin_tnt-inquiries_enabled')).toBe('true');
  expect(s.has('tnt_inquiries')).toBe(false);
  expect(s.has('tnt_inquiries_alert')).toBe(false);
});

test('war das alte Add-on aus, bleibt das Plugin aus (kein Enabled-Key)', async () => {
  const p = withOld({ ...OLD, enabled: false });
  await seed(p);
  expect(p._settings.has('plugin_tnt-inquiries_enabled')).toBe(false);
  expect(p._settings.get('tnt-inquiries_base_url')).toBe(OLD.baseUrl);
});

test('idempotent und überschreibt nie vorhandene Plugin-Werte', async () => {
  const p = withOld(OLD);
  p._settings.set('tnt-inquiries_base_url', 'https://schon.example.de');
  await seed(p);
  expect(p._settings.get('tnt-inquiries_base_url')).toBe('https://schon.example.de');
  const snapshot = JSON.stringify([...p._settings]);
  expect(await seed(p)).toEqual({ migrated: false });
  expect(JSON.stringify([...p._settings])).toBe(snapshot);
});

test('frische Installation und unlesbare Alt-Daten', async () => {
  const fresh = withOld(null);
  expect(await seed(fresh)).toEqual({ migrated: false });
  expect(fresh._settings.size).toBe(0);
  const broken = withOld(null);
  broken._settings.set('tnt_inquiries', '{kaputt');
  await seed(broken);
  expect(broken._settings.has('tnt_inquiries')).toBe(false);
  expect(broken._settings.has('plugin_tnt-inquiries_enabled')).toBe(false);
});
