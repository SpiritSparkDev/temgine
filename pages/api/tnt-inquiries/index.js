import { requireAuth } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { buildView, applyUpdate } from '../../../lib/tntInquiriesConfig';

// Antworten enthalten nie Token (nur Maske) oder Personendaten.
export default async function handler(req, res) {
  const auth = await requireAuth(req, res, ['ADMIN']);
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') return res.status(200).json(await buildView(prisma));
    if (req.method === 'PUT') {
      const r = await applyUpdate(prisma, req.body);
      if (r.errors) return res.status(422).json({ error: 'Ungültige Eingabe', fields: r.errors });
      return res.status(200).json(r.view);
    }
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch {
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
