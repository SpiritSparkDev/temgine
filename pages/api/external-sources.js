import { randomUUID } from 'crypto';
import { requireAuth } from '../../lib/auth';
import { isEnabled, loadSources, saveSources, listRemote, importFromSource, SECRET_FIELDS } from '../../lib/externalSources';

export const config = { api: { responseLimit: false } };

// Geheimnisse gehen nie an den Browser — nur "<feld>_set".
const mask = (s) => {
  const config = { ...s.config };
  for (const f of SECRET_FIELDS[s.type] || []) {
    config[`${f}_set`] = !!config[f];
    delete config[f];
  }
  return { ...s, config };
};

// Leere Geheimnisfelder behalten den gespeicherten Wert (write-only wie bei Picgine).
const withStoredSecrets = (incoming, stored) => {
  const old = stored.find((x) => x.id === incoming.id);
  const config = { ...incoming.config };
  for (const f of SECRET_FIELDS[incoming.type] || []) {
    delete config[`${f}_set`];
    if (!config[f] && old?.type === incoming.type) config[f] = old.config?.[f] || '';
  }
  return { ...incoming, config };
};

export default async function handler(req, res) {
  const auth = await requireAuth(req, res, ['ADMIN']);
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });

  try {
    const stored = await loadSources();

    if (req.method === 'GET') {
      return res.status(200).json({ enabled: await isEnabled(), sources: stored.map(mask) });
    }

    if (req.method === 'PUT') {
      const list = Array.isArray(req.body?.sources) ? req.body.sources : null;
      if (!list || list.some((s) => !SECRET_FIELDS[s?.type] || !s.name)) {
        return res.status(400).json({ error: 'Ungültige Quellen' });
      }
      const next = list.map((s) => withStoredSecrets({ id: s.id || randomUUID(), type: s.type, name: String(s.name), config: s.config || {} }, stored));
      await saveSources(next);
      return res.status(200).json({ sources: next.map(mask) });
    }

    if (req.method === 'POST') {
      if (!(await isEnabled())) return res.status(403).json({ error: 'Add-on „Externe Quellen“ ist nicht aktiviert' });
      const { action, sourceId, source: draft, path, items, targetFolder } = req.body || {};
      // "test" darf eine noch ungespeicherte Quelle aus dem Formular verwenden
      const source = draft ? withStoredSecrets(draft, stored) : stored.find((s) => s.id === sourceId);
      if (!source) return res.status(404).json({ error: 'Quelle nicht gefunden' });

      if (action === 'list' || action === 'test') {
        const entries = await listRemote(source, path);
        return res.status(200).json({ ok: true, entries, count: entries.length });
      }
      if (action === 'import') {
        if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Nichts ausgewählt' });
        return res.status(200).json(await importFromSource(source, items, targetFolder));
      }
      return res.status(400).json({ error: 'Unbekannte Aktion' });
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch (e) {
    // Verbindungsfehler (falsches Passwort, Host nicht erreichbar, ...) sind für Admins hilfreich
    return res.status(200).json({ ok: false, error: e.message || 'Fehler' });
  }
}
