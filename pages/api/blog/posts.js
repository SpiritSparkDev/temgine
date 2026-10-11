import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';
import { applyPostQuery, postQueryFromParams, collectTemplateFieldNames } from '../../../lib/blogPostQuery';

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

    const where = { channelId };
    if (status) where.status = status;

    // Sortieren/Filtern auch nach Template-Feldern (z. B. „Beginn“) — das geht
    // nicht in der DB-Abfrage, daher alle Beiträge des Kanals laden (Kanäle
    // sind klein) und in lib/blogPostQuery.js verarbeiten.
    const channel = await prisma.blogChannel.findUnique({ where: { id: String(channelId) } });
    const all = await prisma.blogPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: { id: true, title: true, slug: true, excerpt: true, coverImage: true, author: true, status: true, publishAt: true, publishedAt: true, templateData: true, archived: true, createdAt: true, updatedAt: true },
    });
    const query = postQueryFromParams({ ...req.query, archive: req.query.archive || 'include' }, channel || {});
    if (!req.query.sort && !(channel && channel.sortField)) query.sort = 'createdAt';
    const filtered = applyPostQuery(all, query);
    const lim = Math.max(1, Math.min(parseInt(limit, 10) || 20, 5000));
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const posts = filtered.slice((pg - 1) * lim, pg * lim);

    return res.status(200).json({ posts, total: filtered.length, page: pg, limit: lim, fieldNames: collectTemplateFieldNames(all) });
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

  return res.status(405).json({ error: 'Methode nicht erlaubt' });
}
