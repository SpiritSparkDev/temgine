import { rateLimit } from '../../../lib/rateLimit';
import { picgineFetch, isValidSlug, isValidToken, readAccessCookie, serializeAccessCookie, sendPicgineError } from '../../../lib/picgine';

const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
const limiter = rateLimit({ windowMs: 15 * 60_000, max: 10, keyFn: (req) => `picgine-unlock:${clientIp(req)}` });

// Öffentlich: entsperrt eine Galerie per Passwort (oder E-Mail + Passwort bei
// Viewer-Login) und legt den von Picgine signierten Token im Cookie ab.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

  const { ok, retryAfter } = limiter.check(req);
  if (!ok) return res.status(429).json({ error: 'Zu viele Versuche — bitte später erneut versuchen.', retryAfter });

  const { slug, email, password } = req.body || {};
  if (!isValidSlug(slug) || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Galerie und Passwort erforderlich' });
  }

  const body = { slug, password };
  if (email) body.email = String(email);
  const oldToken = readAccessCookie(req);
  if (oldToken) body.token = oldToken;

  try {
    const data = await picgineFetch('/api/v1/access/unlock', { method: 'POST', body, clientIp: clientIp(req) });
    if (!isValidToken(data?.token)) return res.status(502).json({ error: 'Ungültige Antwort von Picgine' });
    res.setHeader('Set-Cookie', serializeAccessCookie(data.token));
    return res.status(200).json({ ok: true });
  } catch (e) {
    if (e.status === 401) return res.status(401).json({ error: email ? 'E-Mail oder Passwort falsch.' : 'Falsches Passwort.' });
    return sendPicgineError(res, e);
  }
}
