import { rateLimit } from '../../../lib/rateLimit';
import { picgineFetch, clientIp, sendPicgineError } from '../../../lib/picgine';

export const RESET_MESSAGE = 'Falls ein Konto existiert, wurde eine E-Mail verschickt.';
const limiter = rateLimit({ windowMs: 15 * 60_000, max: 10, keyFn: (req) => `picgine-reset:${clientIp(req)}` });

// Öffentlich: Passwort-Reset für Picgine-Viewer anstoßen. Picgine antwortet immer 202
// (keine User-Enumeration) und verschickt den Link selbst — hier nur der neutrale Hinweis.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });

  const { ok, retryAfter } = limiter.check(req);
  if (!ok) return res.status(429).json({ error: 'Zu viele Versuche — bitte später erneut versuchen.', retryAfter });

  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' });
  }

  try {
    await picgineFetch('/api/v1/access/reset-request', { method: 'POST', body: { email }, clientIp: clientIp(req) });
    return res.status(202).json({ ok: true, message: RESET_MESSAGE });
  } catch (e) {
    return sendPicgineError(res, e);
  }
}
