/**
 * pages/api/admin/member-groups.js
 *
 * Admin API for member groups.
 * GET    – list all groups
 * POST   – create a group
 * PATCH  ?id=<id> – rename a group
 * DELETE ?id=<id> – delete a group
 */

import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';

function toSlug(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 60);
}

export default async function handler(req, res) {
  const auth = await requireAuth(req, res, ['ADMIN']);
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });

  if (req.method === 'GET') {
    const groups = await prisma.memberGroup.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    return res.status(200).json(groups.map(g => ({ ...g, memberCount: g._count.members })));
  }

  if (req.method === 'POST') {
    const name = (req.body?.name || '').toString().trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: 'Name ist erforderlich.' });

    const slug = toSlug(name);
    try {
      const group = await prisma.memberGroup.create({ data: { name, slug } });
      return res.status(201).json(group);
    } catch (e) {
      if (e.code === 'P2002') return res.status(409).json({ error: 'Gruppe mit diesem Namen existiert bereits.' });
      throw e;
    }
  }

  if (req.method === 'PATCH') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id fehlt' });
    const name = (req.body?.name || '').toString().trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: 'Name ist erforderlich.' });

    const slug = toSlug(name);
    try {
      const group = await prisma.memberGroup.update({ where: { id }, data: { name, slug } });
      return res.status(200).json(group);
    } catch (e) {
      if (e.code === 'P2002') return res.status(409).json({ error: 'Gruppe mit diesem Namen existiert bereits.' });
      throw e;
    }
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id fehlt' });
    await prisma.memberGroup.delete({ where: { id } });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
