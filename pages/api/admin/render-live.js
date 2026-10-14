import { requireAuth } from '../../../lib/auth';
import { logAudit } from '../../../lib/audit';
import { rebuildLiveSnapshot } from '../../../lib/liveRebuild';

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

export default async function handler(req, res) {
  try {
    console.log('[render-live] request start', {
      method: req.method,
      userAgent: req.headers['user-agent'] || null,
      nodeEnv: process.env.NODE_ENV || '(unset)',
    });

    if (req.method !== 'POST') {
      const [status, payload] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
      return res.status(status).json(payload);
    }

    const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR']);
    if (!auth.authorized) {
      return res.status(auth.status || 401).json({ error: auth.error, code: 'UNAUTHORIZED' });
    }

    // Neubau inkl. liveRenderLast*-Status und Aktivierung des statischen Modus: lib/liveRebuild.js
    let meta;
    try {
      console.log('[render-live] snapshot generation starting');
      meta = await rebuildLiveSnapshot({ immediate: true });
    } catch (e) {
      console.error('[render-live] render failed', e);
      try {
        await logAudit({
          action: 'render_live_snapshot_failed',
          resource: 'site',
          resourceId: null,
          userId: auth.user?.id || null,
          details: { error: e?.message || 'Render fehlgeschlagen' }
        });
      } catch (_e) {}

      const [status, payload] = errorResponse(500, 'Render fehlgeschlagen', 'RENDER_FAILED', {
        message: process.env.NODE_ENV === 'production' ? undefined : e?.message
      });
      return res.status(status).json(payload);
    }

    if (!meta) {
      console.log('[render-live] rejected: render already in progress');
      const [status, payload] = errorResponse(409, 'Render läuft bereits', 'RENDER_IN_PROGRESS');
      return res.status(status).json(payload);
    }

    console.log('[render-live] snapshot generation finished', {
      renderedRoutes: meta.renderedRoutes,
      totalRoutes: meta.totalRoutes,
      durationMs: meta.durationMs,
      errorCount: Array.isArray(meta.errors) ? meta.errors.length : 0,
    });

    try {
      await logAudit({
        action: 'render_live_snapshot',
        resource: 'site',
        resourceId: null,
        userId: auth.user?.id || null,
        details: {
          renderedRoutes: meta.renderedRoutes,
          totalRoutes: meta.totalRoutes,
          durationMs: meta.durationMs,
          errors: meta.errors || []
        }
      });
    } catch (_e) {}

    return res.status(200).json({ ok: true, activatedMode: 'static', ...meta });
  } catch (e) {
    console.error('[render-live] handler failed', e);
    const [status, payload] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', {
      message: process.env.NODE_ENV === 'production' ? undefined : e?.message
    });
    return res.status(status).json(payload);
  }
}
