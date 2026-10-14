import { picgineFetch, isValidSlug, readAccessCookie, sendPicgineError } from '../../../../lib/picgine';

// Öffentlich: Galerie-Daten für das Rendern einer Seite. Der Viewer-Token aus dem
// Cookie wird als X-Picgine-Access durchgereicht; die Antwort ist viewer-spezifisch.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt' });
  res.setHeader('Cache-Control', 'private, no-store');

  const slug = req.query?.slug;
  // within: Unterordner-Navigation — Picgine liefert 404, wenn slug nicht im Teilbaum liegt
  const within = req.query?.within;
  if (!isValidSlug(slug) || (within !== undefined && !isValidSlug(within))) {
    return res.status(400).json({ error: 'Ungültiger Galerie-Slug' });
  }

  try {
    const data = await picgineFetch(`/api/v1/galleries/${slug}${within ? `?within=${within}` : ''}`, { accessToken: readAccessCookie(req) });
    return res.status(200).json(data);
  } catch (e) {
    return sendPicgineError(res, e);
  }
}
