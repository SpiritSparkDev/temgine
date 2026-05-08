/**
 * pages/api/admin/contact-messages.js
 *
 * Admin API for contact form messages.
 * GET  – list messages (paginated, newest first)
 * PATCH ?id=<id> – mark as read
 * DELETE ?id=<id> – delete a message
 */

import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR']);
  if (!auth.authorized) return res.status(auth.status || 401).json({ error: auth.error });

  if (req.method === 'GET') {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const skip = (page - 1) * limit;
    const onlyUnread = req.query.unread === 'true';

    const where = onlyUnread ? { readAt: null } : {};

    const [messages, total] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.contactMessage.count({ where }),
    ]);

    return res.status(200).json({ messages, total, page, limit });
  }

  if (req.method === 'PATCH') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id fehlt' });

    const updated = await prisma.contactMessage.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id fehlt' });

    await prisma.contactMessage.delete({ where: { id } });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
