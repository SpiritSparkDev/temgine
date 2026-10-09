/**
 * @jest-environment node
 *
 * Vertragstest des Plugin-Systems (Spezifikation §9) über alle eingebauten Plugins
 * (plugins/, beide Registries) plus das Test-Plugin __tests__/fixtures/plugins/echo.
 */
jest.mock('../lib/prisma', () => ({ prisma: {} }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
jest.mock('../pages/api/auth/[...nextauth]', () => ({ authOptions: {} }));

const fs = require('fs');
const path = require('path');
const { PLUGINS_DIR, API_VERSIONS, RESERVED_SECTIONS, validateManifest, loadManifests } = require('../lib/plugins/manifest');
const { publicSettings } = require('../lib/plugins/registry');
const { PERMISSIONS } = require('../lib/auth');
const serverRegistry = require('../plugins/index.server').default;
const clientRegistry = require('../plugins/index.client').default;

const FIXTURES = path.join(__dirname, 'fixtures/plugins');
const ROLES = ['ADMIN', 'MODERATOR', 'EDITOR'];

const builtIn = loadManifests(PLUGINS_DIR).map((m) => ({ manifest: m, server: serverRegistry[m.id] || {}, client: clientRegistry[m.id] || {} }));
const fixtures = loadManifests(FIXTURES).map((m) => ({
  manifest: m,
  server: require(path.join(m.dir, 'server.js')).default,
  client: require(path.join(m.dir, 'client.js')).default,
}));
const all = [...builtIn, ...fixtures];

// Statischer Import-Scan: client.js und alle relativ importierten Dateien im Plugin-Ordner.
const FORBIDDEN = /(^|\/)(prisma|server)(\.js)?$|^@prisma\/|^(node:.*|fs|child_process|crypto|net|tls)$|lib\/(picgine|auth|liveRebuild|liveSnapshot|plugins\/registry|plugins\/manifest)(\.js)?$/;
function imports(file) {
  const src = fs.readFileSync(file, 'utf8');
  return [...src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
}
function forbiddenClientImports(dir) {
  const bad = [];
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    for (const spec of imports(file)) {
      if (FORBIDDEN.test(spec)) bad.push(`${path.basename(file)}: ${spec}`);
      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file), spec);
        if (target.startsWith(dir)) [target, `${target}.js`, path.join(target, 'index.js')].forEach(visit);
      }
    }
  };
  visit(path.join(dir, 'client.js'));
  return bad;
}

test('every folder in plugins/ with plugin.json loads, every registry entry has a manifest', () => {
  const folders = fs.existsSync(PLUGINS_DIR)
    ? fs.readdirSync(PLUGINS_DIR).filter((f) => fs.existsSync(path.join(PLUGINS_DIR, f, 'plugin.json')))
    : [];
  expect(builtIn.map((p) => p.manifest.id).sort()).toEqual(folders.sort());
  const ids = builtIn.map((p) => p.manifest.id);
  expect([...Object.keys(serverRegistry), ...Object.keys(clientRegistry)].filter((id) => !ids.includes(id))).toEqual([]);
});

test('the import scan catches server imports, also via relative files', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'temgine-contract-'));
  fs.writeFileSync(path.join(dir, 'client.js'), "import ok from './ui';\nimport x from 'react';");
  fs.writeFileSync(path.join(dir, 'ui.js'), "import { prisma } from '../../lib/prisma';\nconst fs = require('fs');\nimport('./server');");
  expect(forbiddenClientImports(dir)).toEqual(['ui.js: ../../lib/prisma', 'ui.js: fs', 'ui.js: ./server']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the echo fixture is part of the contract run', () => {
  expect(fixtures.map((p) => p.manifest.id)).toEqual(['echo']);
});

test('section prefixes are unique and not reserved', () => {
  const prefixes = all.flatMap((p) => p.manifest.sections);
  expect(new Set(prefixes).size).toBe(prefixes.length);
  expect(prefixes.filter((s) => RESERVED_SECTIONS.includes(s))).toEqual([]);
});

describe.each(all.map((p) => [p.manifest.id, p]))('plugin %s', (_id, { manifest, server, client }) => {
  test('manifest valid, temgineApi known', () => {
    expect(validateManifest(manifest, path.basename(manifest.dir)).errors).toEqual([]);
    expect(API_VERSIONS).toContain(manifest.temgineApi);
  });

  test('client.js imports no prisma/fs/server modules', () => {
    expect(forbiddenClientImports(manifest.dir)).toEqual([]);
  });

  test('every route declares a valid auth', () => {
    for (const [key, route] of Object.entries(server.routes || {})) {
      const { auth } = route;
      const ok = auth === 'public'
        || (typeof auth === 'string' && Array.isArray(PERMISSIONS[auth]))
        || (Array.isArray(auth) && auth.length > 0 && auth.every((r) => ROLES.includes(r)));
      expect([key, ok]).toEqual([key, true]);
      expect(typeof route.handler).toBe('function');
      expect(key).toMatch(/^(GET|POST|PUT|PATCH|DELETE) [a-z0-9\-_/:.]+$/i);
    }
  });

  test('secrets never end up in publicSettings', () => {
    const values = Object.fromEntries(Object.keys(manifest.settings).map((k) => [k, 'wert']));
    const pub = publicSettings(manifest, values);
    for (const [key, def] of Object.entries(manifest.settings)) {
      if (def.type === 'secret') expect(pub).not.toHaveProperty(key);
    }
  });

  test('hooks have the expected shape', () => {
    if (server.test !== undefined) expect(typeof server.test).toBe('function');
    if (client.hydrate !== undefined) expect(typeof client.hydrate).toBe('function');
    if (client.clientInit !== undefined) expect(typeof client.clientInit.run).toBe('function');
  });
});
