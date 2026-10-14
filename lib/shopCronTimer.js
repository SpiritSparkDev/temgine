// Interner Zeitplan für das Shop-Add-on (CJS, von server.js genutzt): ruft POST /api/shop/cron per HTTP auf.
const http = require('http')

function defaultRequest({ port, token }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/shop/cron', method: 'POST', headers: { 'x-shop-cron': token, 'content-length': 0 }, timeout: 30_000 },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)) },
    )
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')))
    req.on('error', reject)
    req.end()
  })
}

/** Startet den Timer; gibt { stop, tick } zurück. 404 (Add-on aus) ist kein Fehler. */
function startShopCron({ port, token, intervalMs = 5 * 60_000, firstDelayMs = 60_000, request = defaultRequest } = {}) {
  const tick = async () => {
    try {
      const status = await request({ port, token })
      if (status !== 200 && status !== 404) console.error(`[shop-cron] Antwort ${status}`)
    } catch (e) {
      console.error('[shop-cron] Aufruf fehlgeschlagen:', e.message)
    }
  }
  let interval = null
  const first = setTimeout(() => {
    tick()
    interval = setInterval(tick, intervalMs)
    interval.unref()
  }, firstDelayMs)
  first.unref()
  return { tick, stop: () => { clearTimeout(first); if (interval) clearInterval(interval) } }
}

module.exports = { startShopCron }
