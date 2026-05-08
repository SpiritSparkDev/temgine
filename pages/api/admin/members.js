/**
 * pages/api/admin/members.js
 *
 * Admin API for member management.
 * GET    – list members (with group memberships)
 * PATCH  ?id=<id> – update a member (block/unblock, change name, assign groups)
 * DELETE ?id=<id> – delete a member
 */

import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res, ['ADMIN']);
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });

  if (req.method === 'GET') {
    const members = await prisma.member.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        verified: true,
        blocked: true,
        createdAt: true,
        groups: {
          select: {
            group: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    const result = members.map(m => ({
      ...m,
      groups: m.groups.map(mg => mg.group),
    }));
    return res.status(200).json(result);
  }

  if (req.method === 'PATCH') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id fehlt' });

    const { name, blocked, groupIds } = req.body || {};

    const updateData = {};
    if (typeof blocked === 'boolean') updateData.blocked = blocked;
    if (typeof name === 'string') updateData.name = name.trim() || null;

    // Update basic fields
    await prisma.member.update({ where: { id }, data: updateData });

    // Update group memberships if provided
    if (Array.isArray(groupIds)) {
      await prisma.memberGroupMembership.deleteMany({ where: { memberId: id } });
      if (groupIds.length > 0) {
        await prisma.memberGroupMembership.createMany({
          data: groupIds.map(groupId => ({ memberId: id, groupId })),
          skipDuplicates: true,
        });
      }
    }

    const updated = await prisma.member.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, verified: true, blocked: true,
        groups: { select: { group: { select: { id: true, name: true, slug: true } } } },
      },
    });
    return res.status(200).json({ ...updated, groups: updated.groups.map(mg => mg.group) });
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id fehlt' });
    await prisma.member.delete({ where: { id } });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
