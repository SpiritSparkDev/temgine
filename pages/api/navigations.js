import { requireAuth } from '../../lib/auth';
import { logAudit } from '../../lib/audit';
import { listNavigations, getNavigationById, getActiveNavigations, saveNavigation, deleteNavigation } from '../../lib/navigationStore';

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
        const nav = getNavigationById(String(id));
        if (!nav) {
          const [status, resp] = errorResponse(404, 'Navigation nicht gefunden', 'NAVIGATION_NOT_FOUND');
          return res.status(status).json(resp);
        }
        return res.status(200).json(nav);
      }

      // Active navs — used by public rendering ([...slug].js)
      if (active === 'true') {
        const navs = getActiveNavigations()
          .filter((n) => VALID_TYPES.includes(n.type))
          .map((n) => ({ id: n.id, name: n.name, type: n.type, code: n.code }));
        return res.status(200).json(navs);
      }

      // Full list (with responsive marker, but without code body) — used by NavigationView
      const navs = listNavigations().filter((n) => VALID_TYPES.includes(n.type));
      navs.sort((a, b) => (a.type === b.type ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.type.localeCompare(b.type)));

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

      // PAGE navs have no active/inactive concept (see navigationStore.saveNavigation);
      // MAIN keeps the old behavior of starting inactive until explicitly activated.
      const nav = saveNavigation({ name: String(name), type, code: String(code), isActive: type === 'PAGE' });

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

      const existing = getNavigationById(String(id));
      if (!existing) {
        const [status, resp] = errorResponse(404, 'Navigation nicht gefunden', 'NAVIGATION_NOT_FOUND');
        return res.status(status).json(resp);
      }

      const updated = saveNavigation({
        id: String(id),
        type: existing.type,
        ...(name !== undefined && { name: String(name) }),
        ...(code !== undefined && { code: String(code) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      });

      await logAudit({ action: 'UPDATE', resource: 'navigation', resourceId: updated.id, userId: authResult.user.id, details: { name: updated.name, isActive: updated.isActive } });
      return res.status(200).json(updated);
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) {
        const [status, resp] = errorResponse(400, 'id ist erforderlich', 'VALIDATION_ERROR', { missing: ['id'] });
        return res.status(status).json(resp);
      }

      const existing = getNavigationById(String(id));
      if (!existing) {
        const [status, resp] = errorResponse(404, 'Navigation nicht gefunden', 'NAVIGATION_NOT_FOUND');
        return res.status(status).json(resp);
      }

      deleteNavigation(String(id));
      await logAudit({ action: 'DELETE', resource: 'navigation', resourceId: String(id), userId: authResult.user.id, details: { name: existing.name } });
      return res.status(200).json({ ok: true });
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/navigations Error]', e.message, e.stack);
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
