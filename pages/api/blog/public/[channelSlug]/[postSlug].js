import { prisma } from '../../../../../lib/prisma';

/**
 * Public (unauthenticated) endpoint — returns a single PUBLISHED post.
 * GET /api/blog/public/[channelSlug]/[postSlug]
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { channelSlug, postSlug } = req.query;

  const channel = await prisma.blogChannel.findUnique({ where: { slug: channelSlug } });
  if (!channel) return res.status(404).json({ error: 'Kanal nicht gefunden' });

  const post = await prisma.blogPost.findFirst({
    where: { channelId: channel.id, slug: postSlug, status: 'PUBLISHED' },
  });
  if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden' });

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
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
    post: { ...post, ...(post.templateData || {}), templateData: undefined },
  });
}
