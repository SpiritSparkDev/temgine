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
const crypto = require('crypto');
const next = require('next');
const { applyPluginCsp } = require('./lib/pluginCsp');

const PUBLIC_ROOT = path.join(__dirname, 'public');
const PUBLIC_UPLOAD_ROOT = path.join(PUBLIC_ROOT, 'uploads');
const PUBLIC_STATIC_PREFIXES = ['/extern_css', '/extern_js', '/uploads', '/assets', '/favicon', '/__live'];

for (const dir of [
  PUBLIC_ROOT,
  PUBLIC_UPLOAD_ROOT,
  path.join(PUBLIC_UPLOAD_ROOT, 'images'),
  path.join(PUBLIC_UPLOAD_ROOT, 'images', 'thumbnails'),
  path.join(PUBLIC_UPLOAD_ROOT, 'fonts'),
]) {
  fs.mkdirSync(dir, { recursive: true });
}

// Auto-generate NEXTAUTH_SECRET on first boot if not set (e.g. plain `docker
// compose up` with no .env.local) and persist it in the data volume so it
// survives container restarts.
if (!process.env.NEXTAUTH_SECRET) {
  const secretFile = path.join(process.cwd(), 'data', '.nextauth_secret');
  try {
    process.env.NEXTAUTH_SECRET = fs.existsSync(secretFile)
      ? fs.readFileSync(secretFile, 'utf8').trim()
      : (() => {
          const secret = crypto.randomBytes(32).toString('base64');
          fs.mkdirSync(path.dirname(secretFile), { recursive: true });
          fs.writeFileSync(secretFile, secret);
          return secret;
        })();
  } catch (e) {
    console.error('> Failed to auto-generate NEXTAUTH_SECRET:', e.message);
  }
}

// Build DATABASE_URL from the pieces + password file the Docker Compose stack
// provides. DATABASE_PASSWORD_FILE is only ever set by docker-compose.yml, so
// its presence always means "we're the compose app container" — this must win
// even if .env.local (loaded via env_file, for local/Plesk use) also sets a
// DATABASE_URL, since that one points at `localhost`, not the `postgres` host.
if (process.env.DATABASE_PASSWORD_FILE) {
  try {
    const dbPassword = fs.readFileSync(process.env.DATABASE_PASSWORD_FILE, 'utf8').trim();
    const { DATABASE_USER = 'temgine', DATABASE_NAME = 'temgine', DATABASE_HOST = 'postgres', DATABASE_PORT = '5432' } = process.env;
    process.env.DATABASE_URL = `postgres://${DATABASE_USER}:${encodeURIComponent(dbPassword)}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`;
  } catch (e) {
    console.error('> Failed to read DATABASE_PASSWORD_FILE:', e.message);
  }
}

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
    '.pdf': 'application/pdf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.avif': 'image/avif',
  };

  return typeMap[ext] || 'application/octet-stream';
}

// Wertet einen einzelnen "Range: bytes=start-end"-Header aus (auch "start-" und
// "-suffix"). Liefert { start, end } oder null bei fehlendem/mehrteiligem Header,
// bzw. 'invalid', wenn der Bereich außerhalb der Datei liegt.
function parseByteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  let start;
  let end;
  if (match[1] === '') {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
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
    const stat = fs.existsSync(assetPath) ? fs.statSync(assetPath) : null;
    if (!stat || !stat.isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return true;
    }

    res.setHeader('Content-Type', getContentType(assetPath));
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
    // Byte-Ranges: Safari/iOS spielen Video/Audio nur ab, wenn der Server 206-Teilantworten liefert.
    res.setHeader('Accept-Ranges', 'bytes');

    const isHead = String(req.method || 'GET').toUpperCase() === 'HEAD';
    const range = parseByteRange(req.headers && req.headers.range, stat.size);
    if (range === 'invalid') {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      res.end();
      return true;
    }
    if (range) {
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
      res.setHeader('Content-Length', range.end - range.start + 1);
      if (isHead) { res.end(); return true; }
      fs.createReadStream(assetPath, { start: range.start, end: range.end }).pipe(res);
      return true;
    }

    res.setHeader('Content-Length', stat.size);
    if (isHead) { res.end(); return true; }
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
  parseByteRange,
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
    // Older instances still have Navigation/Footer/Template rows and
    // maintenance_* Settings in the DB — the migration below drops those
    // tables. Export them to files FIRST so updating an old instance can't
    // silently lose that content the moment migrate deploy runs.
    console.log('> Exporting legacy DB content (navigation/footer/templates/maintenance) to files if present...');
    execSync(`node "${path.join(__dirname, 'scripts', 'auto-export-legacy-db-content.js')}"`, { stdio: 'inherit', env: process.env });

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

    applyPluginCsp(res);
    handle(req, res);
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on port ${port}`);

    // Geplantes Backup: stündliche Prüfung; die API (pages/api/admin/backups.js) entscheidet
    // anhand data/backup-schedule.json, ob ein Lauf fällig ist. Flag verhindert Doppelstart.
    if (!global.__backupTimerStarted) {
      global.__backupTimerStarted = true;
      process.env.BACKUP_CRON_SECRET = crypto.randomBytes(24).toString('hex');
      const tick = () => {
        const body = JSON.stringify({ action: 'scheduled' });
        const r = require('http').request({
          host: '127.0.0.1', port, path: '/api/admin/backups', method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-backup-cron': process.env.BACKUP_CRON_SECRET },
        }, (resp) => resp.resume());
        r.on('error', (e) => console.warn('> Backup-Timer:', e.message));
        r.end(body);
      };
      setTimeout(tick, 60 * 1000).unref();
      setInterval(tick, 60 * 60 * 1000).unref();
    }

    // Add-on "Anfrage-Weiterleitung": minütlicher Retry-Worker. Die API (pages/api/tnt-inquiries/outbox)
    // prüft, ob das Add-on aktiv ist, und verarbeitet nur dann fällige Einträge (Cleanup läuft immer).
    if (!global.__tntOutboxTimerStarted && process.env.NODE_ENV !== 'test') {
      global.__tntOutboxTimerStarted = true;
      process.env.TNT_CRON_SECRET = crypto.randomBytes(24).toString('hex');
      const tntTick = () => {
        const body = JSON.stringify({ action: 'process' });
        const r = require('http').request({
          host: '127.0.0.1', port, path: '/api/tnt-inquiries/outbox', method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-tnt-cron': process.env.TNT_CRON_SECRET },
        }, (resp) => resp.resume());
        r.on('error', () => {}); // nie Details loggen
        r.end(body);
      };
      setTimeout(tntTick, 30 * 1000).unref();
      setInterval(tntTick, 60 * 1000).unref();
    }
  });
});
