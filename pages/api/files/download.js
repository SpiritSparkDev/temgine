import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

function normalizeUploadSegment(input) {
  return String(input || '')
    .normalize('NFC')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeUploadFilename(input) {
  const parsed = path.parse(String(input || ''));
  const base = normalizeUploadSegment(parsed.name) || 'upload';
  const ext = normalizeUploadSegment(parsed.ext).replace(/_/g, '') || parsed.ext || '';
  return `${base}${ext}`;
}

function resolveDownloadTarget(rawUrl) {
  if (!rawUrl) return null;

  let decoded = String(rawUrl);
  try {
    decoded = decodeURI(decoded);
  } catch (_e) {}

  const clean = decoded
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/uploads\//, '')
    .replace(/^uploads\//, '')
    .replace(/^\/+/, '');

  if (!clean || clean.includes('..')) return null;

  const directAbs = path.resolve(UPLOAD_DIR, clean);
  if (directAbs.startsWith(UPLOAD_DIR) && fs.existsSync(directAbs)) return directAbs;

  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  const normalizedParts = parts.map((part, index) => {
    if (index === parts.length - 1) return normalizeUploadFilename(part);
    return normalizeUploadSegment(part);
  });

  const normalizedAbs = path.resolve(UPLOAD_DIR, normalizedParts.join('/'));
  if (normalizedAbs.startsWith(UPLOAD_DIR) && fs.existsSync(normalizedAbs)) return normalizedAbs;

  const dirAbs = path.resolve(UPLOAD_DIR, normalizedParts.slice(0, -1).join('/') || '.');
  const targetName = normalizedParts[normalizedParts.length - 1];
  if (!fs.existsSync(dirAbs)) return null;

  const parsed = path.parse(targetName);
  const candidates = fs.readdirSync(dirAbs)
    .filter((name) => {
      const current = path.parse(name);
      return current.ext.toLowerCase() === parsed.ext.toLowerCase() && (
        current.name === parsed.name || current.name.startsWith(`${parsed.name}_`)
      );
    })
    .sort((left, right) => {
      if (left.length !== right.length) return left.length - right.length;
      return left.localeCompare(right, 'de', { sensitivity: 'base' });
    });

  return candidates.length > 0 ? path.join(dirAbs, candidates[0]) : null;
}

function inferContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.pdf': return 'application/pdf';
    case '.txt': return 'text/plain; charset=utf-8';
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestedUrl = req.query?.url;
  const targetPath = resolveDownloadTarget(requestedUrl);
  if (!targetPath) {
    return res.status(404).json({ error: 'Datei nicht gefunden' });
  }

  try {
    const stats = fs.statSync(targetPath);
    const filename = path.basename(targetPath);

    res.setHeader('Content-Type', inferContentType(targetPath));
    res.setHeader('Content-Length', String(stats.size));
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'no-store');

    fs.createReadStream(targetPath).pipe(res);
  } catch (error) {
    return res.status(500).json({ error: 'Download fehlgeschlagen' });
  }
}