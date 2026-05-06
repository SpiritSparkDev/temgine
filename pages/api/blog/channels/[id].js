import { prisma } from '../../../../lib/prisma';
import { requireAuth } from '../../../../lib/auth';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth.authorized) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const { id } = req.query;

  const channel = await prisma.blogChannel.findUnique({ where: { id } });
  if (!channel) {
    return res.status(404).json({ error: 'Kanal nicht gefunden' });
  }

  if (req.method === 'GET') {
    return res.status(200).json(channel);
  }

  if (req.method === 'PUT') {
    const { name, slug, description, templateDetailPreview, templateSimplePreview, templateArchiveEntry, templateReading } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Name und Slug sind erforderlich' });
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return res.status(400).json({ error: 'Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten' });
    }

    if (slug !== channel.slug) {
      const conflict = await prisma.blogChannel.findUnique({ where: { slug } });
      if (conflict) return res.status(409).json({ error: 'Slug bereits vergeben' });
    }

    const updated = await prisma.blogChannel.update({
      where: { id },
      data: { name, slug, description: description || null, templateDetailPreview: templateDetailPreview || null, templateSimplePreview: templateSimplePreview || null, templateArchiveEntry: templateArchiveEntry || null, templateReading: templateReading || null },
    });
    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    await prisma.blogChannel.delete({ where: { id } });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
