import { requireAuth } from '../../../lib/auth';
import { scanForServices } from '../../../lib/cookieScanner';
import { getServices, saveServices } from '../../../lib/cookieConsentStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR']);
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });

  try {
    const matches = await scanForServices();
    const existing = getServices();
    const existingIds = new Set(existing.map((s) => s.id));

    const added = matches
      .filter(({ service }) => !existingIds.has(service.id))
      .map(({ service }) => ({
        id: service.id,
        name: service.name,
        provider: service.provider,
        category: service.category,
        cookies: service.cookies,
        privacyUrl: service.privacyUrl || '',
        source: 'detected',
      }));

    if (added.length) saveServices([...existing, ...added]);

    return res.status(200).json({
      matches: matches.map((m) => ({
        serviceId: m.service.id,
        name: m.service.name,
        matchedJsFiles: m.matchedJsFiles,
        matchedIframeSources: m.matchedIframeSources,
      })),
      addedCount: added.length,
    });
  } catch (error) {
    return res.status(500).json({ error: `Fehler beim Scannen: ${error.message}` });
  }
}
