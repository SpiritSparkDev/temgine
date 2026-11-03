/**
 * lib/plugins/sources.js — Git-Quellen für externe Plugins (Einstellungen → Plugins → Git-Quellen).
 *
 * Eine Quelle ist eine Git-URL (optional Branch/Tag). „Holen“ klont sie flach nach
 * data/plugin-sources/<ordner>/ und prüft die plugin.json; die Liste steht in
 * data/plugin-sources/sources.json. Aktiv wird ein Plugin erst, wenn `npm run plugins:sync`
 * es nach plugins/<id>/ kopiert hat (readSources in scripts/plugins-sync.js liest die Cache-Ordner)
 * und Temgine neu gebaut wurde — Next bündelt den Client-Code zur Build-Zeit.
 * CommonJS, weil scripts/plugins-sync.js es ohne Transpiler lädt.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { validateManifest } = require('./manifest');

const LIST_FILE = 'sources.json';
const GIT_TIMEOUT_MS = 120_000;

const cacheDir = (root = process.cwd()) => path.join(root, 'data', 'plugin-sources');
const listFile = (root) => path.join(cacheDir(root), LIST_FILE);

// Nur https:// und ssh (git@host:pfad). Kein file://, kein ext::, nichts mit führendem "-" (Option-Injection).
function validateUrl(value) {
  const url = String(value || '').trim();
  if (!url || url.length > 300 || /[\s\u0000-\u001f]/.test(url) || url.startsWith('-')) return null;
  if (/^https:\/\/[^/@\s]*@?[a-z0-9.-]+(:\d+)?\/\S+$/i.test(url)) return url;
  if (/^git@[a-z0-9.-]+:[\w./~-]+$/i.test(url)) return url;
  return null;
}

// Branch/Tag: keine Optionen, keine Leerzeichen; leer = Standard-Branch.
function validateRef(value) {
  const ref = String(value || '').trim();
  if (!ref) return '';
  return /^[\w][\w./-]{0,99}$/.test(ref) && !ref.includes('..') ? ref : null;
}

function readList(root) {
  try {
    const list = JSON.parse(fs.readFileSync(listFile(root), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (_e) {
    return [];
  }
}

function writeList(root, list) {
  fs.mkdirSync(cacheDir(root), { recursive: true });
  fs.writeFileSync(listFile(root), `${JSON.stringify(list, null, 2)}\n`);
}

const keyOf = (url, ref) => `${url}#${ref || ''}`;

function addSource(root, urlInput, refInput) {
  const url = validateUrl(urlInput);
  if (!url) throw new Error('Ungültige Git-URL (erlaubt: https://… oder git@host:pfad)');
  const ref = validateRef(refInput);
  if (ref === null) throw new Error('Ungültiger Branch/Tag');
  const list = readList(root);
  if (list.some((s) => keyOf(s.url, s.ref) === keyOf(url, ref))) throw new Error('Diese Quelle ist schon eingetragen');
  const entry = { url, ref, dir: '', commit: '', plugins: [], fetchedAt: null, error: '' };
  writeList(root, [...list, entry]);
  return entry;
}

function removeSource(root, urlInput, refInput) {
  const list = readList(root);
  const hit = list.find((s) => keyOf(s.url, s.ref) === keyOf(String(urlInput || ''), String(refInput || '')));
  if (!hit) return false;
  removeCacheDir(root, hit.dir);
  writeList(root, list.filter((s) => s !== hit));
  return true;
}

// Löscht nur direkte Unterordner des Caches (dir kommt aus unserer Liste, trotzdem prüfen).
function removeCacheDir(root, dir) {
  if (!dir || dir !== path.basename(dir) || dir === LIST_FILE) return;
  const full = path.join(cacheDir(root), dir);
  if (path.dirname(full) === cacheDir(root)) fs.rmSync(full, { recursive: true, force: true });
}

// Plugins eines geklonten Ordners: plugin.json im Wurzelordner (ein Plugin) oder in Unterordnern.
function inspect(dir) {
  const rootFile = path.join(dir, 'plugin.json');
  const folders = fs.existsSync(rootFile)
    ? [{ folder: null, file: rootFile }]
    : fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !/^[_.]/.test(d.name) && fs.existsSync(path.join(dir, d.name, 'plugin.json')))
      .map((d) => ({ folder: d.name, file: path.join(dir, d.name, 'plugin.json') }));
  return folders.map(({ folder, file }) => {
    try {
      const m = JSON.parse(fs.readFileSync(file, 'utf8'));
      const { errors, warnings } = validateManifest(m, folder === null ? m && m.id : folder);
      return { id: m.id, name: m.name, version: m.version, description: m.description || '', errors, warnings };
    } catch (e) {
      return { id: folder || '?', name: folder || '?', version: '', description: '', errors: [`plugin.json nicht lesbar (${e.message})`], warnings: [] };
    }
  });
}

function runGit(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: GIT_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, windowsHide: true }, (err, stdout, stderr) => {
      if (!err) return resolve(String(stdout).trim());
      if (err.code === 'ENOENT') return reject(new Error('git ist nicht installiert'));
      reject(new Error((String(stderr).trim().split('\n').pop() || err.message).slice(0, 300)));
    });
  });
}

/**
 * Klont die Quelle frisch in einen Temp-Ordner, prüft sie und ersetzt dann den Cache-Ordner.
 * Schlägt etwas fehl, bleibt der alte Stand erhalten und der Fehler steht in der Liste.
 * `git` ist injizierbar (Tests): git(args, { cwd }) → Promise<stdout>.
 */
async function fetchSource(root, urlInput, refInput, { git = runGit } = {}) {
  const list = readList(root);
  const entry = list.find((s) => keyOf(s.url, s.ref) === keyOf(String(urlInput || ''), String(refInput || '')));
  if (!entry) throw new Error('Quelle nicht gefunden');
  const base = cacheDir(root);
  const tmpName = `.tmp-${crypto.randomBytes(4).toString('hex')}`;
  const tmp = path.join(base, tmpName);
  const save = (patch) => writeList(root, readList(root).map((s) => (keyOf(s.url, s.ref) === keyOf(entry.url, entry.ref) ? { ...s, ...patch } : s)));
  try {
    fs.mkdirSync(base, { recursive: true });
    await git(['clone', '--depth', '1', ...(entry.ref ? ['--branch', entry.ref] : []), '--', entry.url, tmp]);
    const commit = (await git(['rev-parse', '--short', 'HEAD'], { cwd: tmp })).slice(0, 12);
    const plugins = inspect(tmp);
    if (!plugins.length) throw new Error('Keine plugin.json gefunden (weder im Hauptordner noch in Unterordnern)');
    const single = fs.existsSync(path.join(tmp, 'plugin.json'));
    const name = single && /^[a-z0-9-]+$/.test(plugins[0].id || '') ? plugins[0].id : `repo-${crypto.createHash('sha1').update(entry.url).digest('hex').slice(0, 8)}`;
    removeCacheDir(root, entry.dir);
    removeCacheDir(root, name);
    fs.renameSync(tmp, path.join(base, name));
    save({ dir: name, commit, plugins, fetchedAt: new Date().toISOString(), error: '' });
    return readList(root).find((s) => keyOf(s.url, s.ref) === keyOf(entry.url, entry.ref));
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    save({ error: e.message });
    throw e;
  }
}

// Absolute Pfade der geholten Cache-Ordner — Quellen für scripts/plugins-sync.js.
function cachedSourceDirs(root = process.cwd()) {
  return readList(root)
    .filter((s) => s.dir && fs.existsSync(path.join(cacheDir(root), s.dir)))
    .map((s) => path.join(cacheDir(root), s.dir));
}

module.exports = { validateUrl, validateRef, readList, addSource, removeSource, fetchSource, inspect, cachedSourceDirs, cacheDir };
