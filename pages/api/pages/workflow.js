import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';
import { logAudit } from '../../../lib/audit';
import { canTransition } from '../../../lib/workflow';
import { validate, rules } from '../../../lib/validate';
import { rateLimit } from '../../../lib/rateLimit';

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

const VALID_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'SCHEDULED'];
// 30 Workflow-Aktionen pro Minute pro IP
const limiter = rateLimit({ windowMs: 60_000, max: 30 });

/**
 * POST /api/pages/workflow
 * Body: { pageId, toStatus, note? }
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      const [s, r] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
      return res.status(s).json(r);
    }

    const { ok: rlOk, retryAfter } = limiter.check(req);
    if (!rlOk) {
      res.setHeader('Retry-After', String(retryAfter));
      const [s, r] = errorResponse(429, 'Zu viele Anfragen', 'RATE_LIMIT_EXCEEDED', { retryAfter });
      return res.status(s).json(r);
    }

    const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR', 'EDITOR']);
    if (!auth.authorized) {
      const [s, r] = errorResponse(auth.status || 403, auth.error || 'Zugriff verweigert', 'FORBIDDEN');
      return res.status(s).json(r);
    }

    const body = req.body || {};
    // Normalize toStatus before validation
    if (body.toStatus) body.toStatus = String(body.toStatus).toUpperCase();

    const [ok, errors] = validate(body, {
      pageId:   [rules.string(), rules.maxLen(128)],
      slug:     [rules.string(), rules.maxLen(255)],
      toStatus: [rules.required(), rules.oneOf(VALID_STATUSES)],
      note:     [rules.string(), rules.maxLen(1000)],
    });
    if (!ok) {
      const [s, r] = errorResponse(400, 'Ungültige Eingabe', 'VALIDATION_ERROR', errors);
      return res.status(s).json(r);
    }

    const { pageId, slug, toStatus, note } = body;

    if (!pageId && !slug) {
      const [s, r] = errorResponse(400, 'pageId oder slug erforderlich', 'VALIDATION_ERROR', { pageId: 'pageId oder slug ist erforderlich' });
      return res.status(s).json(r);
    }

    // Look up by ID first, then fall back to slug (child pages may have a
    // frontend-generated ID that doesn't exist as a DB row)
    let page = null;
    if (pageId) page = await prisma.page.findUnique({ where: { id: String(pageId) } });
    if (!page && slug) page = await prisma.page.findUnique({ where: { slug: String(slug) } });
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

    // Workflow-Event für Freigabeverlauf speichern
    try {
      await prisma.pageWorkflowEvent.create({
        data: {
          pageId:     updated.id,
          fromStatus: page.status,
          toStatus:   targetStatus,
          comment:    note ? String(note).slice(0, 2000) : null,
          createdBy:  auth.user.email,
        },
      });
    } catch (_e) {
      console.warn('[workflow] PageWorkflowEvent create failed:', _e.message);
    }

    // Revision für Autosave-Verlauf anlegen
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
