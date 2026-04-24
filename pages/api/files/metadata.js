import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

/**
 * GET  /api/files/metadata?url=...   – ein Datensatz oder mehrere via ?urls=url1,url2
 * POST /api/files/metadata           – { url, altText?, copyright?, caption? } upsert
 * POST /api/files/metadata (bulk)    – { bulk: [{ url, ...fields }] }
 */
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { url, urls } = req.query || {};

      if (urls) {
        const urlList = String(urls).split(',').map(u => u.trim()).filter(Boolean).slice(0, 200);
        const records = await prisma.fileMetadata.findMany({ where: { url: { in: urlList } } });
        const map = {};
        for (const r of records) map[r.url] = r;
        return res.status(200).json({ metadata: map });
      }

      if (url) {
        const record = await prisma.fileMetadata.findUnique({ where: { url: String(url) } });
        return res.status(200).json({ metadata: record || null });
      }

      const [s, r] = errorResponse(400, 'url oder urls Parameter erforderlich', 'VALIDATION_ERROR');
      return res.status(s).json(r);
    }

    if (req.method === 'POST') {
      const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR', 'EDITOR']);
      if (!auth.authorized) {
        const [s, r] = errorResponse(auth.status || 403, auth.error || 'Zugriff verweigert', 'FORBIDDEN');
        return res.status(s).json(r);
      }

      const body = req.body || {};

      // Bulk upsert
      if (Array.isArray(body.bulk)) {
        const results = [];
        for (const item of body.bulk.slice(0, 200)) {
          if (!item.url) continue;
          const record = await prisma.fileMetadata.upsert({
            where: { url: String(item.url) },
            create: {
              url:       String(item.url),
              altText:   item.altText   ? String(item.altText).slice(0, 500)   : null,
              copyright: item.copyright ? String(item.copyright).slice(0, 200) : null,
              caption:   item.caption   ? String(item.caption).slice(0, 500)   : null,
            },
            update: {
              altText:   item.altText   !== undefined ? (item.altText   ? String(item.altText).slice(0, 500)   : null) : undefined,
              copyright: item.copyright !== undefined ? (item.copyright ? String(item.copyright).slice(0, 200) : null) : undefined,
              caption:   item.caption   !== undefined ? (item.caption   ? String(item.caption).slice(0, 500)   : null) : undefined,
            },
          });
          results.push(record);
        }
        return res.status(200).json({ ok: true, count: results.length });
      }

      // Single upsert
      const { url, altText, copyright, caption } = body;
      if (!url || typeof url !== 'string') {
        const [s, r] = errorResponse(400, 'url fehlt', 'VALIDATION_ERROR', { missing: ['url'] });
        return res.status(s).json(r);
      }

      const record = await prisma.fileMetadata.upsert({
        where: { url: String(url) },
        create: {
          url:       String(url),
          altText:   altText   ? String(altText).slice(0, 500)   : null,
          copyright: copyright ? String(copyright).slice(0, 200) : null,
          caption:   caption   ? String(caption).slice(0, 500)   : null,
        },
        update: {
          altText:   altText   !== undefined ? (altText   ? String(altText).slice(0, 500)   : null) : undefined,
          copyright: copyright !== undefined ? (copyright ? String(copyright).slice(0, 200) : null) : undefined,
          caption:   caption   !== undefined ? (caption   ? String(caption).slice(0, 500)   : null) : undefined,
        },
      });
      return res.status(200).json({ ok: true, metadata: record });
    }

    const [s, r] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(s).json(r);
  } catch (e) {
    console.error('[/api/files/metadata Error]', e.message);
    const [s, r] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', {
      message: process.env.NODE_ENV === 'production' ? undefined : e.message,
    });
    return res.status(s).json(r);
  }
}
