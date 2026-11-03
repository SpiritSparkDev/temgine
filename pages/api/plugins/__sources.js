/**
 * Git-Quellen für Plugins (nur Admin), siehe lib/plugins/sources.js.
 *   GET                       → { sources: [...], dockerNote } mit Status je Plugin (geladen / Build nötig)
 *   POST { url, ref? }        → Quelle eintragen und sofort holen
 *   POST { action:'fetch', url, ref? } → erneut holen (aktualisieren)
 *   DELETE { url, ref? }      → Quelle samt Cache-Ordner entfernen
 * Geholt wird nur in den Cache (data/plugin-sources/). Aktiv wird ein Plugin erst nach
 * `npm run plugins:sync` und einem Neu-Build; bereits eingespielte Plugins bleiben unberührt.
 */
import { requireAuth, PERMISSIONS } from '../../../lib/auth';
import { logAudit } from '../../../lib/audit';
import { getPlugins } from '../../../lib/plugins/registry';
import { readList, addSource, removeSource, fetchSource } from '../../../lib/plugins/sources';

// Zustand je Plugin: 'loaded' = gleiche Version steckt schon in plugins/, 'build' = Sync + Neu-Build nötig.
function view(entry) {
  const loaded = new Map(getPlugins().map((p) => [p.id, p.version]));
  return {
    ...entry,
    plugins: (entry.plugins || []).map((p) => ({ ...p, state: p.errors.length ? 'invalid' : loaded.get(p.id) === p.version ? 'loaded' : 'build' })),
  };
}

export default async function handler(req, res) {
  const auth = await requireAuth(req, res, req.method === 'GET' ? PERMISSIONS.SETTINGS_VIEW : PERMISSIONS.SETTINGS_EDIT);
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });
  const root = process.cwd();
  const { url, ref, action } = req.body || {};
  try {
    if (req.method === 'GET') return res.status(200).json({ sources: readList(root).map(view) });
    if (req.method === 'POST') {
      const target = action === 'fetch' ? { url: String(url || ''), ref: String(ref || '') } : addSource(root, url, ref);
      const entry = await fetchSource(root, target.url, target.ref);
      await logAudit({ action: action === 'fetch' ? 'plugin-source-fetch' : 'plugin-source-add', resource: 'plugin-source', userId: auth.user.id, details: { url: entry.url, ref: entry.ref, commit: entry.commit } }).catch(() => {});
      return res.status(200).json(view(entry));
    }
    if (req.method === 'DELETE') {
      if (!removeSource(root, url, ref)) return res.status(404).json({ error: 'Quelle nicht gefunden' });
      await logAudit({ action: 'plugin-source-remove', resource: 'plugin-source', userId: auth.user.id, details: { url } }).catch(() => {});
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
