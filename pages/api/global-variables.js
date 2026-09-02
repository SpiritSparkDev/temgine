import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/auth';
import { logAudit } from '../../lib/audit';
import { VALID_GLOBAL_TYPES, buildGlobalContext } from '../../lib/globalVariables';

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

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

      // Single item — used by editor
      if (id) {
        const gv = await prisma.globalVariable.findUnique({ where: { id: String(id) } });
        if (!gv) {
          const [status, resp] = errorResponse(404, 'Globale Variable nicht gefunden', 'GLOBAL_VARIABLE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        return res.status(200).json(gv);
      }

      // Resolved flat map — used by public rendering
      if (active === 'true') {
        const rows = await prisma.globalVariable.findMany({ where: { isActive: true } });
        return res.status(200).json(buildGlobalContext(rows));
      }

      // Full list — used by GlobalVariablesView
      const rows = await prisma.globalVariable.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      return res.status(200).json(rows);
    }

    // ── Mutations — require MODERATOR or higher ───────────────────────────────
    const authResult = await requireAuth(req, res, ['ADMIN', 'MODERATOR']);
    if (!authResult.authorized) {
      const [status, resp] = errorResponse(authResult.status || 403, authResult.error, 'UNAUTHORIZED');
      return res.status(status).json(resp);
    }

    // ── POST (create) ─────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { key, label, type = 'STRING', value = '', fallback = null, isActive = true, sortOrder = 0 } = req.body || {};
      if (!key || !label) {
        const missing = [];
        if (!key) missing.push('key');
        if (!label) missing.push('label');
        const [status, resp] = errorResponse(400, 'key und label sind erforderlich', 'VALIDATION_ERROR', { missing });
        return res.status(status).json(resp);
      }
      if (!KEY_RE.test(key)) {
        const [status, resp] = errorResponse(400, 'key darf nur Buchstaben, Zahlen und _ enthalten und muss mit einem Buchstaben beginnen', 'VALIDATION_ERROR', { invalid: ['key'] });
        return res.status(status).json(resp);
      }
      if (!VALID_GLOBAL_TYPES.includes(type)) {
        const [status, resp] = errorResponse(400, `type muss einer von ${VALID_GLOBAL_TYPES.join(', ')} sein`, 'VALIDATION_ERROR', { invalid: ['type'], value: type, valid: VALID_GLOBAL_TYPES });
        return res.status(status).json(resp);
      }

      try {
        const gv = await prisma.globalVariable.create({
          data: {
            key: String(key),
            label: String(label),
            type,
            value: String(value),
            fallback: fallback === null || fallback === undefined ? null : String(fallback),
            isActive: Boolean(isActive),
            sortOrder: Number(sortOrder) || 0,
          },
        });
        await logAudit({ action: 'CREATE', resource: 'global_variable', resourceId: gv.id, userId: authResult.user.id, details: { key: gv.key } });
        return res.status(201).json(gv);
      } catch (e) {
        if (e.code === 'P2002') {
          const [status, resp] = errorResponse(409, `Schlüssel "${key}" ist bereits vergeben`, 'DUPLICATE_KEY');
          return res.status(status).json(resp);
        }
        throw e;
      }
    }

    // ── PUT (update) ──────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, key, label, type, value, fallback, isActive, sortOrder } = req.body || {};
      if (!id) {
        const [status, resp] = errorResponse(400, 'id ist erforderlich', 'VALIDATION_ERROR', { missing: ['id'] });
        return res.status(status).json(resp);
      }
      if (type !== undefined && !VALID_GLOBAL_TYPES.includes(type)) {
        const [status, resp] = errorResponse(400, `type muss einer von ${VALID_GLOBAL_TYPES.join(', ')} sein`, 'VALIDATION_ERROR', { invalid: ['type'], value: type, valid: VALID_GLOBAL_TYPES });
        return res.status(status).json(resp);
      }
      if (key !== undefined && !KEY_RE.test(key)) {
        const [status, resp] = errorResponse(400, 'key darf nur Buchstaben, Zahlen und _ enthalten und muss mit einem Buchstaben beginnen', 'VALIDATION_ERROR', { invalid: ['key'] });
        return res.status(status).json(resp);
      }

      try {
        const updated = await prisma.globalVariable.update({
          where: { id: String(id) },
          data: {
            ...(key !== undefined && { key: String(key) }),
            ...(label !== undefined && { label: String(label) }),
            ...(type !== undefined && { type }),
            ...(value !== undefined && { value: String(value) }),
            ...(fallback !== undefined && { fallback: fallback === null ? null : String(fallback) }),
            ...(isActive !== undefined && { isActive: Boolean(isActive) }),
            ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) || 0 }),
          },
        });
        await logAudit({ action: 'UPDATE', resource: 'global_variable', resourceId: updated.id, userId: authResult.user.id, details: { key: updated.key } });
        return res.status(200).json(updated);
      } catch (e) {
        if (e.code === 'P2025') {
          const [status, resp] = errorResponse(404, 'Globale Variable nicht gefunden', 'GLOBAL_VARIABLE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        if (e.code === 'P2002') {
          const [status, resp] = errorResponse(409, `Schlüssel "${key}" ist bereits vergeben`, 'DUPLICATE_KEY');
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
        const existing = await prisma.globalVariable.findUnique({ where: { id: String(id) } });
        if (!existing) {
          const [status, resp] = errorResponse(404, 'Globale Variable nicht gefunden', 'GLOBAL_VARIABLE_NOT_FOUND');
          return res.status(status).json(resp);
        }

        await prisma.globalVariable.delete({ where: { id: String(id) } });
        await logAudit({ action: 'DELETE', resource: 'global_variable', resourceId: String(id), userId: authResult.user.id, details: { key: existing.key } });
        return res.status(200).json({ ok: true });
      } catch (e) {
        if (e.code === 'P2025') {
          const [status, resp] = errorResponse(404, 'Globale Variable nicht gefunden', 'GLOBAL_VARIABLE_NOT_FOUND');
          return res.status(status).json(resp);
        }
        throw e;
      }
    }

    const [status, resp] = errorResponse(405, 'Methode nicht erlaubt', 'METHOD_NOT_ALLOWED');
    return res.status(status).json(resp);
  } catch (e) {
    console.error('[/api/global-variables Error]', e.message, e.stack);
    const [status, resp] = errorResponse(500, 'Interner Serverfehler', 'INTERNAL_ERROR', { message: process.env.NODE_ENV === 'production' ? undefined : e.message });
    return res.status(status).json(resp);
  }
}
