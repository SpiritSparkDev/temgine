import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../lib/auth';
import { logAudit } from '../../lib/audit';

const VALID_TYPES = ['MAIN', 'PAGE', 'MOBILE'];

export default async function handler(req, res) {
  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { id, active } = req.query;

      // Single item (with code) — used by editor
      if (id) {
        const nav = await prisma.navigation.findUnique({ where: { id: String(id) } });
        if (!nav) return res.status(404).json({ error: 'Navigation nicht gefunden' });
        return res.status(200).json(nav);
      }

      // Active navs — used by public rendering ([...slug].js)
      if (active === 'true') {
        const navs = await prisma.navigation.findMany({
          where: { isActive: true },
          select: { id: true, name: true, type: true, code: true },
        });
        return res.status(200).json(navs);
      }

      // Full list (no code) — used by NavigationView
      const navs = await prisma.navigation.findMany({
        orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, type: true, isActive: true, updatedAt: true },
      });
      return res.status(200).json(navs);
    }

    // ── Mutations — require MODERATOR or higher ───────────────────────────────
    const authResult = await requireAuth(req, res, ['ADMIN', 'MODERATOR']);
    if (!authResult.authorized) {
      return res.status(authResult.status || 403).json({ error: authResult.error });
    }

    // ── POST (create) ─────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { name, type, code } = req.body || {};
      if (!name || !type || !code) {
        return res.status(400).json({ error: 'name, type und code sind erforderlich' });
      }
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: `type muss einer von ${VALID_TYPES.join(', ')} sein` });
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
      if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

      const existing = await prisma.navigation.findUnique({ where: { id: String(id) } });
      if (!existing) return res.status(404).json({ error: 'Navigation nicht gefunden' });

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
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id ist erforderlich' });

      const existing = await prisma.navigation.findUnique({ where: { id: String(id) } });
      if (!existing) return res.status(404).json({ error: 'Navigation nicht gefunden' });

      await prisma.navigation.delete({ where: { id: String(id) } });
      await logAudit({ action: 'DELETE', resource: 'navigation', resourceId: String(id), userId: authResult.user.id, details: { name: existing.name } });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch (e) {
    console.error('[/api/navigations Error]', e.message, e.stack);
    return res.status(500).json({ error: 'Server Fehler', details: e.message });
  }
}

