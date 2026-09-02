import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/auth';
import { logAudit } from '../../lib/audit';

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

export default async function handler(req, res) {
  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { id, active } = req.query;

      // Single item (with code) — used by editor
      if (id) {
        const footer = await prisma.footer.findUnique({ where: { id: String(id) } });
        if (!footer) {
          const [status, resp] = errorResponse(404, 'Footer nicht gefunden', 'FOOTER_NOT_FOUND');
          return res.status(status).json(resp);
        }
        return res.status(200).json(footer);
      }

      // Active footer — used by public rendering (only one can be active)
      if (active === 'true') {
        const footer = await prisma.footer.findFirst({ where: { isActive: true } });
        return res.status(200).json(footer || null);
      }

      // Full list (without code body) — used by FooterView
      const footers = await prisma.footer.findMany({
        orderBy: [{ createdAt: 'asc' }],
        select: { id: true, name: true, isActive: true, updatedAt: true },
      });
      return res.status(200).json(footers);
    }

    // ── Mutations — require MODERATOR or higher ───────────────────────────────
    const authResult = await requireAuth(req, res, ['ADMIN', 'MODERATOR']);
    if (!authResult.authorized) {
      const [status, resp] = errorResponse(authResult.status || 403, authResult.error, 'UNAUTHORIZED');
      return res.status(status).json(resp);
    }

    // ── POST (create) ─────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { name, code } = req.body || {};
      if (!name || !code) {
        const missing = [];
        if (!name) missing.push('name');
        if (!code) missing.push('code');
        const [status, resp] = errorResponse(400, 'name und code sind erforderlich', 'VALIDATION_ERROR', { missing });
        return res.status(status).json(resp);
      }

      const footer = await prisma.footer.create({
        data: { name: String(name), code: String(code), isActive: false },
      });

      await logAudit({ action: 'CREATE', resource: 'footer', resourceId: footer.id, userId: authResult.user.id, details: { name: footer.name } });
      return res.status(201).json(footer);
    }

    // ── PUT (update) ──────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, name, code, isActive } = req.body || {};
      if (!id) {
        const [status, resp] = errorResponse(400, 'id ist erforderlich', 'VALIDATION_ERROR', { missing: ['id'] });
        return res.status(status).json(resp);
      }

      try {
        const existing = await prisma.footer.findUnique({ where: { id: String(id) } });
        if (!existing) {
          const [status, resp] = errorResponse(404, 'Footer nicht gefunden', 'FOOTER_NOT_FOUND');
          return res.status(status).json(resp);
        }

        // If activating: only one footer may be active at a time
        if (isActive === true) {
          await prisma.footer.updateMany({
            where: { isActive: true, id: { not: String(id) } },
            data: { isActive: false },
          });
        }

        const updated = await prisma.footer.update({
          where: { id: String(id) },
          data: {
            ...(name !== undefined && { name: String(name) }),
            ...(code !== undefined && { code: String(code) }),
            ...(isActive !== undefined && { isActive: Boolean(isActive) }),
          },
        });

        await logAudit({ action: 'UPDATE', resource: 'footer', resourceId: updated.id, userId: authResult.user.id, details: { name: updated.name, isActive: updated.isActive } });
        return res.status(200).json(updated);
      } catch (e) {
        if (e.code === 'P2025') {
          const [status, resp] = errorResponse(404, 'Footer nicht gefunden', 'FOOTER_NOT_FOUND');
          return res.status(status).json(resp);
        }
        throw e;
      }
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) {
        const [status, resp] = errorResponse(400, 'id ist erforderlich', 'VALIDATION_ERROR', { missing: ['id'] });
        return res.status(status).json(resp);
      }

      try {
        const existing = await prisma.footer.findUnique({ where: { id: String(id) } });
        if (!existing) {
          const [status, resp] = errorResponse(404, 'Footer nicht gefunden', 'FOOTER_NOT_FOUND');
          return res.status(status).json(resp);
        }

        await prisma.footer.delete({ where: { id: String(id) } });
        await logAudit({ action: 'DELETE', resource: 'footer', resourceId: String(id), userId: authResult.user.id, details: { name: existing.name } });
        return res.status(200).json({ ok: true });
      } catch (e) {
        if (e.code === 'P2025') {
          const [status, resp] = errorResponse(404, 'Footer nicht gefunden', 'FOOTER_NOT_FOUND');
          return res.status(status).json(resp);
        }
        throw e;
      }
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/footers Error]', e.message, e.stack);
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
