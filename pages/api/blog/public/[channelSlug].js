import { prisma } from '../../../../lib/prisma';

/**
 * Public (unauthenticated) endpoint — returns paginated PUBLISHED posts for a channel.
 * GET /api/blog/public/[channelSlug]?page=1&limit=10
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { channelSlug, page = '1', limit = '10' } = req.query;

  const channel = await prisma.blogChannel.findUnique({ where: { slug: channelSlug } });
  if (!channel) return res.status(404).json({ error: 'Kanal nicht gefunden' });

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [posts, total] = await Promise.all([
    prisma.blogPost.findMany({
      where: { channelId: channel.id, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      skip,
      take: Math.min(parseInt(limit), 100), // cap at 100
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        author: true,
        publishedAt: true,
        templateData: true,
        createdAt: true,
      },
    }),
    prisma.blogPost.count({ where: { channelId: channel.id, status: 'PUBLISHED' } }),
  ]);

  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({
    channel: {
      id: channel.id,
      name: channel.name,
      slug: channel.slug,
      templateReading: channel.templateReading || null,
      templateDetailPreview: channel.templateDetailPreview || null,
      templateSimplePreview: channel.templateSimplePreview || null,
      templateArchiveEntry: channel.templateArchiveEntry || null,
    },
    posts: posts.map(p => ({ ...p, ...(p.templateData || {}), templateData: undefined })),
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    pages: Math.ceil(total / parseInt(limit)),
  });
}
