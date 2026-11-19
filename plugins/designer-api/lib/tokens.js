import crypto from 'crypto';

// Zustandsloses Token: base64url(JSON { sub, name, role, exp }) + "." + HMAC-SHA256.
// Kein Datenbank-Eintrag nötig; alle Tokens ungültig machen = Secret ändern.
const b64 = (buf) => Buffer.from(buf).toString('base64url');

export function signToken(payload, secret, ttlMs = 8 * 60 * 60 * 1000, now = Date.now()) {
  if (!secret) throw new Error('Kein Secret');
  const body = b64(JSON.stringify({ ...payload, exp: now + ttlMs }));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return { token: `${body}.${sig}`, expiresAt: new Date(now + ttlMs).toISOString() };
}

// -> Payload oder null (falsche Signatur, abgelaufen, kaputt)
export function verifyToken(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof p.exp === 'number' && p.exp > now ? p : null;
  } catch (_e) { return null; }
}
