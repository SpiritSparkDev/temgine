import { prisma } from '../../lib/prisma';

/**
 * API endpoint for dynamic sitemap generation
 * Returns XML sitemap of published pages — walks the FULL page tree
 * (top-level DB rows plus their nested children, which live only as JSON
 * inside the parent's `children` column, see pages/api/pages.js), skips
 * pages marked "noindex" or member-gated, and honours per-page
 * priority/changefreq overrides from the SEO panel when set.
 * GET only - generates sitemap dynamically
 */

function isPublicNode(node) {
  if (!node || typeof node !== 'object') return false;
  if (!(node.status === 'PUBLISHED' || node.isHomepage === true)) return false;
  const accessGroups = Array.isArray(node.accessGroups) ? node.accessGroups : [];
  if (accessGroups.length > 0) return false;
  const robots = String(node?.data?.seo?.robots || '');
  if (robots.includes('noindex')) return false;
  return true;
}

function collectRoutes(nodes, ancestorUpdatedAt, parentSegments, out) {
  for (const node of nodes || []) {
    if (!node) continue;
    const slug = String(node.slug || '').trim();
    const segments = slug ? [...parentSegments, slug] : [...parentSegments];
    const routePath = segments.length === 0 ? '/' : `/${segments.join('/')}`;

    if (isPublicNode(node)) {
      out.push({
        routePath,
        updatedAt: ancestorUpdatedAt,
        priority: node?.data?.seo?.sitemapPriority || (routePath === '/' ? '1.0' : '0.8'),
        changefreq: node?.data?.seo?.sitemapChangefreq || 'weekly',
      });
      // Homepage ist zusätzlich unter "/" erreichbar, unabhängig vom eigenen Slug.
      if (node.isHomepage === true && routePath !== '/') {
        out.push({ routePath: '/', updatedAt: ancestorUpdatedAt, priority: '1.0', changefreq: node?.data?.seo?.sitemapChangefreq || 'weekly' });
      }
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      collectRoutes(node.children, ancestorUpdatedAt, segments, out);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  }

  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    const topLevelPages = await prisma.page.findMany({
      where: { OR: [{ status: 'PUBLISHED' }, { isHomepage: true }] },
    });

    const routes = [];
    for (const page of topLevelPages) {
      collectRoutes([page], page.updatedAt, [], routes);
    }

    // Ein Pfad kann doppelt auftreten (z. B. Homepage-Slug + "/") — letzten
    // (zuverlässigeren, da explizit "/"-)Eintrag behalten.
    const byPath = new Map();
    for (const r of routes) byPath.set(r.routePath, r);

    const sitemapItems = Array.from(byPath.values())
      .map((route) => {
        const pageUrl = route.routePath === '/' ? `${baseUrl}/` : `${baseUrl}${route.routePath}`;
        const lastMod = route.updatedAt ? new Date(route.updatedAt).toISOString().split('T')[0] : '';

        return `  <url>
    <loc>${escapeXml(pageUrl)}</loc>
${lastMod ? `    <lastmod>${lastMod}</lastmod>\n` : ''}    <changefreq>${escapeXml(route.changefreq)}</changefreq>
    <priority>${escapeXml(String(route.priority))}</priority>
  </url>`;
      })
      .join('\n');

    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapItems}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

    return res.send(sitemapXml);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).json({ error: 'Sitemap konnte nicht generiert werden' });
  }
}

/**
 * Escape special XML characters
 */
function escapeXml(unsafe) {
  return String(unsafe)
    .replace(/[<]/g, '&lt;')
    .replace(/[>]/g, '&gt;')
    .replace(/[&]/g, '&amp;')
    .replace(/['"]/g, match => match === '"' ? '&quot;' : '&apos;');
}
