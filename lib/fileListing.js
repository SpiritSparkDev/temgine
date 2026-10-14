import fs from 'fs';
import path from 'path';

// Gemeinsame Logik für das paginierte Datei-Listing (pages/api/files.js, files/unused.js, files/thumb.js)

export const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB – auch für den Client (GET /api/files?limits=1)
export const THUMB_CACHE_DIR = path.join(process.cwd(), '.cache', 'thumbs'); // außerhalb von public/uploads → nie im Listing

const SIZE_VARIANTS = ['_thumbnail', '_small', '_medium', '_large'];
const TTL_MS = 5000;

const EXT_TYPES = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico'],
  document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.txt', '.csv', '.md', '.rtf'],
  video: ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz'],
};

export function fileCategory(ext) {
  const e = String(ext || '').toLowerCase();
  for (const [cat, list] of Object.entries(EXT_TYPES)) if (list.includes(e)) return cat;
  return 'other';
}

// Rasterbilder, für die ein verkleinertes Thumbnail Sinn ergibt (SVG/GIF werden im Original ausgeliefert)
export const THUMBABLE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];

// Cache am globalThis, damit alle API-Routen-Bundles dieselbe Instanz teilen
const store = globalThis.__fileScanCache || (globalThis.__fileScanCache = { at: 0, items: null, pending: null });

export function invalidateFileCache() {
  store.at = 0;
  store.items = null;
  store.pending = null;
}

async function walk(dir, items) {
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  await Promise.all(entries.map(async (entry) => {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(abs, items);
    if (!entry.isFile() || SIZE_VARIANTS.some((v) => entry.name.includes(v))) return;
    let stat;
    try { stat = await fs.promises.stat(abs); } catch { return; }
    const rel = path.relative(UPLOAD_DIR, abs).replace(/\\/g, '/');
    const ext = path.extname(entry.name).toLowerCase();
    items.push({
      name: entry.name,
      filename: rel,
      size: stat.size,
      created: stat.birthtime,
      modified: stat.mtime,
      type: ext,
      url: `/uploads/${rel}`,
    });
  }));
}

// Rekursiver Scan, 5 s im Speicher gehalten
export async function scanUploads() {
  if (store.items && Date.now() - store.at < TTL_MS) return store.items;
  if (store.pending) return store.pending;
  const p = (async () => {
    const items = [];
    await walk(UPLOAD_DIR, items);
    store.items = items;
    store.at = Date.now();
    return items;
  })();
  store.pending = p;
  try { return await p; } finally { if (store.pending === p) store.pending = null; }
}

const WINDOW_DAYS = { today: 1, week: 7, month: 30, year: 365 };

function withinWindow(date, key, now) {
  const days = WINDOW_DAYS[key];
  if (!days) return true; // all / unbekannt
  return now - new Date(date).getTime() <= days * 86400000;
}

// Filtert, sortiert und paginiert. opts = Query-Parameter (Strings).
export function queryFiles(all, opts = {}) {
  const pageSize = Math.min(200, Math.max(1, parseInt(opts.pageSize, 10) || 60));
  const page = Math.max(1, parseInt(opts.page, 10) || 1);
  const q = String(opts.q || '').trim().toLowerCase();
  const types = String(opts.types || '').split(',').map((t) => t.trim()).filter(Boolean);
  const folder = String(opts.folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const now = Date.now();

  let list = all.filter((f) => {
    if (folder && !f.filename.startsWith(`${folder}/`)) return false;
    if (q && !f.name.toLowerCase().includes(q)) return false;
    if (types.length && !types.includes(fileCategory(f.type))) return false;
    if (!withinWindow(f.created, opts.createdWithin, now)) return false;
    if (!withinWindow(f.modified, opts.modifiedWithin, now)) return false;
    return true;
  });

  const sort = ['name', 'created', 'modified', 'size'].includes(opts.sort) ? opts.sort : 'name';
  const dir = opts.dir === 'desc' ? -1 : 1;
  list = list.sort((a, b) => {
    let r;
    if (sort === 'name') r = a.name.localeCompare(b.name, 'de', { sensitivity: 'base', numeric: true });
    else if (sort === 'size') r = a.size - b.size;
    else r = new Date(a[sort]).getTime() - new Date(b[sort]).getTime();
    return r * dir;
  });

  const total = list.length;
  const files = list.slice((page - 1) * pageSize, page * pageSize).map((f) => (
    THUMBABLE_EXT.includes(f.type)
      ? { ...f, thumbUrl: `/api/files/thumb?url=${encodeURIComponent(f.url)}&w=240` }
      : f
  ));
  return { files, total, page, pageSize };
}
