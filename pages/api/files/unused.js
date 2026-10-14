import fs from 'fs';
import path from 'path';
import { requireAuth, PERMISSIONS } from '../../../lib/auth';
import { UPLOAD_DIR, scanUploads, invalidateFileCache } from '../../../lib/fileListing';
import { collectUsedUrls } from './usage';

/**
 * GET  /api/files/unused → { files: [{url,name,size}] } – Dateien ohne Verweis in Inhalten
 * POST /api/files/unused { urls: [...] } → löscht nur Dateien, die serverseitig erneut als
 *      ungenutzt bestätigt wurden. Antwort { deleted: [...], skipped: [{url, reason}] }.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Methode nicht erlaubt' });
  const auth = await requireAuth(req, res, PERMISSIONS.FILES_DELETE);
  if (!auth.authorized) return res.status(auth.status || 403).json({ error: auth.error || 'Zugriff verweigert' });

  try {
    const used = await collectUsedUrls();
    const isUsed = (url) => used.has(url) || used.has(encodeURI(url));

    if (req.method === 'GET') {
      const all = await scanUploads();
      const files = all.filter((f) => !isUsed(f.url)).map(({ url, name, size }) => ({ url, name, size }));
      return res.status(200).json({ files });
    }

    const urls = Array.isArray(req.body?.urls) ? req.body.urls.slice(0, 1000) : [];
    if (!urls.length) return res.status(400).json({ error: 'Keine Dateien angegeben' });

    const deleted = [];
    const skipped = [];
    for (const url of urls) {
      const rel = String(url || '').replace(/^\/uploads\//, '');
      const abs = path.resolve(UPLOAD_DIR, rel);
      if (!String(url).startsWith('/uploads/') || !abs.startsWith(UPLOAD_DIR + path.sep)) {
        skipped.push({ url, reason: 'Ungültiger Pfad' });
      } else if (isUsed(`/uploads/${path.relative(UPLOAD_DIR, abs).replace(/\\/g, '/')}`)) {
        skipped.push({ url, reason: 'In Verwendung' });
      } else {
        try {
          const st = await fs.promises.stat(abs);
          if (!st.isFile()) throw new Error('keine Datei');
          await fs.promises.unlink(abs);
          deleted.push(url);
        } catch {
          skipped.push({ url, reason: 'Nicht gefunden' });
        }
      }
    }
    invalidateFileCache();
    return res.status(200).json({ success: true, deleted, skipped });
  } catch (error) {
    return res.status(500).json({ error: 'Fehler beim Aufräumen: ' + error.message });
  }
}
