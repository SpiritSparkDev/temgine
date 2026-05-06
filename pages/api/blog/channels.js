import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth.authorized) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  if (req.method === 'GET') {
    const channels = await prisma.blogChannel.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { posts: true } } },
    });
    return res.status(200).json(channels);
  }

  if (req.method === 'POST') {
    const { name, slug, description, templateDetailPreview, templateSimplePreview, templateArchiveEntry, templateReading } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Name und Slug sind erforderlich' });
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return res.status(400).json({ error: 'Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten' });
    }

    const existing = await prisma.blogChannel.findUnique({ where: { slug } });
    if (existing) {
      return res.status(409).json({ error: 'Ein Kanal mit diesem Slug existiert bereits' });
    }

    const channel = await prisma.blogChannel.create({
      data: { name, slug, description: description || null, templateDetailPreview: templateDetailPreview || null, templateSimplePreview: templateSimplePreview || null, templateArchiveEntry: templateArchiveEntry || null, templateReading: templateReading || null },
    });
    return res.status(201).json(channel);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
