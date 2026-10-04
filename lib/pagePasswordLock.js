import crypto from 'crypto';

// Signiertes Cookie, das merkt, welche passwortgeschützten Seiten (per id)
// ein Besucher bereits erfolgreich entsperrt hat — siehe
// pages/api/pages/password-lock.js. httpOnly, daher nicht per JS lesbar;
// zusätzlich HMAC-signiert, damit der Inhalt auch sonst nicht fälschbar ist.

export const PASSWORD_UNLOCK_COOKIE = 'temgine_pw_unlock';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 Tage

function getSecret() {
  return process.env.NEXTAUTH_SECRET || '';
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function buildUnlockCookieValue(pageIds) {
  const payload = JSON.stringify([...new Set(pageIds)].map(String));
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function parseUnlockCookieValue(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const [encoded, signature] = raw.split('.');
  if (!encoded || !signature) return [];
  if (sign(encoded) !== signature) return [];
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (_e) {
    return [];
  }
}

export function serializeUnlockCookie(pageIds) {
  const value = buildUnlockCookieValue(pageIds);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${PASSWORD_UNLOCK_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`;
}
