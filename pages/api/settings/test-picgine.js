import { requireAuth } from '../../../lib/auth';
import { getPicgineConfig, picgineFetch } from '../../../lib/picgine';

// Verbindungstest: GET /api/v1/galleries mit URL/Key aus dem Formular (noch nicht
// gespeichert) oder — falls leer — aus den gespeicherten Settings.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Methode nicht erlaubt' });

  const auth = await requireAuth(req, res, ['ADMIN']);
  if (!auth.authorized) return res.status(auth.status || 401).json({ ok: false, error: auth.error });

  const stored = await getPicgineConfig();
  const b = req.body || {};
  const config = {
    url: String(b.picgineUrl || stored.url).trim().replace(/\/+$/, ''),
    apiKey: String(b.apiKey || stored.apiKey).trim(),
  };

  try {
    const data = await picgineFetch('/api/v1/galleries', { config });
    return res.status(200).json({ ok: true, count: Array.isArray(data) ? data.length : 0 });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message || 'Verbindung fehlgeschlagen' });
  }
}
