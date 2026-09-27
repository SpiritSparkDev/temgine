import { prisma } from '../../lib/prisma';

/**
 * API endpoint for robots.txt
 * Returns dynamic robots configuration
 * Includes sitemap location and crawl rules. Disallow paths combine a
 * static ENV list with an admin-editable list from Settings (SEO), and a
 * global "Indexierung deaktivieren" switch (e.g. for Staging) blocks
 * everything with Disallow: /.
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get base URL from request
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;

  let settings = {};
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['seo_indexing_enabled', 'seo_robots_txt_extra_disallow'] } },
    });
    for (const row of rows) settings[row.key] = row.value;
  } catch (_e) {
    settings = {};
  }

  const indexingDisabled = settings.seo_indexing_enabled === 'false';

  const envDisallowPaths = (process.env.ROBOTS_DISALLOW || '/admin,/api')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const extraDisallowPaths = String(settings.seo_robots_txt_extra_disallow || '')
    .split(/\r?\n|,/)
    .map((p) => p.trim())
    .filter(Boolean);
  const disallowPaths = indexingDisabled
    ? ['/']
    : Array.from(new Set([...envDisallowPaths, ...extraDisallowPaths]));

  const crawlDelay = process.env.ROBOTS_CRAWL_DELAY || '1';
  const requestRate = process.env.ROBOTS_REQUEST_RATE; // e.g., "10/1m"

  let robotsTxt = `# Robots configuration for ${baseUrl}
# Generated dynamically by TempHelix
${indexingDisabled ? '# Indexierung ist über die SEO-Einstellungen global deaktiviert.\n' : ''}
User-agent: *
Allow: /

`;

  disallowPaths.forEach((path) => {
    if (path) {
      robotsTxt += `Disallow: ${path}\n`;
    }
  });

  if (!indexingDisabled) {
    robotsTxt += `
Crawl-delay: ${crawlDelay}
`;

    if (requestRate) {
      robotsTxt += `Request-rate: ${requestRate}\n`;
    }
  }

  robotsTxt += `
Sitemap: ${baseUrl}/api/sitemap.xml
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

  return res.send(robotsTxt);
}
