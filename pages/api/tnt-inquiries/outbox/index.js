import crypto from 'crypto';
import { requireAuth } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { getRuntime, loadConfig } from '../../../../lib/tntInquiriesConfig';
import { processOutbox, cleanupOutbox, retryFailed } from '../../../../lib/tntInquiries';

// Nur Metadaten, nie Inhalte (kein payload, kein lastError-Freitext).
const LIST_SELECT = { id: true, formId: true, status: true, attempts: true, nextAttemptAt: true, lastStatusCode: true, createdAt: true, deliveredAt: true };

// Timer in server.js (Muster Backup-Timer): Header x-tnt-cron = process.env.TNT_CRON_SECRET.
function isCronRequest(req) {
  const secret = process.env.TNT_CRON_SECRET;
  const got = req.headers['x-tnt-cron'];
  if (!secret || typeof got !== 'string' || got.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST' && req.body?.action === 'process' && isCronRequest(req)) {
      await cleanupOutbox(prisma); // Aufbewahrungsfrist gilt auch bei deaktiviertem Add-on
      if (!(await loadConfig(prisma)).enabled) return res.status(200).json({ ok: true, active: false });
      const r = await processOutbox(prisma, new Date(), await getRuntime(prisma));
      return res.status(200).json({ ok: true, ...r });
    }

    const auth = await requireAuth(req, res, ['ADMIN']);
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });

    if (req.method === 'GET') {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const rows = await prisma.inquiryOutbox.findMany({ orderBy: { createdAt: 'desc' }, take: limit, select: LIST_SELECT });
      return res.status(200).json(rows);
    }
    if (req.method === 'POST' && req.body?.action === 'retry') {
      const ok = typeof req.body.id === 'string' && (await retryFailed(prisma, req.body.id));
      if (!ok) return res.status(409).json({ error: 'Nur fehlgeschlagene Absendungen mit vorhandenem Inhalt können erneut gesendet werden.' });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch {
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
