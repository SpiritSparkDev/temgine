/**
 * lib/rateLimit.js
 *
 * Einfaches In-Memory-Rate-Limiting für Next.js API-Routes.
 * Kein externer Redis/Store nötig – geeignet für Single-Instance-Deployments.
 *
 * Verwendung:
 *   import { rateLimit } from '../../lib/rateLimit';
 *
 *   const limiter = rateLimit({ windowMs: 60_000, max: 20 });
 *
 *   export default async function handler(req, res) {
 *     const { ok, retryAfter } = limiter.check(req);
 *     if (!ok) return res.status(429).json({ error: 'Zu viele Anfragen', code: 'RATE_LIMIT_EXCEEDED', retryAfter });
 *     // ...
 *   }
 */

// Einfache Map: key → [{ ts }]
const store = new Map();

// Aufräumen: Einträge, die außerhalb des Fensters liegen, alle 5 Minuten entfernen
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
let lastPrune = Date.now();

function pruneOldEntries(windowMs) {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  for (const [key, hits] of store.entries()) {
    const valid = hits.filter(h => now - h < windowMs);
    if (valid.length === 0) store.delete(key);
    else store.set(key, valid);
  }
}

/**
 * Erstellt einen Rate-Limiter.
 *
 * @param {object} options
 * @param {number} options.windowMs  Zeitfenster in Millisekunden (Default: 60_000)
 * @param {number} options.max       Max. Anfragen pro Fenster pro IP (Default: 60)
 * @param {function} [options.keyFn] Optionale Funktion (req) → string für den Rate-Limit-Key
 * @returns {{ check: (req) => { ok: boolean, remaining: number, retryAfter?: number } }}
 */
function rateLimit({ windowMs = 60_000, max = 60, keyFn = null } = {}) {
  return {
    check(req) {
      pruneOldEntries(windowMs);

      // Rate-Limit-Key: IP (oder X-Forwarded-For) + optional custom key
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.socket?.remoteAddress
        || 'unknown';
      const key = keyFn ? keyFn(req) : ip;

      const now = Date.now();
      const hits = (store.get(key) || []).filter(h => now - h < windowMs);
      hits.push(now);
      store.set(key, hits);

      const remaining = Math.max(0, max - hits.length);
      if (hits.length > max) {
        const oldest = hits[0];
        const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
        return { ok: false, remaining: 0, retryAfter };
      }
      return { ok: true, remaining };
    },
  };
}

export { rateLimit };
export default rateLimit;
