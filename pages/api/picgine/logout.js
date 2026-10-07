import { picgineFetch, isValidToken, readAccessCookie, serializeAccessCookie, sendPicgineError } from '../../../lib/picgine';

// Öffentlich: meldet den Viewer ab. Picgine liefert einen Token ohne Login zurück
// (per Passwort entsperrte Galerien bleiben offen); ohne Token wird das Cookie gelöscht.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

  const token = readAccessCookie(req);
  if (!token) {
    res.setHeader('Set-Cookie', serializeAccessCookie(null));
    return res.status(200).json({ ok: true });
  }

  try {
    const data = await picgineFetch('/api/v1/access/logout', { method: 'POST', body: { token } });
    res.setHeader('Set-Cookie', serializeAccessCookie(isValidToken(data?.token) ? data.token : null));
    return res.status(200).json({ ok: true });
  } catch (e) {
    return sendPicgineError(res, e);
  }
}
