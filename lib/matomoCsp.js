// Ergänzt die Content-Security-Policy zur Laufzeit um die Matomo-Origin aus den
// Settings (matomo_enabled / matomo_url) und um die Picgine-Origin (picgine_url) in
// img-src — die Galerie-Bilder lädt der Browser direkt von Picgine, img-src erlaubt
// sonst nur https:. next.config.js kennt die DB-Werte beim Start nicht, daher wird
// der Header in server.js pro Antwort angepasst.

const CACHE_MS = 30 * 1000;
const DIRECTIVES = ['script-src', 'connect-src'];

let cache = { origins: { matomo: '', picgine: '' }, at: 0 };
let client = null;

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

async function loadOrigins() {
  if (!process.env.DATABASE_URL) return { matomo: '', picgine: '' };
  if (!client) {
    const { PrismaClient } = require('@prisma/client');
    client = new PrismaClient();
  }
  const rows = await client.setting.findMany({ where: { key: { in: ['matomo_enabled', 'matomo_url', 'picgine_url'] } } });
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return { matomo: originFromSettings(map), picgine: safeOrigin(map.picgine_url) };
}

// Liefert die gecachten Origins sofort; Aktualisierung läuft im Hintergrund.
// Bei DB-Fehlern bleibt der letzte bekannte Wert erhalten.
function getOrigins() {
  if (Date.now() - cache.at > CACHE_MS) {
    cache.at = Date.now();
    loadOrigins()
      .then(origins => { cache.origins = origins; })
      .catch(e => console.error('> Matomo-CSP: Settings nicht lesbar:', e.message));
  }
  return cache.origins;
}

// Patcht den CSP-Header kurz bevor die Antwort rausgeht.
function applyMatomoCsp(res) {
  const writeHead = res.writeHead;
  res.writeHead = function patchedWriteHead(...args) {
    const csp = res.getHeader('content-security-policy');
    if (csp) {
      const { matomo, picgine } = getOrigins();
      const out = addOriginToCsp(addOriginToCsp(csp, matomo), picgine, ['img-src']);
      if (out !== csp) res.setHeader('Content-Security-Policy', out);
    }
    return writeHead.apply(this, args);
  };
}

module.exports = { originFromSettings, addOriginToCsp, applyMatomoCsp };
