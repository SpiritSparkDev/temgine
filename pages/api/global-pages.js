import { requireAuth } from '../../lib/auth';
import { logAudit } from '../../lib/audit';
import { GLOBAL_PAGE_ROLES, listGlobalPages, getGlobalPageById, getActiveGlobalPages, saveGlobalPage, deleteGlobalPage } from '../../lib/globalPageStore';

// Rollen, die über diese API erstellt werden können — MOBILE bleibt wie
// schon in der alten Navigation-API (pages/api/navigations.js) nicht
// erstellbar (totes Gleis, siehe lib/globalPageStore.js).
const CREATABLE_ROLES = ['FOOTER', 'MAIN', 'PAGE', 'WIDGET'];

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
      const { id, active, role } = req.query;

      // Single item (with code) — used by the editor
      if (id) {
        const entry = getGlobalPageById(String(id));
        if (!entry) {
          const [status, resp] = errorResponse(404, 'Eintrag nicht gefunden', 'GLOBAL_PAGE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        return res.status(200).json(entry);
      }

      // Active entries — optionally scoped to one role
      if (active === 'true') {
        const entries = getActiveGlobalPages(role ? String(role).toUpperCase() : null)
          .map((e) => ({ id: e.id, name: e.name, role: e.role, code: e.code }));
        return res.status(200).json(entries);
      }

      // Full list (without code body) — used by GlobalPagesView
      let entries = listGlobalPages();
      if (role) entries = entries.filter((e) => e.role === String(role).toUpperCase());
      entries.sort((a, b) => (a.role === b.role ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.role.localeCompare(b.role)));

      const list = entries.map((e) => ({
        id: e.id,
        name: e.name,
        role: e.role,
        isActive: e.isActive,
        updatedAt: e.updatedAt,
        isResponsiveCombined: e.role === 'MAIN' && isResponsiveCombinedNavCode(e.code),
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
      const { name, role, code } = req.body || {};
      if (!name || !role || !code) {
        const missing = [];
        if (!name) missing.push('name');
        if (!role) missing.push('role');
        if (!code) missing.push('code');
        const [status, resp] = errorResponse(400, 'name, role und code sind erforderlich', 'VALIDATION_ERROR', { missing });
        return res.status(status).json(resp);
      }
      const resolvedRole = String(role).toUpperCase();
      if (!CREATABLE_ROLES.includes(resolvedRole)) {
        const [status, resp] = errorResponse(400, `role muss einer von ${CREATABLE_ROLES.join(', ')} sein`, 'VALIDATION_ERROR', { invalid: ['role'], value: role, valid: CREATABLE_ROLES });
        return res.status(status).json(resp);
      }

      const roleMeta = GLOBAL_PAGE_ROLES.find((r) => r.id === resolvedRole);
      // PAGE-Navs haben kein Aktivierungskonzept (immer "aktiv"); andere
      // Rollen starten inaktiv, bis explizit aktiviert.
      const entry = saveGlobalPage({ name: String(name), role: resolvedRole, code: String(code), isActive: roleMeta.alwaysActive });

      await logAudit({ action: 'CREATE', resource: 'global_page', resourceId: entry.id, userId: authResult.user.id, details: { name: entry.name, role: entry.role } });
      return res.status(201).json(entry);
    }

    // ── PUT (update) ──────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, name, code, isActive } = req.body || {};
      if (!id) {
        const [status, resp] = errorResponse(400, 'id ist erforderlich', 'VALIDATION_ERROR', { missing: ['id'] });
        return res.status(status).json(resp);
      }

      const existing = getGlobalPageById(String(id));
      if (!existing) {
        const [status, resp] = errorResponse(404, 'Eintrag nicht gefunden', 'GLOBAL_PAGE_NOT_FOUND');
        return res.status(status).json(resp);
      }

      const updated = saveGlobalPage({
        id: String(id),
        role: existing.role,
        ...(name !== undefined && { name: String(name) }),
        ...(code !== undefined && { code: String(code) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      });

      await logAudit({ action: 'UPDATE', resource: 'global_page', resourceId: updated.id, userId: authResult.user.id, details: { name: updated.name, role: updated.role, isActive: updated.isActive } });
      return res.status(200).json(updated);
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) {
        const [status, resp] = errorResponse(400, 'id ist erforderlich', 'VALIDATION_ERROR', { missing: ['id'] });
        return res.status(status).json(resp);
      }

      const existing = getGlobalPageById(String(id));
      if (!existing) {
        const [status, resp] = errorResponse(404, 'Eintrag nicht gefunden', 'GLOBAL_PAGE_NOT_FOUND');
        return res.status(status).json(resp);
      }

      deleteGlobalPage(String(id));
      await logAudit({ action: 'DELETE', resource: 'global_page', resourceId: String(id), userId: authResult.user.id, details: { name: existing.name, role: existing.role } });
      return res.status(200).json({ ok: true });
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/global-pages Error]', e.message, e.stack);
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
