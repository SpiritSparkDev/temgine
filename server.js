// Lightweight Next.js custom server for Plesk/Passenger
// Starts the production build created via `npm run build`

// Load .env file if it exists (fallback for Plesk deployments)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed or .env doesn't exist, use process.env only
}

const { createServer } = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const next = require('next');

const PUBLIC_ROOT = path.join(__dirname, 'public');
const PUBLIC_STATIC_PREFIXES = ['/extern_css', '/uploads', '/assets', '/favicon'];

const port = process.env.PORT || 3000;
// Use dev mode only when NODE_ENV is explicitly 'development'.
// Plesk often leaves NODE_ENV unset; defaulting to dev mode here would cause
// Next.js to ignore the production build in .next and return HTML for JS bundle requests.
const dev = process.env.NODE_ENV === 'development';

function isPublicStaticAssetPath(url) {
  if (!url || typeof url !== 'string') return false;
  const requestPath = decodeURIComponent(url.split('?')[0].split('#')[0]).replace(/\\/g, '/');
  if (!requestPath.startsWith('/')) return false;
  return PUBLIC_STATIC_PREFIXES.some(prefix => requestPath === prefix || requestPath.startsWith(`${prefix}/`));
}

function resolvePublicAssetPath(url) {
  const requestPath = decodeURIComponent(url.split('?')[0].split('#')[0]).replace(/\\/g, '/');
  if (!isPublicStaticAssetPath(requestPath)) {
    throw new Error('Not a public static asset path');
  }

  const relativePath = requestPath.replace(/^\/+/, '');
  const fullPath = path.resolve(PUBLIC_ROOT, relativePath);

  if (!fullPath.startsWith(PUBLIC_ROOT)) {
    throw new Error('Path traversal attempt blocked');
  }

  return fullPath;
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  const typeMap = {
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
  };

  return typeMap[ext] || 'application/octet-stream';
}

function servePublicStaticAsset(req, res) {
  if (req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
    return false;
  }

  const rawUrl = typeof req.url === 'string' ? req.url : '/';
  if (!isPublicStaticAssetPath(rawUrl)) {
    return false;
  }

  try {
    const assetPath = resolvePublicAssetPath(rawUrl);
    if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return true;
    }

    res.setHeader('Content-Type', getContentType(assetPath));
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
    fs.createReadStream(assetPath).pipe(res);
    return true;
  } catch (_e) {
    res.statusCode = 404;
    res.end('Not Found');
    return true;
  }
}

module.exports = {
  isPublicStaticAssetPath,
  resolvePublicAssetPath,
  getContentType,
  servePublicStaticAsset,
};

console.log('> Server boot config', {
  nodeEnv: process.env.NODE_ENV || '(unset)',
  dev,
  port,
  cwd: process.cwd(),
});

// Run database migrations on startup (Plesk: ENV vars are only available here, not in npm scripts)
if (process.env.DATABASE_URL) {
  try {
    console.log('> Running database migrations...');
    const prismaBin = path.join(__dirname, 'node_modules', '.bin', 'prisma');
    execSync(`"${prismaBin}" migrate deploy`, { stdio: 'inherit', env: process.env });
    console.log('> Migrations complete.');
  } catch (e) {
    console.error('> Migration failed:', e.message);
    // Don't exit — app may still work if schema is already up to date
  }
} else {
  console.warn('> WARNING: DATABASE_URL not set, skipping migrations.');
}

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const isNextAssetRequest = typeof req.url === 'string' && req.url.startsWith('/_next/');
    const isPublicStaticAssetRequest = servePublicStaticAsset(req, res);

    if (isNextAssetRequest) {
      console.log('> Asset request start', {
        method: req.method,
        url: req.url,
      });

      res.on('finish', () => {
        console.log('> Asset request complete', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          contentType: res.getHeader('content-type') || null,
          location: res.getHeader('location') || null,
        });
      });
    }

    if (isPublicStaticAssetRequest) {
      return;
    }

    handle(req, res);
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on port ${port}`);
  });
});
