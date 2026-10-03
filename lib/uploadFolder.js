import fs from 'fs';
import path from 'path';

// Server-only helper for resolving {{#folder}} block-template sections against
// public/uploads/ — kept separate from pages/api/files.js so server-side render
// callers (export.js, liveSnapshot.js) can list a folder's contents directly,
// without a self-HTTP round-trip. pages/api/files.js's own folder browsing
// (used by the admin file manager) is untouched.

export const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

// Same traversal guard as pages/api/files.js's resolveSafeDir — kept as an
// intentional small duplicate rather than a shared import, so this module has
// no dependency on files.js's request/response-shaped code.
export function resolveSafeDir(folderParam) {
  const safe = (folderParam || '').replace(/\.\./g, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const resolved = path.resolve(UPLOAD_DIR, safe);
  if (!resolved.startsWith(UPLOAD_DIR)) throw new Error('Ungültiger Pfad');
  return { resolved, safe };
}

// Mirrors lib/templateEngine.js's slugify (lowercase, non [a-z0-9-_] -> '-', collapse/trim dashes).
function slugifyFilename(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif']);

// relativePath is relative to the CHOSEN folder (exposed as `path`, for display/uniqueness
// within that folder); urlRelativePath is relative to UPLOAD_DIR itself (the true public URL).
function toFolderItem(absPath, relativePath, urlRelativePath) {
  const stat = fs.statSync(absPath);
  const parsed = path.parse(relativePath);
  const ext = parsed.ext.replace(/^\./, '').toLowerCase();
  return {
    name: parsed.base,
    slug: slugifyFilename(parsed.name),
    url: `/uploads/${urlRelativePath}`,
    path: relativePath,
    ext,
    size: stat.size,
    modified: stat.mtime.toISOString(),
    isImage: IMAGE_EXTENSIONS.has(ext),
  };
}

/**
 * Listet rekursiv alle Dateien unter dem gewählten Ordner (relativ zu public/uploads/),
 * inklusive aller Unterordner. Unterordner selbst werden nicht als eigene Einträge
 * zurückgegeben — nur Dateien. Gibt [] zurück, wenn der Ordner nicht existiert
 * (kein Fehler — ein Block-Template kann einen inzwischen gelöschten Ordner referenzieren).
 * @param {string} folderPath - Pfad relativ zu public/uploads/, z. B. "produkte/bilder"
 * @returns {Array<object>} sortiert nach path (localeCompare 'de')
 */
export function listFolderItemsRecursive(folderPath) {
  let targetDir;
  let safeFolderPath;
  try {
    ({ resolved: targetDir, safe: safeFolderPath } = resolveSafeDir(folderPath));
  } catch (e) {
    return [];
  }
  if (!fs.existsSync(targetDir)) return [];

  const items = [];
  const walk = (dirAbs, relDir) => {
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      const entryAbs = path.join(dirAbs, entry.name);
      const entryRel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(entryAbs, entryRel);
      } else if (entry.isFile()) {
        const urlRel = safeFolderPath ? `${safeFolderPath}/${entryRel}` : entryRel;
        items.push(toFolderItem(entryAbs, entryRel, urlRel));
      }
    }
  };
  walk(targetDir, '');

  items.sort((a, b) => a.path.localeCompare(b.path, 'de'));
  return items;
}
