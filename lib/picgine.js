import { prisma } from './prisma';

// Serverseitiger Client für die Picgine-API (/api/v1/*). Der API-Schlüssel liegt
// nur in der Setting-Tabelle und erreicht nie den Browser (siehe pages/api/settings.js).
// Der Viewer-Token (Cookie temgine_picgine) wird unverändert als X-Picgine-Access
// durchgereicht — prüfen tut ihn ausschließlich Picgine.

export const PICGINE_COOKIE = 'temgine_picgine';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 Tage
const TIMEOUT_MS = 5000;

// Slugs landen im URL-Pfad — nur harmlose Zeichen, damit z. B. ".." nicht auf andere
// Picgine-Endpunkte zeigt. Tokens landen in Header/Cookie — base64url + ".".
const SLUG_RE = /^[A-Za-z0-9_-]+$/;
const TOKEN_RE = /^[A-Za-z0-9._~-]+$/;

export const isValidSlug = (slug) => typeof slug === 'string' && SLUG_RE.test(slug);
export const isValidToken = (token) => typeof token === 'string' && token.length <= 4096 && TOKEN_RE.test(token);

export class PicgineError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const STATUS_MESSAGES = {
  400: 'Ungültige Anfrage an Picgine',
  401: 'Picgine hat den Zugriff abgelehnt',
  403: 'Kein Zugriff auf diese Galerie',
  404: 'Galerie nicht gefunden',
  429: 'Zu viele Anfragen — bitte später erneut versuchen',
};

export async function getPicgineConfig() {
  const rows = await prisma.setting.findMany({ where: { key: { in: ['picgine_url', 'picgine_api_key'] } } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    url: String(s.picgine_url || '').trim().replace(/\/+$/, ''),
    apiKey: String(s.picgine_api_key || '').trim(),
  };
}

/**
 * Ruft einen Picgine-API-Pfad auf (z. B. '/api/v1/galleries') und liefert das JSON.
 * Wirft PicgineError({ status, message }) mit deutscher Meldung.
 * @param {string} path
 * @param {{ method?: string, body?: object, accessToken?: string, config?: {url, apiKey} }} opts
 */
export async function picgineFetch(path, { method = 'GET', body, accessToken, clientIp, config } = {}) {
  const { url, apiKey } = config || await getPicgineConfig();
  if (!/^https?:\/\//i.test(url) || !apiKey) {
    throw new PicgineError(503, 'Picgine ist nicht konfiguriert');
  }

  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (accessToken && isValidToken(accessToken)) headers['X-Picgine-Access'] = accessToken;
  // Besucher-IP weitergeben, damit Picgines Rate-Limit pro Besucher statt pro Temgine-Instanz greift
  if (clientIp) headers['X-Forwarded-For'] = clientIp;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${url}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    throw new PicgineError(502, e.name === 'AbortError' ? 'Picgine antwortet nicht (Zeitüberschreitung)' : 'Picgine ist nicht erreichbar');
  } finally {
    clearTimeout(timeout);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PicgineError(res.status, STATUS_MESSAGES[res.status] || `Picgine-Fehler (HTTP ${res.status})`);
  }
  return data;
}

export function serializeAccessCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  if (!token) return `${PICGINE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  return `${PICGINE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`;
}

export function readAccessCookie(req) {
  const token = req.cookies?.[PICGINE_COOKIE];
  return isValidToken(token) ? token : null;
}

// Antwort für Proxy-Routen bei Fehlern: { error } mit deutschem Text.
export function sendPicgineError(res, e) {
  if (e instanceof PicgineError) return res.status(e.status).json({ error: e.message });
  console.error('[picgine]', e?.message);
  return res.status(500).json({ error: 'Interner Serverfehler' });
}
