import { prisma } from '../../../../lib/prisma';
import { requireAuth } from '../../../../lib/auth';

export default async function handler(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth.authorized) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const { id } = req.query;

  const post = await prisma.blogPost.findUnique({ where: { id } });
  if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden' });

  if (req.method === 'GET') {
    return res.status(200).json(post);
  }

  if (req.method === 'PUT') {
    const { title, slug, excerpt, body, coverImage, author, status, publishAt, templateData } = req.body;

    if (!title || !slug) {
      return res.status(400).json({ error: 'Titel und Slug sind erforderlich' });
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return res.status(400).json({ error: 'Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten' });
    }

    if (slug !== post.slug) {
      const conflict = await prisma.blogPost.findFirst({ where: { channelId: post.channelId, slug } });
      if (conflict) return res.status(409).json({ error: 'Slug bereits in diesem Kanal vergeben' });
    }

    const validStatuses = ['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'SCHEDULED'];
    const postStatus = validStatuses.includes(status) ? status : post.status;

    // Set publishedAt when transitioning to PUBLISHED for the first time
    let publishedAt = post.publishedAt;
    if (postStatus === 'PUBLISHED' && !publishedAt) {
      publishedAt = new Date();
    }

    const updated = await prisma.blogPost.update({
      where: { id },
      data: {
        title,
        slug,
        excerpt: excerpt || null,
        body: body || null,
        coverImage: coverImage || null,
        author: author || null,
        status: postStatus,
        publishAt: publishAt ? new Date(publishAt) : null,
        publishedAt,
        templateData: templateData !== undefined ? (templateData || null) : post.templateData,
      },
    });
    return res.status(200).json(updated);
  }

  if (req.method === 'DELETE') {
    await prisma.blogPost.delete({ where: { id } });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
