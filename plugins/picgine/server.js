// Server-Hooks des Picgine-Plugins: API-Proxy unter /api/plugins/picgine/* (der Rewrite
// /api/picgine/:path* im Kern hält alte Webhook-URLs am Laufen), Section-Daten für den
// Live-Snapshot und der Verbindungstest. Signaturen: development_docs/PLUGINS.md im Temgine-Repo.
import crypto from 'crypto';
import { picgineFetch, getConfig, isValidSlug, isValidToken, readAccessToken, writeAccessToken, sendPicgineError } from './lib/api';

export const RESET_MESSAGE = 'Falls ein Konto existiert, wurde eine E-Mail verschickt.';
const RATE_LIMIT = { windowMs: 15 * 60_000, max: 10 };

// X-Picgine-Signature: sha256=<hex> = HMAC-SHA256(rawBody), Schlüssel = Hex-SHA-256 des
// Client-API-Schlüssels (Picgine speichert nur diesen Hash, SPEC §11.5).
export function verifySignature(rawBody, header, apiKey) {
  if (!apiKey || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const key = crypto.createHash('sha256').update(apiKey).digest('hex');
  const expected = crypto.createHmac('sha256', key).update(rawBody).digest();
  const given = Buffer.from(header.slice(7), 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const fetchFor = (ctx) => (path, opts) => picgineFetch(getConfig(ctx.settings), path, opts);

export default {
  routes: {
    // Galerie-Liste für das Auswahlfeld im Seiten-Editor — nur mit Admin-Session.
    'GET galleries': {
      auth: 'PAGES_EDIT',
      handler: async (req, res, ctx) => {
        try {
          const data = await fetchFor(ctx)('/api/v1/galleries');
          res.setHeader('Cache-Control', 'private, no-store');
          return res.status(200).json(data);
        } catch (e) {
          return sendPicgineError(res, e, ctx.log);
        }
      },
    },

    // Öffentlich: Galerie-Daten für das Rendern einer Seite. Der Viewer-Token aus dem
    // Cookie wird als X-Picgine-Access durchgereicht; die Antwort ist viewer-spezifisch.
    'GET galleries/:slug': {
      auth: 'public',
      handler: async (req, res, ctx) => {
        res.setHeader('Cache-Control', 'private, no-store');
        const { slug } = ctx.params;
        // within: Unterordner-Navigation — Picgine liefert 404, wenn slug nicht im Teilbaum liegt
        const within = ctx.query.within;
        if (!isValidSlug(slug) || (within !== undefined && !isValidSlug(within))) {
          return res.status(400).json({ error: 'Ungültiger Galerie-Slug' });
        }
        try {
          const data = await fetchFor(ctx)(`/api/v1/galleries/${slug}${within ? `?within=${within}` : ''}`, { accessToken: readAccessToken(ctx) });
          return res.status(200).json(data);
        } catch (e) {
          return sendPicgineError(res, e, ctx.log);
        }
      },
    },

    // Öffentlich: entsperrt eine Galerie per Passwort (oder E-Mail + Passwort bei
    // Viewer-Login) und legt den von Picgine signierten Token im Cookie ab.
    'POST unlock': {
      auth: 'public',
      rateLimit: RATE_LIMIT,
      handler: async (req, res, ctx) => {
        const { slug, email, password } = req.body || {};
        if (!isValidSlug(slug) || !password || typeof password !== 'string') {
          return res.status(400).json({ error: 'Galerie und Passwort erforderlich' });
        }
        const body = { slug, password };
        if (email) body.email = String(email);
        const oldToken = readAccessToken(ctx);
        if (oldToken) body.token = oldToken;
        try {
          const data = await fetchFor(ctx)('/api/v1/access/unlock', { method: 'POST', body, clientIp: ctx.clientIp });
          if (!isValidToken(data?.token)) return res.status(502).json({ error: 'Ungültige Antwort von Picgine' });
          writeAccessToken(ctx, data.token);
          return res.status(200).json({ ok: true });
        } catch (e) {
          if (e.status === 401) return res.status(401).json({ error: email ? 'E-Mail oder Passwort falsch.' : 'Falsches Passwort.' });
          return sendPicgineError(res, e, ctx.log);
        }
      },
    },

    // Öffentlich: meldet den Viewer ab. Picgine liefert einen Token ohne Login zurück
    // (per Passwort entsperrte Galerien bleiben offen); ohne Token wird das Cookie gelöscht.
    'POST logout': {
      auth: 'public',
      handler: async (req, res, ctx) => {
        const token = readAccessToken(ctx);
        if (!token) {
          writeAccessToken(ctx, null);
          return res.status(200).json({ ok: true });
        }
        try {
          const data = await fetchFor(ctx)('/api/v1/access/logout', { method: 'POST', body: { token } });
          writeAccessToken(ctx, isValidToken(data?.token) ? data.token : null);
          return res.status(200).json({ ok: true });
        } catch (e) {
          return sendPicgineError(res, e, ctx.log);
        }
      },
    },

    // Öffentlich: Passwort-Reset für Picgine-Viewer anstoßen. Picgine antwortet immer 202
    // (keine User-Enumeration) und verschickt den Link selbst — hier nur der neutrale Hinweis.
    'POST reset-request': {
      auth: 'public',
      rateLimit: RATE_LIMIT,
      handler: async (req, res, ctx) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
        if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
          return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' });
        }
        try {
          await fetchFor(ctx)('/api/v1/access/reset-request', { method: 'POST', body: { email }, clientIp: ctx.clientIp });
          return res.status(202).json({ ok: true, message: RESET_MESSAGE });
        } catch (e) {
          return sendPicgineError(res, e, ctx.log);
        }
      },
    },

    // Öffentlich, aber signiert: Picgine meldet Änderungen an Galerien (SPEC §11.5).
    // rawBody: die Signatur gilt für die exakten Bytes.
    'POST webhook': {
      auth: 'public',
      rawBody: true,
      handler: (req, res, ctx) => {
        const { apiKey } = getConfig(ctx.settings);
        if (!verifySignature(req.body, req.headers['x-picgine-signature'], apiKey)) {
          return res.status(401).json({ error: 'Ungültige Signatur' });
        }
        ctx.rebuildSnapshot(); // entprellt, nur im statischen Modus
        return res.status(202).json({ ok: true });
      },
    },
  },

  // Section-Daten für den Live-Snapshot: ohne Viewer-Token — öffentliche Galerien landen fertig
  // im Snapshot, geschützte als "locked" (die Seite rendert sie dann clientseitig, siehe
  // requiresDynamic in client.js). Ein Fehler lässt nur die betroffene Galerie leer.
  sections: {
    picgine: {
      loadServer: async (slugs, ctx) => {
        const config = getConfig(ctx.settings);
        const out = {};
        for (const slug of slugs.filter(isValidSlug)) {
          const data = await picgineFetch(config, `/api/v1/galleries/${slug}`).catch((e) => {
            console.warn('[liveSnapshot] Picgine-Galerie nicht geladen', { slug, error: e.message });
            return null;
          });
          if (data) out[slug] = data;
        }
        return out;
      },
    },
  },

  // „Verbindung testen“: GET /api/v1/galleries mit URL/Schlüssel aus dem Formular (noch nicht
  // gespeichert, body.picgine_url / body.picgine_api_key) oder — falls leer — aus den Settings.
  test: async (ctx, body = {}) => {
    const stored = getConfig(ctx.settings);
    const config = getConfig({
      picgine_url: (body && body.picgine_url) || stored.url,
      picgine_api_key: (body && body.picgine_api_key) || stored.apiKey,
    });
    try {
      const data = await picgineFetch(config, '/api/v1/galleries');
      return { ok: true, message: `Verbunden — ${Array.isArray(data) ? data.length : 0} Galerie(n) gefunden` };
    } catch (e) {
      return { ok: false, message: e.message || 'Verbindung fehlgeschlagen' };
    }
  },
};
