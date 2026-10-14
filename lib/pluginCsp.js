// Ergänzt die Content-Security-Policy zur Laufzeit um die CSP-Regeln aktiver Plugins
// (plugins/<id>/plugin.json → csp, Spezifikation §7) sowie — als Kern-Regeln bis Plan P3/P4 —
// um die Matomo-Origin aus den
// Settings (matomo_enabled / matomo_url) und um die Picgine-Origin (picgine_url) in
// img-src — die Galerie-Bilder lädt der Browser direkt von Picgine, img-src erlaubt
// sonst nur https:. next.config.js kennt die DB-Werte beim Start nicht, daher wird
// der Header in server.js pro Antwort angepasst.

const { loadManifests, cspOrigin, enabledKey } = require('./plugins/manifest');

const CACHE_MS = 30 * 1000;
const DIRECTIVES = ['script-src', 'connect-src'];

let cache = { origins: { matomo: '', picgine: '', rules: [] }, at: 0 };
let client = null;
let manifests = null;

function safeOrigin(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : '';
  } catch (_e) {
    return '';
  }
}

function originFromSettings({ matomo_enabled, matomo_url } = {}) {
  return matomo_enabled === 'true' ? safeOrigin(matomo_url) : '';
}

function addOriginToCsp(csp, origin, directives = DIRECTIVES) {
  if (!csp || !origin) return csp;
  return String(csp)
    .split(';')
    .map(part => {
      const trimmed = part.trim();
      const name = trimmed.split(/\s+/)[0];
      if (!directives.includes(name) || trimmed.split(/\s+/).includes(origin)) return part;
      return `${trimmed} ${origin}`;
    })
    .join(';');
}

// [{ directive, origin }] aus den Manifest-Regeln aktiver Plugins (Manifeste sind bereits
// validiert). originFromSetting: Origin aus dem Setting-Wert, ungültige Werte entfallen.
function pluginCspRules(list, settings = {}) {
  const out = [];
  for (const m of list) {
    if (settings[enabledKey(m.id)] !== 'true') continue;
    for (const rule of m.csp || []) {
      const origin = rule.origin || cspOrigin(settings[rule.originFromSetting]);
      if (origin) out.push({ directive: rule.directive, origin });
    }
  }
  return out;
}

function applyRules(csp, rules) {
  return rules.reduce((out, r) => addOriginToCsp(out, r.origin, [r.directive]), csp);
}

async function loadOrigins() {
  if (!process.env.DATABASE_URL) return { matomo: '', picgine: '', rules: [] };
  if (!client) {
    const { PrismaClient } = require('@prisma/client');
    client = new PrismaClient();
  }
  if (!manifests) manifests = loadManifests();
  const pluginKeys = manifests.flatMap((m) => [enabledKey(m.id), ...(m.csp || []).map((r) => r.originFromSetting).filter(Boolean)]);
  const rows = await client.setting.findMany({ where: { key: { in: ['matomo_enabled', 'matomo_url', 'picgine_url', ...pluginKeys] } } });
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return { matomo: originFromSettings(map), picgine: safeOrigin(map.picgine_url), rules: pluginCspRules(manifests, map) };
}

// Liefert die gecachten Origins sofort; Aktualisierung läuft im Hintergrund.
// Bei DB-Fehlern bleibt der letzte bekannte Wert erhalten.
function getOrigins() {
  if (Date.now() - cache.at > CACHE_MS) {
    cache.at = Date.now();
    loadOrigins()
      .then(origins => { cache.origins = origins; })
      .catch(e => console.error('> Plugin-CSP: Settings nicht lesbar:', e.message));
  }
  return cache.origins;
}

// Patcht den CSP-Header kurz bevor die Antwort rausgeht.
function applyPluginCsp(res) {
  const writeHead = res.writeHead;
  res.writeHead = function patchedWriteHead(...args) {
    const csp = res.getHeader('content-security-policy');
    if (csp) {
      const { matomo, picgine, rules } = getOrigins();
      const out = applyRules(addOriginToCsp(addOriginToCsp(csp, matomo), picgine, ['img-src']), rules);
      if (out !== csp) res.setHeader('Content-Security-Policy', out);
    }
    return writeHead.apply(this, args);
  };
}

module.exports = { originFromSettings, addOriginToCsp, pluginCspRules, applyRules, applyPluginCsp };
