import { prisma } from '../../../../lib/prisma';
import { requireAuth } from '../../../../lib/auth';

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

/**
 * GET /api/pages/[id]/workflow-history
 * Gibt den Workflow-Verlauf (Statusübergänge + Kommentare) einer Seite zurück.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      const [s, r] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
      return res.status(s).json(r);
    }

    const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR', 'EDITOR']);
    if (!auth.authorized) {
      const [s, r] = errorResponse(auth.status || 403, auth.error || 'Zugriff verweigert', 'FORBIDDEN');
      return res.status(s).json(r);
    }

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      const [s, r] = errorResponse(400, 'id fehlt oder ist ungültig', 'VALIDATION_ERROR');
      return res.status(s).json(r);
    }

    const page = await prisma.page.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!page) {
      const [s, r] = errorResponse(404, 'Seite nicht gefunden', 'PAGE_NOT_FOUND');
      return res.status(s).json(r);
    }

    const events = await prisma.pageWorkflowEvent.findMany({
      where:   { pageId: id },
      orderBy: { createdAt: 'desc' },
      take:    100,
    });

    return res.status(200).json({ events });
  } catch (e) {
    console.error('[/api/pages/[id]/workflow-history Error]', e.message);
    const [s, r] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', {
      message: process.env.NODE_ENV === 'production' ? undefined : e.message,
    });
    return res.status(s).json(r);
  }
}
