import { requireAuth } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { testConnection } from '../../../../lib/tntInquiriesConfig';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });
  const auth = await requireAuth(req, res, ['ADMIN']);
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });
  try {
    return res.status(200).json(await testConnection(prisma));
  } catch {
    return res.status(200).json({ ok: false, status: null, hint: 'Verbindungstest fehlgeschlagen.' });
  }
}
