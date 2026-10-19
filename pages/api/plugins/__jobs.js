/**
 * POST /api/plugins/__jobs — interner Tick für Plugin-Jobs (lib/plugins/jobs.js). Nur mit dem
 * Prozess-Secret im Header x-plugin-cron (von server.js erzeugt); sonst 404, damit die Route
 * von außen nicht auffällt. Die ID "__jobs" kollidiert mit keiner Plugin-ID (nur [a-z0-9-]).
 */
import crypto from 'crypto';
import { runDueJobs } from '../../../lib/plugins/jobs';

export default async function handler(req, res) {
  const secret = process.env.PLUGIN_CRON_SECRET || '';
  const given = String(req.headers['x-plugin-cron'] || '');
  const ok = req.method === 'POST' && secret && given.length === secret.length
    && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' });
  try {
    return res.status(200).json({ started: await runDueJobs() });
  } catch (e) {
    console.error('[plugins/__jobs]', e.message);
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' });
  }
}
