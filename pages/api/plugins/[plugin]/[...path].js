/**
 * Catch-all für Plugin-APIs: /api/plugins/<id>/<path> → routes aus plugins/<id>/server.js
 * (Spezifikation §5). Routen-Schlüssel: 'METHOD pfad/:param'. Der Kern prüft vor dem Handler:
 * Plugin aktiv (sonst 404), Route (404) und Methode (405), auth, rateLimit, Body (JSON ≤ 1 MB
 * oder roh als Buffer bei rawBody: true). Handler-Signatur: handler(req, res, ctx).
 * POST /api/plugins/<id>/__test (nur Admin) ruft den test-Hook („Verbindung testen“).
 */
import { requireAuth, PERMISSIONS } from '../../../../lib/auth';
import { rateLimit } from '../../../../lib/rateLimit';
import { rebuildLiveSnapshot } from '../../../../lib/liveRebuild';
import { getActivePlugin, getPluginSettings } from '../../../../lib/plugins/registry';

export const config = { api: { bodyParser: false } };

const MAX_BODY_BYTES = 1024 * 1024;
const limiters = new Map();

const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

// 'GET galleries/:slug' + ['galleries', 'x'] → { slug: 'x' }; null wenn der Pfad nicht passt.
export function matchPath(pattern, segments) {
  const parts = pattern.split('/').filter(Boolean);
  if (parts.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) params[parts[i].slice(1)] = segments[i];
    else if (parts[i] !== segments[i]) return null;
  }
  return params;
}

// Liefert { route, key, params } oder { status: 404|405, allow }.
export function findRoute(routes, method, segments) {
  const allow = [];
  for (const [key, route] of Object.entries(routes || {})) {
    const [m, pattern = ''] = key.split(/\s+/);
    const params = matchPath(pattern, segments);
    if (!params) continue;
    if (m.toUpperCase() === method) return { route, key, params };
    allow.push(m.toUpperCase());
  }
  return { status: allow.length ? 405 : 404, allow };
}

// 'public' → null (offen); PERMISSIONS-Name oder Rollen-Array → Rollen; sonst Konfigurationsfehler.
function rolesFor(auth) {
  if (auth === 'public') return null;
  if (Array.isArray(auth) && auth.length) return auth;
  if (typeof auth === 'string' && PERMISSIONS[auth]) return PERMISSIONS[auth];
  throw new Error(`ungültiges auth ${JSON.stringify(auth)}`);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const e = new Error('Anfrage zu groß');
      e.status = 413;
      throw e;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function parseJson(raw) {
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch (_e) {
    const e = new Error('Ungültiges JSON');
    e.status = 400;
    throw e;
  }
}

function makeCookies(req, res, id) {
  const prefix = `temgine_${id}_`;
  const full = (name) => {
    if (!/^[A-Za-z0-9_-]+$/.test(String(name))) throw new Error(`ungültiger Cookie-Name ${JSON.stringify(name)}`);
    return name.startsWith(prefix) ? name : prefix + name;
  };
  return {
    get: (name) => req.cookies?.[full(name)],
    // opts: { maxAge (Sekunden), httpOnly (Standard true), sameSite (Standard 'Lax'), path (Standard '/') }
    set: (name, value, opts = {}) => {
      const parts = [`${full(name)}=${encodeURIComponent(String(value ?? ''))}`, `Path=${opts.path || '/'}`, `SameSite=${opts.sameSite || 'Lax'}`];
      if (opts.httpOnly !== false) parts.push('HttpOnly');
      if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(Number(opts.maxAge))}`);
      if (process.env.NODE_ENV === 'production') parts.push('Secure');
      const prev = res.getHeader('Set-Cookie');
      res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [String(prev)] : []), parts.join('; ')]);
    },
  };
}

function makeLog(id) {
  const tag = `[plugin:${id}]`;
  return { info: (...a) => console.log(tag, ...a), warn: (...a) => console.warn(tag, ...a), error: (...a) => console.error(tag, ...a) };
}

export default async function handler(req, res) {
  const id = String(req.query.plugin || '');
  const segments = [].concat(req.query.path || []).map(String);
  const log = makeLog(id);
  try {
    const plugin = await getActivePlugin(id);
    if (!plugin) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' });

    const isTest = segments.length === 1 && segments[0] === '__test';
    let route = null;
    let routeKey = '__test';
    let params = {};
    if (isTest) {
      if (typeof plugin.server.test !== 'function') return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' });
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' });
      }
      route = { auth: 'SETTINGS_EDIT', handler: async (_req, r, ctx) => r.status(200).json(await plugin.server.test(ctx)) };
    } else {
      const found = findRoute(plugin.server.routes, req.method, segments);
      if (found.status === 405) {
        res.setHeader('Allow', found.allow.join(', '));
        return res.status(405).json({ error: 'Methode nicht erlaubt', code: 'METHOD_NOT_ALLOWED' });
      }
      if (found.status) return res.status(404).json({ error: 'Nicht gefunden', code: 'NOT_FOUND' });
      ({ route, key: routeKey, params } = found);
    }

    let user = null;
    const roles = rolesFor(route.auth);
    if (roles) {
      const auth = await requireAuth(req, res, roles);
      if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });
      user = auth.user;
    }

    const ip = clientIp(req);
    if (route.rateLimit) {
      const limiterKey = `${id}:${routeKey}`;
      if (!limiters.has(limiterKey)) limiters.set(limiterKey, rateLimit({ ...route.rateLimit, keyFn: (r) => `plugin:${limiterKey}:${clientIp(r)}` }));
      const { ok, retryAfter } = limiters.get(limiterKey).check(req);
      if (!ok) return res.status(429).json({ error: 'Zu viele Anfragen — bitte später erneut versuchen.', code: 'RATE_LIMIT_EXCEEDED', retryAfter });
    }

    const raw = await readBody(req);
    req.body = route.rawBody ? raw : parseJson(raw);

    const query = { ...req.query };
    delete query.plugin;
    delete query.path;
    const ctx = {
      settings: await getPluginSettings(plugin),
      user,
      clientIp: ip,
      params,
      query,
      cookies: makeCookies(req, res, id),
      log,
      rebuildSnapshot: () => rebuildLiveSnapshot(),
    };
    return await route.handler(req, res, ctx);
  } catch (e) {
    if (e.status === 400 || e.status === 413) return res.status(e.status).json({ error: e.message });
    log.error(e?.message, e?.stack);
    if (!res.headersSent) return res.status(500).json({ error: 'Interner Serverfehler', code: 'INTERNAL_ERROR' });
  }
}
