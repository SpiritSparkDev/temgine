/**
 * GET /api/plugins          — öffentlich: { plugins: { <id>: publicSettings } } aller aktiven
 *                             Plugins (nur Nicht-Secrets) für clientInit/hydrate im Browser.
 * GET /api/plugins?all=1    — Admin: alle eingebauten Plugins mit Manifest-Daten und Status
 *                             für Einstellungen → Plugins.
 */
import { requireAuth, PERMISSIONS } from '../../../lib/auth';
import { getPlugins, getActivePlugins, getActivePublicSettings } from '../../../lib/plugins/registry';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' });
  try {
    if (!req.query.all) return res.status(200).json({ plugins: await getActivePublicSettings() });

    const auth = await requireAuth(req, res, PERMISSIONS.SETTINGS_VIEW);
    if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });
    const active = new Set((await getActivePlugins()).map((p) => p.id));
    return res.status(200).json(getPlugins().map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description || '',
      settings: p.settings,
      enabled: active.has(p.id),
      hasTest: typeof p.server.test === 'function',
    })));
  } catch (e) {
    console.error('[/api/plugins]', e.message);
    return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' });
  }
}
