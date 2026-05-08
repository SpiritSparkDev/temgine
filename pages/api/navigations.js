import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/auth';
import { logAudit } from '../../lib/audit';

const VALID_TYPES = ['MAIN', 'PAGE'];

function isResponsiveCombinedNavCode(code) {
  const src = String(code || '');
  return /class\s*=\s*["'][^"']*\bdesktop_nav\b/i.test(src)
    && /class\s*=\s*["'][^"']*\bmobile_nav\b/i.test(src);
}

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
        const nav = await prisma.navigation.findUnique({ where: { id: String(id) } });
        if (!nav) {
          const [status, resp] = errorResponse(404, 'Navigation nicht gefunden', 'NAVIGATION_NOT_FOUND');
          return res.status(status).json(resp);
        }
        return res.status(200).json(nav);
      }

      // Active navs — used by public rendering ([...slug].js)
      if (active === 'true') {
        const navs = await prisma.navigation.findMany({
          where: { isActive: true, type: { in: VALID_TYPES } },
          select: { id: true, name: true, type: true, code: true },
        });
        return res.status(200).json(navs);
      }

      // Full list (with responsive marker, but without code body) — used by NavigationView
      const navs = await prisma.navigation.findMany({
        where: { type: { in: VALID_TYPES } },
        orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, type: true, isActive: true, updatedAt: true, code: true },
      });

      const list = navs.map((nav) => ({
        id: nav.id,
        name: nav.name,
        type: nav.type,
        isActive: nav.isActive,
        updatedAt: nav.updatedAt,
        isResponsiveCombined: nav.type === 'MAIN' && isResponsiveCombinedNavCode(nav.code),
      }));

      return res.status(200).json(list);
    }

    // ── Mutations — require MODERATOR or higher ───────────────────────────────
    const authResult = await requireAuth(req, res, ['ADMIN', 'MODERATOR']);
    if (!authResult.authorized) {
      const [status, resp] = errorResponse(authResult.status || 403, authResult.error, 'UNAUTHORIZED');
      return res.status(status).json(resp);
    }

    // ── POST (create) ─────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { name, type, code } = req.body || {};
      if (!name || !type || !code) {
        const missing = [];
        if (!name) missing.push('name');
        if (!type) missing.push('type');
        if (!code) missing.push('code');
        const [status, resp] = errorResponse(400, 'name, type und code sind erforderlich', 'VALIDATION_ERROR', { missing });
        return res.status(status).json(resp);
      }
      if (!VALID_TYPES.includes(type)) {
        const [status, resp] = errorResponse(400, `type muss einer von ${VALID_TYPES.join(', ')} sein`, 'VALIDATION_ERROR', { invalid: ['type'], value: type, valid: VALID_TYPES });
        return res.status(status).json(resp);
      }

      const nav = await prisma.navigation.create({
        data: { name: String(name), type, code: String(code), isActive: false },
      });

      await logAudit({ action: 'CREATE', resource: 'navigation', resourceId: nav.id, userId: authResult.user.id, details: { name: nav.name, type: nav.type } });
      return res.status(201).json(nav);
    }

    // ── PUT (update) ──────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, name, code, isActive } = req.body || {};
      if (!id) {
        const [status, resp] = errorResponse(400, 'id ist erforderlich', 'VALIDATION_ERROR', { missing: ['id'] });
        return res.status(status).json(resp);
      }

      try {
        const existing = await prisma.navigation.findUnique({ where: { id: String(id) } });
        if (!existing) {
          const [status, resp] = errorResponse(404, 'Navigation nicht gefunden', 'NAVIGATION_NOT_FOUND');
          return res.status(status).json(resp);
        }

        // If activating: deactivate all other navs of the same type first
        if (isActive === true) {
          await prisma.navigation.updateMany({
            where: { type: existing.type, isActive: true, id: { not: String(id) } },
            data: { isActive: false },
          });
        }

        const updated = await prisma.navigation.update({
          where: { id: String(id) },
          data: {
            ...(name !== undefined && { name: String(name) }),
            ...(code !== undefined && { code: String(code) }),
            ...(isActive !== undefined && { isActive: Boolean(isActive) }),
          },
        });

        await logAudit({ action: 'UPDATE', resource: 'navigation', resourceId: updated.id, userId: authResult.user.id, details: { name: updated.name, isActive: updated.isActive } });
        return res.status(200).json(updated);
      } catch (e) {
        if (e.code === 'P2025') {
          const [status, resp] = errorResponse(404, 'Navigation nicht gefunden', 'NAVIGATION_NOT_FOUND');
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
        const existing = await prisma.navigation.findUnique({ where: { id: String(id) } });
        if (!existing) {
          const [status, resp] = errorResponse(404, 'Navigation nicht gefunden', 'NAVIGATION_NOT_FOUND');
          return res.status(status).json(resp);
        }

        await prisma.navigation.delete({ where: { id: String(id) } });
        await logAudit({ action: 'DELETE', resource: 'navigation', resourceId: String(id), userId: authResult.user.id, details: { name: existing.name } });
        return res.status(200).json({ ok: true });
      } catch (e) {
        if (e.code === 'P2025') {
          const [status, resp] = errorResponse(404, 'Navigation nicht gefunden', 'NAVIGATION_NOT_FOUND');
          return res.status(status).json(resp);
        }
        throw e;
      }
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/navigations Error]', e.message, e.stack);
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}

