// Serverseitiger Client für die Picgine-API (/api/v1/*). Der API-Schlüssel liegt nur in der
// Setting-Tabelle (ctx.settings) und erreicht nie den Browser. Der Viewer-Token (Cookie
// temgine_picgine) wird unverändert als X-Picgine-Access durchgereicht — prüfen tut ihn Picgine.
// Keine Kern-Imports: das Plugin bekommt alles über ctx.

export const PICGINE_COOKIE = 'temgine_picgine';
export const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 Tage
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

// ctx.settings → { url, apiKey }
export function getConfig(settings = {}) {
  return {
    url: String(settings.picgine_url || '').trim().replace(/\/+$/, ''),
    apiKey: String(settings.picgine_api_key || '').trim(),
  };
}

/**
 * Ruft einen Picgine-API-Pfad auf (z. B. '/api/v1/galleries') und liefert das JSON.
 * Wirft PicgineError({ status, message }) mit deutscher Meldung.
 * @param {{url, apiKey}} config  aus getConfig(ctx.settings)
 */
export async function picgineFetch(config, path, { method = 'GET', body, accessToken, clientIp } = {}) {
  const { url, apiKey } = config;
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

// Viewer-Token aus dem Cookie (ctx.cookies erzwingt den Namensraum temgine_picgine…).
export function readAccessToken(ctx) {
  const token = ctx.cookies.get(PICGINE_COOKIE);
  return isValidToken(token) ? token : null;
}

// token = null löscht das Cookie.
export function writeAccessToken(ctx, token) {
  if (token) ctx.cookies.set(PICGINE_COOKIE, token, { maxAge: COOKIE_MAX_AGE });
  else ctx.cookies.set(PICGINE_COOKIE, '', { maxAge: 0 });
}

// Antwort für Proxy-Routen bei Fehlern: { error } mit deutschem Text.
export function sendPicgineError(res, e, log = console) {
  if (e instanceof PicgineError) return res.status(e.status).json({ error: e.message });
  log.error(e?.message);
  return res.status(500).json({ error: 'Interner Serverfehler' });
}
