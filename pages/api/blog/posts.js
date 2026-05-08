import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth.authorized) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  if (req.method === 'GET') {
    const { channelId, status, page = '1', limit = '20' } = req.query;

    if (!channelId) {
      return res.status(400).json({ error: 'channelId erforderlich' });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { channelId };
    if (status) where.status = status;

    const [posts, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
        select: { id: true, title: true, slug: true, excerpt: true, coverImage: true, author: true, status: true, publishAt: true, publishedAt: true, templateData: true, createdAt: true, updatedAt: true },
      }),
      prisma.blogPost.count({ where }),
    ]);

    return res.status(200).json({ posts, total, page: parseInt(page), limit: parseInt(limit) });
  }

  if (req.method === 'POST') {
    const { channelId, title, slug, excerpt, body, coverImage, author, status, publishAt, templateData } = req.body;

    if (!channelId || !title || !slug) {
      return res.status(400).json({ error: 'channelId, Titel und Slug sind erforderlich' });
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return res.status(400).json({ error: 'Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten' });
    }

    const channel = await prisma.blogChannel.findUnique({ where: { id: channelId } });
    if (!channel) return res.status(404).json({ error: 'Kanal nicht gefunden' });

    const conflict = await prisma.blogPost.findFirst({ where: { channelId, slug } });
    if (conflict) return res.status(409).json({ error: 'Slug bereits in diesem Kanal vergeben' });

    const validStatuses = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'SCHEDULED'];
    const postStatus = validStatuses.includes(status) ? status : 'DRAFT';

    const post = await prisma.blogPost.create({
      data: {
        channelId,
        title,
        slug,
        excerpt: excerpt || null,
        body: body || null,
        coverImage: coverImage || null,
        author: author || null,
        status: postStatus,
        publishAt: publishAt ? new Date(publishAt) : null,
        publishedAt: postStatus === 'PUBLISHED' ? new Date() : null,
        templateData: templateData || null,
      },
    });
    return res.status(201).json(post);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
