/**
 * @jest-environment node
 *
 * scripts/plugins-sync.js: Kopieren (Ignore-Liste, Löschen nur im Plugin-Ordner), .synced-from,
 * Registry-Generierung und plugins:check — alles in Temp-Ordnern.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { syncPlugins, checkPlugins, readSources, checksum } = require('../scripts/plugins-sync');

const silent = { warn: jest.fn(), error: jest.fn() };
let tmp; let src; let dest;
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const manifest = (id, extra = {}) => JSON.stringify({ id, name: id, version: '1.2.3', temgineApi: 1, ...extra });

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plugins-sync-'));
  src = path.join(tmp, 'src');
  dest = path.join(tmp, 'plugins');
  write(path.join(src, 'zeta', 'plugin.json'), manifest('zeta'));
  write(path.join(src, 'zeta', 'server.js'), 'export default {};');
  write(path.join(src, 'my-plug', 'plugin.json'), manifest('my-plug'));
  write(path.join(src, 'my-plug', 'server.js'), 'export default {};');
  write(path.join(src, 'my-plug', 'client.js'), 'export default {};');
  write(path.join(src, 'my-plug', 'lib', 'a.js'), 'a');
  write(path.join(src, 'my-plug', 'node_modules', 'x', 'i.js'), 'x');
  write(path.join(src, 'my-plug', '.git', 'HEAD'), 'ref');
  write(path.join(src, 'my-plug', 'debug.log'), 'log');
  write(path.join(src, '_example', 'plugin.json'), manifest('_example'));
  jest.clearAllMocks();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('copies plugins without ignored files, skips _ folders, writes .synced-from', () => {
  const r = syncPlugins({ sources: [src], destDir: dest, log: silent });
  expect(r.synced.sort()).toEqual(['my-plug', 'zeta']);
  expect(fs.existsSync(path.join(dest, 'my-plug', 'lib', 'a.js'))).toBe(true);
  for (const ignored of ['node_modules', '.git', 'debug.log']) expect(fs.existsSync(path.join(dest, 'my-plug', ignored))).toBe(false);
  expect(fs.existsSync(path.join(dest, '_example'))).toBe(false);
  const meta = JSON.parse(fs.readFileSync(path.join(dest, 'my-plug', '.synced-from'), 'utf8'));
  expect(meta).toMatchObject({ source: path.join(src, 'my-plug'), version: '1.2.3', checksum: checksum(path.join(src, 'my-plug')) });
});

test('generates sorted, deterministic registries with only existing hook files', () => {
  syncPlugins({ sources: [src], destDir: dest, log: silent });
  const server = fs.readFileSync(path.join(dest, 'index.server.js'), 'utf8');
  const client = fs.readFileSync(path.join(dest, 'index.client.js'), 'utf8');
  expect(server).toMatch(/^\/\/ generiert von scripts\/plugins-sync.js – nicht von Hand ändern/);
  expect(server).toContain("import p_my_plug from './my-plug/server';");
  expect(server).toContain("export default { 'my-plug': p_my_plug, zeta: p_zeta };");
  expect(client).toContain("export default { 'my-plug': p_my_plug };");
  expect(client).not.toContain('zeta');
  const again = syncPlugins({ sources: [src], destDir: dest, log: silent });
  expect(again).toMatchObject({ synced: [], indexChanged: false });
});

test('removes deleted files only inside the plugin folder; keeps other folders', () => {
  syncPlugins({ sources: [src], destDir: dest, log: silent });
  write(path.join(dest, 'handmade', 'plugin.json'), manifest('handmade'));
  fs.rmSync(path.join(src, 'my-plug', 'lib'), { recursive: true });
  const r = syncPlugins({ sources: [src], destDir: dest, log: silent });
  expect(r.synced).toEqual(['my-plug']);
  expect(fs.existsSync(path.join(dest, 'my-plug', 'lib'))).toBe(false);
  expect(fs.existsSync(path.join(dest, 'handmade', 'plugin.json'))).toBe(true);
  expect(fs.readFileSync(path.join(dest, 'index.server.js'), 'utf8')).not.toContain('handmade'); // hat kein server.js
});

test('invalid manifest is reported and not copied; a single plugin folder works as source', () => {
  write(path.join(src, 'broken', 'plugin.json'), manifest('other'));
  const r = syncPlugins({ sources: [src], destDir: dest, log: silent });
  expect(r.failed).toEqual(['broken']);
  expect(fs.existsSync(path.join(dest, 'broken'))).toBe(false);
  const single = syncPlugins({ sources: [path.join(src, 'zeta')], destDir: path.join(tmp, 'p2'), log: silent });
  expect(single.synced).toEqual(['zeta']);
});

test('check fails on drift, missing copy and stale registries, passes after sync', () => {
  expect(checkPlugins({ sources: [src], destDir: dest, log: silent }).ok).toBe(false);
  syncPlugins({ sources: [src], destDir: dest, log: silent });
  expect(checkPlugins({ sources: [src], destDir: dest, log: silent })).toMatchObject({ ok: true, problems: [] });
  write(path.join(src, 'zeta', 'server.js'), 'export default { changed: 1 };');
  expect(checkPlugins({ sources: [src], destDir: dest, log: silent }).problems[0]).toMatch(/zeta.*weicht von der Quelle ab/);
  syncPlugins({ sources: [src], destDir: dest, log: silent });
  fs.appendFileSync(path.join(dest, 'index.server.js'), '// manuell\n');
  expect(checkPlugins({ sources: [src], destDir: dest, log: silent }).problems).toEqual(['index.server.js ist veraltet (npm run plugins:sync)']);
});

test('TEMGINE_PLUGINS_SRC overrides config; relative paths resolve from the root', () => {
  expect(readSources(tmp, { TEMGINE_PLUGINS_SRC: ['a', path.join(tmp, 'b')].join(path.delimiter) })).toEqual([path.join(tmp, 'a'), path.join(tmp, 'b')]);
  write(path.join(tmp, 'plugins.config.json'), JSON.stringify({ sources: ['../x'] }));
  expect(readSources(tmp, {})).toEqual([path.resolve(tmp, '../x')]);
});
