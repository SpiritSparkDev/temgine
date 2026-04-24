import { prisma } from '../../lib/prisma';

/**
 * API endpoint for dynamic sitemap generation
 * Returns XML sitemap of published pages
 * GET only - generates sitemap dynamically
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get base URL from environment or request headers
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    // Fetch all published pages
    const pages = await prisma.page.findMany({
      where: {
        status: 'PUBLISHED',
      },
      select: {
        slug: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Generate XML sitemap
    const sitemapItems = pages
      .map(page => {
        const pageUrl = page.slug === '' || page.slug === 'home'
          ? baseUrl + '/'
          : baseUrl + '/' + page.slug;

        const lastMod = page.updatedAt.toISOString().split('T')[0];

        return `  <url>
    <loc>${escapeXml(pageUrl)}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${page.slug === 'home' ? '1.0' : '0.8'}</priority>
  </url>`;
      })
      .join('\n');

    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapItems}
</urlset>`;

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

    return res.send(sitemapXml);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).json({ error: 'Failed to generate sitemap' });
  }
}

/**
 * Escape special XML characters
 */
function escapeXml(unsafe) {
  return unsafe
    .replace(/[<]/g, '&lt;')
    .replace(/[>]/g, '&gt;')
    .replace(/[&]/g, '&amp;')
    .replace(/['"]/g, match => match === '"' ? '&quot;' : '&apos;');
}
