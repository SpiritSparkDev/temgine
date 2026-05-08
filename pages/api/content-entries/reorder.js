import { prisma } from '../../../lib/prisma';

/**
 * POST /api/content-entries/reorder
 * Body: { ids: string[] }  — ordered array of entry IDs
 * Updates sortOrder for each entry in the supplied order.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }

  try {
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.contentEntry.update({
          where: { id: String(id) },
          data: { sortOrder: index },
        })
      )
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
