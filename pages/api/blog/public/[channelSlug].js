import { prisma } from '../../../../lib/prisma';
import { applyPostQuery, postQueryFromParams } from '../../../../lib/blogPostQuery';

/**
 * Public (unauthenticated) endpoint — returns paginated PUBLISHED posts for a channel.
 * GET /api/blog/public/[channelSlug]?page=1&limit=10
 *   &sort=<Feld>&dir=asc|desc   Spalte (publishedAt, title, …) oder Template-Feld (z. B. Beginn);
 *                               ohne Angabe die Standard-Sortierung des Kanals
 *   &upcoming=Ende,Beginn       nur Beiträge mit Datum ≥ heute (erstes nicht-leeres Feld)
 *   &past=Ende,Beginn           nur Beiträge mit Datum < heute
 *   &archive=exclude|only|include  archivierte Beiträge (Standard: ausblenden)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  }

  const { channelSlug, page = '1', limit = '10' } = req.query;

  const channel = await prisma.blogChannel.findUnique({ where: { slug: channelSlug } });
  if (!channel) return res.status(404).json({ error: 'Kanal nicht gefunden' });

  const lim = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100)); // cap at 100
  const pg = Math.max(1, parseInt(page, 10) || 1);

  // Alle veröffentlichten Beiträge laden und in lib/blogPostQuery.js sortieren/
  // filtern — Template-Felder (templateData) lassen sich nicht per DB sortieren.
  const all = await prisma.blogPost.findMany({
    where: { channelId: channel.id, status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    take: 5000,
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      coverImage: true,
      author: true,
      publishedAt: true,
      templateData: true,
      archived: true,
      createdAt: true,
    },
  });
  const filtered = applyPostQuery(all, postQueryFromParams(req.query, channel));
  const total = filtered.length;
  const posts = filtered.slice((pg - 1) * lim, pg * lim);

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
    page: pg,
    limit: lim,
    pages: Math.ceil(total / lim),
  });
}
