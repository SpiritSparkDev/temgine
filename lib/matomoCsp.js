// Ergänzt die Content-Security-Policy zur Laufzeit um die Matomo-Origin aus den
// Settings (matomo_enabled / matomo_url). next.config.js kennt die DB-Werte beim
// Start nicht, daher wird der Header in server.js pro Antwort angepasst.

const CACHE_MS = 30 * 1000;
const DIRECTIVES = ['script-src', 'connect-src'];

let cache = { origin: '', at: 0 };
let client = null;

function originFromSettings({ matomo_enabled, matomo_url } = {}) {
  if (matomo_enabled !== 'true') return '';
  try {
    const u = new URL(String(matomo_url || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : '';
  } catch (_e) {
    return '';
  }
}

function addOriginToCsp(csp, origin) {
  if (!csp || !origin) return csp;
  return String(csp)
    .split(';')
    .map(part => {
      const trimmed = part.trim();
      const name = trimmed.split(/\s+/)[0];
      if (!DIRECTIVES.includes(name) || trimmed.split(/\s+/).includes(origin)) return part;
      return `${trimmed} ${origin}`;
    })
    .join(';');
}

async function loadOrigin() {
  if (!process.env.DATABASE_URL) return '';
  if (!client) {
    const { PrismaClient } = require('@prisma/client');
    client = new PrismaClient();
  }
  const rows = await client.setting.findMany({ where: { key: { in: ['matomo_enabled', 'matomo_url'] } } });
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return originFromSettings(map);
}

// Liefert die gecachte Origin sofort; Aktualisierung läuft im Hintergrund.
// Bei DB-Fehlern bleibt der letzte bekannte Wert erhalten.
function getMatomoOrigin() {
  if (Date.now() - cache.at > CACHE_MS) {
    cache.at = Date.now();
    loadOrigin()
      .then(origin => { cache.origin = origin; })
      .catch(e => console.error('> Matomo-CSP: Settings nicht lesbar:', e.message));
  }
  return cache.origin;
}

// Patcht den CSP-Header kurz bevor die Antwort rausgeht.
function applyMatomoCsp(res) {
  const writeHead = res.writeHead;
  res.writeHead = function patchedWriteHead(...args) {
    const csp = res.getHeader('content-security-policy');
    const origin = csp ? getMatomoOrigin() : '';
    if (origin) res.setHeader('Content-Security-Policy', addOriginToCsp(csp, origin));
    return writeHead.apply(this, args);
  };
}

module.exports = { originFromSettings, addOriginToCsp, applyMatomoCsp };
