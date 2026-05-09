import { requireAuth } from '../../../lib/auth';
import { logAudit } from '../../../lib/audit';
import { prisma } from '../../../lib/prisma';
import { renderLiveSnapshot } from '../../../lib/liveSnapshot';

let renderInProgress = false;

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

async function upsertSetting(key, value) {
  await prisma.setting.upsert({
    where: { key: String(key) },
    update: { value: String(value) },
    create: { key: String(key), value: String(value) }
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      const [status, payload] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
      return res.status(status).json(payload);
    }

    const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR']);
    if (!auth.authorized) {
      return res.status(auth.status || 401).json({ error: auth.error, code: 'UNAUTHORIZED' });
    }

    if (renderInProgress) {
      const [status, payload] = errorResponse(409, 'Render läuft bereits', 'RENDER_IN_PROGRESS');
      return res.status(status).json(payload);
    }

    renderInProgress = true;

    try {
      await upsertSetting('liveRenderLastStatus', 'running');
      await upsertSetting('liveRenderLastError', '');

      const meta = await renderLiveSnapshot();
      const hasErrors = Array.isArray(meta.errors) && meta.errors.length > 0;

      await upsertSetting('liveRenderMode', 'static');
      await upsertSetting('liveRenderLastStatus', hasErrors ? 'warning' : 'success');
      await upsertSetting('liveRenderLastAt', String(meta.renderedAt || new Date().toISOString()));
      await upsertSetting('liveRenderLastDurationMs', String(meta.durationMs || 0));
      await upsertSetting('liveRenderLastRoutes', String(meta.renderedRoutes || 0));
      await upsertSetting('liveRenderLastErrors', JSON.stringify(meta.errors || []));
      await upsertSetting('liveRenderLastError', hasErrors ? 'Einzelne Seiten konnten nicht gerendert werden' : '');

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
      await upsertSetting('liveRenderLastStatus', 'error');
      await upsertSetting('liveRenderLastError', String(e?.message || 'Render fehlgeschlagen'));

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
    } finally {
      renderInProgress = false;
    }
  } catch (e) {
    const [status, payload] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', {
      message: process.env.NODE_ENV === 'production' ? undefined : e?.message
    });
    return res.status(status).json(payload);
  }
}
