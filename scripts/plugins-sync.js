#!/usr/bin/env node
/**
 * scripts/plugins-sync.js — externe Plugin-Ordner nach plugins/<id>/ kopieren (vendoring) und
 * die Registries plugins/index.server.js + plugins/index.client.js generieren.
 *
 *   npm run plugins:sync    kopiert, schreibt plugins/<id>/.synced-from und die Registries
 *   npm run plugins:check   ändert nichts; Exit 1, wenn Kopie != Quelle oder Registries veraltet
 *
 * Quellen (plugins.config.json im Temgine-Root: { "sources": ["..."] }), überschreibbar über die
 * Umgebungsvariable TEMGINE_PLUGINS_SRC (Pfadliste, getrennt mit ; unter Windows bzw. : sonst).
 * Standard: E:\Werkbank\temgine-plugins. Jeder Eintrag ist ein Basisordner (enthält Plugin-Ordner)
 * oder ein einzelner Plugin-Ordner (enthält plugin.json); relative Pfade gelten ab dem Temgine-Root.
 * Ordner mit Präfix "_" oder "." werden ignoriert. Die Registries enthalten alle Ordner in plugins/
 * mit plugin.json (auch von Hand angelegte), sortiert nach ID.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateManifest } = require('../lib/plugins/manifest');

const ROOT = path.join(__dirname, '..');
const DEFAULT_SOURCE = 'E:\\Werkbank\\temgine-plugins';
const META_FILE = '.synced-from';
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.next']);
const isIgnoredFile = (name) => name === META_FILE || name.endsWith('.log');
const HEADER = '// generiert von scripts/plugins-sync.js – nicht von Hand ändern (npm run plugins:sync)\n';

function readSources(root = ROOT, env = process.env) {
  if (env.TEMGINE_PLUGINS_SRC) return env.TEMGINE_PLUGINS_SRC.split(path.delimiter).filter(Boolean).map((p) => path.resolve(root, p));
  let list = [DEFAULT_SOURCE];
  const file = path.join(root, 'plugins.config.json');
  if (fs.existsSync(file)) {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(cfg.sources)) list = cfg.sources;
  }
  return list.map((p) => path.resolve(root, p));
}

// Alle relevanten Dateien eines Plugin-Ordners: sortierte relative Pfade (mit /).
function listFiles(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!IGNORED_DIRS.has(e.name)) out.push(...listFiles(dir, r));
    } else if (e.isFile() && !isIgnoredFile(e.name)) out.push(r);
  }
  return out.sort();
}

function checksum(dir) {
  const h = crypto.createHash('sha256');
  for (const f of listFiles(dir)) {
    h.update(f).update('\0').update(fs.readFileSync(path.join(dir, f))).update('\0');
  }
  return h.digest('hex');
}

// Findet die Plugin-Ordner aller Quellen: [{ id(folder), dir, source, manifest, errors, warnings }].
function discover(sources, log) {
  const found = [];
  for (const source of sources) {
    if (!fs.existsSync(source)) {
      log.warn(`Quelle nicht gefunden: ${source}`);
      continue;
    }
    const dirs = fs.existsSync(path.join(source, 'plugin.json'))
      ? [source]
      : fs.readdirSync(source, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !/^[_.]/.test(d.name) && fs.existsSync(path.join(source, d.name, 'plugin.json')))
        .map((d) => path.join(source, d.name));
    for (const dir of dirs) {
      const folder = path.basename(dir);
      if (/^[_.]/.test(folder)) continue;
      let manifest = null;
      let errors = [];
      let warnings = [];
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
        ({ errors, warnings } = validateManifest(manifest, folder));
      } catch (e) {
        errors = [`plugin.json nicht lesbar (${e.message})`];
      }
      found.push({ id: folder, dir, source, manifest, errors, warnings });
    }
  }
  const seen = new Map();
  for (const p of found) {
    if (seen.has(p.id)) p.errors.push(`ID doppelt (auch in ${seen.get(p.id)})`);
    else seen.set(p.id, p.dir);
  }
  return found;
}

function removeEmptyDirs(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const sub = path.join(dir, e.name);
    removeEmptyDirs(sub);
    if (!fs.readdirSync(sub).length) fs.rmdirSync(sub);
  }
}

// Spiegelt src nach dest (nur dieser Plugin-Ordner). Liefert die Zahl geänderter Dateien.
function mirror(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const want = listFiles(src);
  const have = fs.existsSync(dest) ? listFiles(dest) : [];
  let changed = 0;
  for (const f of have) {
    if (!want.includes(f)) {
      fs.rmSync(path.join(dest, f));
      changed++;
    }
  }
  for (const f of want) {
    const from = path.join(src, f);
    const to = path.join(dest, f);
    if (have.includes(f) && fs.readFileSync(from).equals(fs.readFileSync(to))) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    changed++;
  }
  removeEmptyDirs(dest);
  return changed;
}

// Registry-Quelltext: eine Import-Zeile pro Plugin, deterministisch nach ID sortiert.
function renderIndex(kind, ids, destDir) {
  const withHook = ids.filter((id) => fs.existsSync(path.join(destDir, id, `${kind}.js`)));
  const name = (id) => `p_${id.replace(/[^a-z0-9]/g, '_')}`;
  const doc = kind === 'server'
    ? '// Server-Registry: Schlüssel = Plugin-ID, Wert = Default-Export von plugins/<id>/server.js.\n'
    : '// Client-Registry: Schlüssel = Plugin-ID, Wert = Default-Export von plugins/<id>/client.js.\n// Landet im Browser-Bundle: nichts mit Secrets, Prisma oder fs importieren (Vertragstest __tests__/plugins.contract.test.js).\n';
  const imports = withHook.map((id) => `import ${name(id)} from './${id}/${kind}';\n`).join('');
  const entries = withHook.map((id) => `${/^[a-z]/.test(id) && !id.includes('-') ? id : `'${id}'`}: ${name(id)}`).join(', ');
  return `${HEADER}${doc}${imports}\nexport default {${entries ? ` ${entries} ` : ''}};\n`;
}

// IDs aller Ordner in destDir mit plugin.json.
function vendoredIds(destDir) {
  if (!fs.existsSync(destDir)) return [];
  return fs.readdirSync(destDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(destDir, d.name, 'plugin.json')))
    .map((d) => d.name).sort();
}

function syncPlugins({ sources = readSources(), destDir = path.join(ROOT, 'plugins'), log = console } = {}) {
  const found = discover(sources, log);
  const bad = found.filter((p) => p.errors.length);
  bad.forEach((p) => log.error(`${p.id}: ungültig — ${p.errors.join('; ')}`));
  found.forEach((p) => p.warnings.forEach((w) => log.warn(`${p.id}: ${w}`)));
  const result = { synced: [], unchanged: [], failed: bad.map((p) => p.id), indexChanged: false };

  for (const p of found.filter((x) => !x.errors.length)) {
    const dest = path.join(destDir, p.id);
    const sum = checksum(p.dir);
    let metaOk = false;
    try { metaOk = JSON.parse(fs.readFileSync(path.join(dest, META_FILE), 'utf8')).checksum === sum; } catch (_e) { /* fehlt */ }
    const changed = mirror(p.dir, dest);
    if (!changed && metaOk && checksum(dest) === sum) {
      result.unchanged.push(p.id);
      continue;
    }
    fs.writeFileSync(path.join(dest, META_FILE), `${JSON.stringify({ source: p.dir, version: p.manifest.version, syncedAt: new Date().toISOString(), checksum: sum }, null, 2)}\n`);
    result.synced.push(p.id);
  }

  fs.mkdirSync(destDir, { recursive: true });
  const ids = vendoredIds(destDir);
  for (const kind of ['server', 'client']) {
    const file = path.join(destDir, `index.${kind}.js`);
    const text = renderIndex(kind, ids, destDir);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) {
      fs.writeFileSync(file, text);
      result.indexChanged = true;
    }
  }
  return result;
}

// Ändert nichts. Liefert { ok, problems[] }.
function checkPlugins({ sources = readSources(), destDir = path.join(ROOT, 'plugins'), log = console } = {}) {
  const problems = [];
  const found = discover(sources, log);
  for (const p of found) {
    if (p.errors.length) {
      problems.push(`${p.id}: ungültig — ${p.errors.join('; ')}`);
      continue;
    }
    const dest = path.join(destDir, p.id);
    if (!fs.existsSync(dest)) problems.push(`${p.id}: fehlt in plugins/ (npm run plugins:sync)`);
    else if (checksum(dest) !== checksum(p.dir)) problems.push(`${p.id}: Kopie weicht von der Quelle ab (npm run plugins:sync)`);
  }
  const ids = vendoredIds(destDir);
  for (const kind of ['server', 'client']) {
    const file = path.join(destDir, `index.${kind}.js`);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== renderIndex(kind, ids, destDir)) problems.push(`index.${kind}.js ist veraltet (npm run plugins:sync)`);
  }
  return { ok: !problems.length, problems, sourcesFound: found.length };
}

function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const log = { warn: (m) => console.warn(`[plugins] ${m}`), error: (m) => console.error(`[plugins] ${m}`) };
  if (check) {
    const { ok, problems, sourcesFound } = checkPlugins({ log });
    if (!sourcesFound) console.log('[plugins] Keine Quell-Plugins gefunden — prüfe nur die Registries.');
    problems.forEach((p) => console.error(`[plugins] ${p}`));
    if (ok) console.log('[plugins] OK — Kopien und Registries sind aktuell.');
    process.exit(ok ? 0 : 1);
  }
  const r = syncPlugins({ log });
  console.log(`[plugins] synchronisiert: ${r.synced.join(', ') || '–'}; unverändert: ${r.unchanged.join(', ') || '–'}${r.indexChanged ? '; Registries neu geschrieben' : ''}`);
  if (r.failed.length) {
    console.error(`[plugins] Fehler bei: ${r.failed.join(', ')}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { readSources, listFiles, checksum, discover, mirror, renderIndex, syncPlugins, checkPlugins, META_FILE };
