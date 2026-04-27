/**
 * API endpoint for robots.txt
 * Returns dynamic robots configuration
 * Includes sitemap location and crawl rules
 */

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get base URL from request
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;

  // Get configuration from environment
  const disallowPaths = (process.env.ROBOTS_DISALLOW || '/admin,/api').split(',').map(p => p.trim());
  const crawlDelay = process.env.ROBOTS_CRAWL_DELAY || '1';
  const requestRate = process.env.ROBOTS_REQUEST_RATE; // e.g., "10/1m"

  let robotsTxt = `# Robots configuration for ${baseUrl}
# Generated dynamically by TempHelix

User-agent: *
Allow: /

`;

  // Add disallow rules
  disallowPaths.forEach(path => {
    if (path) {
      robotsTxt += `Disallow: ${path}\n`;
    }
  });

  // Add crawl delay for polite bots
  robotsTxt += `
Crawl-delay: ${crawlDelay}
`;

  // Add request rate if specified
  if (requestRate) {
    robotsTxt += `Request-rate: ${requestRate}\n`;
  }

  // Add sitemap location
  robotsTxt += `
Sitemap: ${baseUrl}/api/sitemap.xml
`;

  // Set appropriate headers
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

  return res.send(robotsTxt);
}
