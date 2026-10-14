// Ergänzt die CSP zur Laufzeit um die SumUp-Origins, wenn Shop und SumUp aktiv sind
// (Settings shop_enabled / shop_sumup_enabled). Analog zu lib/pluginCsp.js.

const { addOriginToCsp } = require('./pluginCsp')

const CACHE_MS = 30 * 1000
const SUMUP = {
  'script-src': ['https://gateway.sumup.com'],
  'connect-src': ['https://*.sumup.com'],
  'frame-src': ['https://*.sumup.com', 'https://*.ppipe.net', 'https://*.oppwa.com'],
}

let cache = { additions: {}, at: 0 }
let client = null

function buildShopCspAdditions({ shop_enabled, shop_sumup_enabled } = {}) {
  return shop_enabled === 'true' && shop_sumup_enabled === 'true' ? SUMUP : {}
}

function applyAdditions(csp, additions) {
  let out = csp
  for (const [directive, origins] of Object.entries(additions)) {
    for (const origin of origins) out = addOriginToCsp(out, origin, [directive])
  }
  return out
}

async function loadAdditions() {
  if (!process.env.DATABASE_URL) return {}
  if (!client) {
    const { PrismaClient } = require('@prisma/client')
    client = new PrismaClient()
  }
  const rows = await client.setting.findMany({ where: { key: { in: ['shop_enabled', 'shop_sumup_enabled'] } } })
  const map = {}
  for (const r of rows) map[r.key] = r.value
  return buildShopCspAdditions(map)
}

// Liefert gecachte Ergänzungen sofort; Aktualisierung im Hintergrund, bei Fehlern bleibt der letzte Wert.
function getAdditions() {
  if (Date.now() - cache.at > CACHE_MS) {
    cache.at = Date.now()
    loadAdditions()
      .then(a => { cache.additions = a })
      .catch(e => console.error('> Shop-CSP: Settings nicht lesbar:', e.message))
  }
  return cache.additions
}

function applyShopCsp(res) {
  const writeHead = res.writeHead
  res.writeHead = function patchedWriteHead(...args) {
    try {
      const csp = res.getHeader('content-security-policy')
      if (csp) {
        const out = applyAdditions(String(csp), getAdditions())
        if (out !== csp) res.setHeader('Content-Security-Policy', out)
      }
    } catch (e) {
      console.error('> Shop-CSP:', e.message)
    }
    return writeHead.apply(this, args)
  }
}

module.exports = { buildShopCspAdditions, applyShopCsp }
