/**
 * @jest-environment node
 *
 * lib/plugins/sources.js: URL-Prüfung, Liste, Holen (git injiziert), Cache-Ordner als Sync-Quelle.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateUrl, validateRef, readList, addSource, removeSource, fetchSource, cachedSourceDirs, cacheDir } = require('../lib/plugins/sources');
const { readSources, syncPlugins } = require('../scripts/plugins-sync');

let root;
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const manifest = (id, version = '1.0.0') => JSON.stringify({ id, name: id, version, temgineApi: 1 });
// Fake-git: "clone … <dir>" legt die Dateien an, rev-parse liefert einen Commit.
const fakeGit = (files) => jest.fn(async (args, opts) => {
  if (args[0] === 'clone') { for (const [f, t] of Object.entries(files)) write(path.join(args[args.length - 1], f), t); return ''; }
  if (args[0] === 'rev-parse') return 'abc1234';
  throw new Error(`unerwartet: ${args.join(' ')}`);
});
const URL1 = 'https://example.com/me/plug.git';

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-src-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('validateUrl allows https and git@ only, rejects options and local protocols', () => {
  expect(validateUrl(URL1)).toBe(URL1);
  expect(validateUrl('git@github.com:me/plug.git')).toBe('git@github.com:me/plug.git');
  for (const bad of ['', '--upload-pack=x', 'file:///etc', 'ext::sh -c x', 'http://example.com/a.git', 'https://a.de/x y', '/local/path', 'https://']) expect(validateUrl(bad)).toBeNull();
  expect(validateRef('v1.2.0')).toBe('v1.2.0');
  expect(validateRef('')).toBe('');
  expect(validateRef('--help')).toBeNull();
  expect(validateRef('a..b')).toBeNull();
});

test('add rejects duplicates and bad input; remove deletes the cache folder', async () => {
  expect(() => addSource(root, 'file:///x')).toThrow(/Ungültige Git-URL/);
  addSource(root, URL1, 'main');
  expect(() => addSource(root, URL1, 'main')).toThrow(/schon eingetragen/);
  await fetchSource(root, URL1, 'main', { git: fakeGit({ 'plugin.json': manifest('plug') }) });
  expect(fs.existsSync(path.join(cacheDir(root), 'plug', 'plugin.json'))).toBe(true);
  expect(removeSource(root, URL1, 'main')).toBe(true);
  expect(fs.existsSync(path.join(cacheDir(root), 'plug'))).toBe(false);
  expect(readList(root)).toEqual([]);
});

test('single-plugin repo is stored under its id; multi-plugin repo under repo-<hash>', async () => {
  addSource(root, URL1);
  const one = await fetchSource(root, URL1, '', { git: fakeGit({ 'plugin.json': manifest('plug', '2.0.0'), 'server.js': 'x' }) });
  expect(one).toMatchObject({ dir: 'plug', commit: 'abc1234', error: '' });
  expect(one.plugins[0]).toMatchObject({ id: 'plug', version: '2.0.0', errors: [] });

  const URL2 = 'https://example.com/me/many.git';
  addSource(root, URL2);
  const many = await fetchSource(root, URL2, '', { git: fakeGit({ 'a/plugin.json': manifest('a'), 'b/plugin.json': manifest('b'), '_x/plugin.json': manifest('_x') }) });
  expect(many.dir).toMatch(/^repo-[0-9a-f]{8}$/);
  expect(many.plugins.map((p) => p.id).sort()).toEqual(['a', 'b']);
});

test('a failing fetch keeps the old state, records the error and leaves no temp folder', async () => {
  addSource(root, URL1);
  await fetchSource(root, URL1, '', { git: fakeGit({ 'plugin.json': manifest('plug') }) });
  await expect(fetchSource(root, URL1, '', { git: fakeGit({ 'README.md': 'kein Plugin' }) })).rejects.toThrow(/Keine plugin.json/);
  const [entry] = readList(root);
  expect(entry.error).toMatch(/Keine plugin.json/);
  expect(entry.dir).toBe('plug');
  expect(fs.readdirSync(cacheDir(root)).sort()).toEqual(['plug', 'sources.json']);
});

test('invalid manifests are reported per plugin', async () => {
  addSource(root, URL1);
  const e = await fetchSource(root, URL1, '', { git: fakeGit({ 'plugin.json': JSON.stringify({ id: 'plug', name: 'x', version: '1', temgineApi: 9 }) }) });
  expect(e.plugins[0].errors.join()).toMatch(/temgineApi/);
});

test('cached folders become sync sources and their plugins get vendored', async () => {
  addSource(root, URL1);
  await fetchSource(root, URL1, '', { git: fakeGit({ 'plugin.json': manifest('plug'), 'server.js': 'export default {};' }) });
  expect(cachedSourceDirs(root)).toEqual([path.join(cacheDir(root), 'plug')]);
  expect(readSources(root, { TEMGINE_PLUGINS_SRC: path.join(root, 'none') })).toContain(path.join(cacheDir(root), 'plug'));
  const dest = path.join(root, 'plugins');
  const r = syncPlugins({ sources: readSources(root, { TEMGINE_PLUGINS_SRC: path.join(root, 'none') }), destDir: dest, log: { warn: jest.fn(), error: jest.fn() } });
  expect(r.synced).toEqual(['plug']);
  expect(fs.existsSync(path.join(dest, 'plug', '.git'))).toBe(false);
});
