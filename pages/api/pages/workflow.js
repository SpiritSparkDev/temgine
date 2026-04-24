import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';
import { logAudit } from '../../../lib/audit';
import { canTransition } from '../../../lib/workflow';

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

/**
 * POST /api/pages/workflow
 * Body: { pageId, toStatus, note? }
 *
 * Löst einen validierten Statusübergang für eine Seite aus.
 * Rechte werden anhand der Workflow-Regeln aus lib/workflow.js geprüft.
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      const [s, r] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
      return res.status(s).json(r);
    }

    const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR', 'EDITOR']);
    if (!auth.authorized) {
      const [s, r] = errorResponse(auth.status || 403, auth.error || 'Zugriff verweigert', 'FORBIDDEN');
      return res.status(s).json(r);
    }

    const { pageId, toStatus, note } = req.body || {};

    if (!pageId || typeof pageId !== 'string') {
      const [s, r] = errorResponse(400, 'pageId fehlt oder ist ungültig', 'VALIDATION_ERROR', { missing: ['pageId'] });
      return res.status(s).json(r);
    }

    const validStatuses = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'SCHEDULED'];
    if (!toStatus || !validStatuses.includes(String(toStatus).toUpperCase())) {
      const [s, r] = errorResponse(400, 'toStatus ist ungültig', 'VALIDATION_ERROR', {
        missing: ['toStatus'],
        allowed: validStatuses,
      });
      return res.status(s).json(r);
    }

    const page = await prisma.page.findUnique({ where: { id: pageId } });
    if (!page) {
      const [s, r] = errorResponse(404, 'Seite nicht gefunden', 'PAGE_NOT_FOUND');
      return res.status(s).json(r);
    }

    const targetStatus = String(toStatus).toUpperCase();
    const check = canTransition(page.status, targetStatus, auth.user.role);
    if (!check.allowed) {
      const [s, r] = errorResponse(403, check.reason, 'WORKFLOW_TRANSITION_FORBIDDEN', {
        fromStatus: page.status,
        toStatus: targetStatus,
        userRole: auth.user.role,
      });
      return res.status(s).json(r);
    }

    const updated = await prisma.page.update({
      where: { id: page.id },
      data: { status: targetStatus },
    });

    // Revision für Audit-Trail anlegen
    try {
      await prisma.pageRevision.create({
        data: {
          pageId: updated.id,
          data: {
            title:    updated.title,
            slug:     updated.slug,
            status:   updated.status,
            fromStatus: page.status,
          },
          note: note
            ? String(note).slice(0, 500)
            : `Status: ${page.status} → ${targetStatus}`,
          createdBy: auth.user.email,
        },
      });
    } catch (_e) {
      // Revision ist kein Showstopper
    }

    try {
      await logAudit({
        action:     'workflow_transition',
        resource:   'page',
        resourceId: updated.id,
        details: {
          slug:       updated.slug,
          fromStatus: page.status,
          toStatus:   targetStatus,
          by:         auth.user.email,
          note:       note || null,
        },
      });
    } catch (_e) {}

    return res.status(200).json({ ok: true, page: updated });
  } catch (e) {
    console.error('[/api/pages/workflow Error]', e.message, e.stack);
    const [s, r] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', {
      message: process.env.NODE_ENV === 'production' ? undefined : e.message,
    });
    return res.status(s).json(r);
  }
}
