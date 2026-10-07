import { requireAuth, PERMISSIONS } from '../../../lib/auth';
import { picgineFetch, sendPicgineError } from '../../../lib/picgine';

// Galerie-Liste für das Auswahlfeld im Seiten-Editor — nur mit Admin-Session.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt' });

  const auth = await requireAuth(req, res, PERMISSIONS.PAGES_EDIT);
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });

  try {
    const data = await picgineFetch('/api/v1/galleries');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(data);
  } catch (e) {
    return sendPicgineError(res, e);
  }
}
