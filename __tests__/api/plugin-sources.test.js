/**
 * @jest-environment node
 *
 * pages/api/plugins/__sources.js: Auth, Eintragen mit Fehlermeldung, Entfernen.
 */
jest.mock('../../lib/auth', () => ({ requireAuth: jest.fn(), PERMISSIONS: { SETTINGS_VIEW: ['ADMIN'], SETTINGS_EDIT: ['ADMIN'] } }));
jest.mock('../../lib/audit', () => ({ logAudit: jest.fn(async () => {}) }));
jest.mock('../../lib/plugins/registry', () => ({ getPlugins: () => [{ id: 'plug', version: '1.0.0' }] }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { requireAuth } = require('../../lib/auth');
const handler = require('../../pages/api/plugins/__sources').default;
const sources = require('../../lib/plugins/sources');

const res = () => { const r = { status: jest.fn(() => r), json: jest.fn(() => r) }; return r; };
let tmp; let cwd;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'src-api-'));
  cwd = jest.spyOn(process, 'cwd').mockReturnValue(tmp);
  requireAuth.mockResolvedValue({ authorized: true, user: { id: 'u1' } });
});
afterEach(() => { cwd.mockRestore(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('denies without permission', async () => {
  requireAuth.mockResolvedValue({ authorized: false, status: 403, error: 'nein' });
  const r = res();
  await handler({ method: 'GET', body: {} }, r);
  expect(r.status).toHaveBeenCalledWith(403);
});

test('rejects invalid URLs with 400 and a message', async () => {
  const r = res();
  await handler({ method: 'POST', body: { url: 'file:///etc/passwd' } }, r);
  expect(r.status).toHaveBeenCalledWith(400);
  expect(r.json.mock.calls[0][0].error).toMatch(/Ungültige Git-URL/);
  expect(sources.readList(tmp)).toEqual([]);
});

test('lists with per-plugin state and removes', async () => {
  sources.addSource(tmp, 'https://example.com/a/b.git');
  const list = sources.readList(tmp);
  fs.writeFileSync(path.join(sources.cacheDir(tmp), 'sources.json'), JSON.stringify([{ ...list[0], dir: 'plug', plugins: [{ id: 'plug', name: 'P', version: '1.0.0', errors: [] }, { id: 'neu', name: 'N', version: '2.0.0', errors: [] }] }]));
  let r = res();
  await handler({ method: 'GET', body: {} }, r);
  expect(r.json.mock.calls[0][0].sources[0].plugins.map((p) => p.state)).toEqual(['loaded', 'build']);
  r = res();
  await handler({ method: 'DELETE', body: { url: 'https://example.com/a/b.git', ref: '' } }, r);
  expect(r.json).toHaveBeenCalledWith({ ok: true });
  expect(sources.readList(tmp)).toEqual([]);
});
