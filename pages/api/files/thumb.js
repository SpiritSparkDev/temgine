import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { UPLOAD_DIR, THUMB_CACHE_DIR, THUMBABLE_EXT } from '../../../lib/fileListing';

/**
 * GET /api/files/thumb?url=/uploads/...&w=240 → verkleinertes WebP, auf Platte gecached (.cache/thumbs).
 * SVG/GIF/Nicht-Bilder: Redirect aufs Original (sofern unter /uploads/), Traversal → 400.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Methode nicht erlaubt' });

  let rel = String(req.query.url || '');
  try { rel = decodeURIComponent(rel); } catch { /* roh lassen */ }
  rel = rel.split(/[?#]/)[0];
  if (!rel.startsWith('/uploads/')) return res.status(400).json({ error: 'Ungültige URL' });
  rel = rel.slice('/uploads/'.length);

  const abs = path.resolve(UPLOAD_DIR, rel);
  if (!abs.startsWith(UPLOAD_DIR + path.sep)) return res.status(400).json({ error: 'Ungültiger Pfad' });

  const ext = path.extname(abs).toLowerCase();
  const w = Math.min(1200, Math.max(16, parseInt(req.query.w, 10) || 240));

  let stat;
  try { stat = await fs.promises.stat(abs); } catch { return res.status(404).json({ error: 'Datei nicht gefunden' }); }
  if (!stat.isFile()) return res.status(404).json({ error: 'Datei nicht gefunden' });

  // Nicht verkleinerbar → Original
  if (!THUMBABLE_EXT.includes(ext)) return res.redirect(302, `/uploads/${rel.split('/').map(encodeURIComponent).join('/')}`);

  // Cache-Key enthält mtime → Änderung der Datei invalidiert automatisch
  const key = crypto.createHash('sha1').update(`${rel}|${w}|${stat.mtimeMs}|${stat.size}`).digest('hex');
  const cached = path.join(THUMB_CACHE_DIR, `${key}.webp`);

  try {
    let buf;
    try {
      buf = await fs.promises.readFile(cached);
    } catch {
      buf = await sharp(abs).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
      await fs.promises.mkdir(THUMB_CACHE_DIR, { recursive: true });
      await fs.promises.writeFile(cached, buf);
    }
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buf);
  } catch {
    // Defektes Bild → Original statt Fehler
    return res.redirect(302, `/uploads/${rel.split('/').map(encodeURIComponent).join('/')}`);
  }
}
