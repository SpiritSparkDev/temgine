import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Navigations live as files instead of DB rows:
//   public/assets/template/navigation/<type>/<slug>.html   (the Mustache code)
//   public/assets/template/navigation/<type>/<slug>.json   (id, name, isActive, timestamps)
// The id is preserved across edits (pages reference navigations by id, e.g.
// Page.data.pageNav and `type: 'navigation'` blocks) — the filename/slug is
// just a human-readable handle and may change on rename.

const ROOT = path.join(process.cwd(), 'public', 'assets', 'template', 'navigation');
const VALID_TYPES = ['MAIN', 'PAGE', 'MOBILE'];

function typeDir(type) {
  return path.join(ROOT, String(type || 'MAIN').toLowerCase());
}

function readDirSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return [];
  }
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_e) {
    return null;
  }
}

function slugify(name) {
  const base = String(name || 'navigation')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'navigation';
}

function uniqueSlug(dir, name, excludeSlug = null) {
  const base = slugify(name);
  let slug = base;
  let i = 2;
  while (fs.existsSync(path.join(dir, `${slug}.json`)) && slug !== excludeSlug) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

export function listNavigations() {
  const list = [];
  for (const type of VALID_TYPES) {
    const dir = typeDir(type);
    for (const dirent of readDirSafe(dir)) {
      if (!dirent.isFile() || !dirent.name.endsWith('.json')) continue;
      const slug = dirent.name.slice(0, -'.json'.length);
      const meta = readJsonSafe(path.join(dir, dirent.name));
      if (!meta) continue;
      const code = readFileSafe(path.join(dir, `${slug}.html`)) || '';
      list.push({
        id: meta.id,
        name: meta.name,
        type,
        code,
        isActive: Boolean(meta.isActive),
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      });
    }
  }
  return list;
}

export function getNavigationById(id) {
  if (!id) return null;
  return listNavigations().find((n) => n.id === String(id)) || null;
}

export function getActiveNavigations() {
  return listNavigations().filter((n) => n.isActive);
}

function findSlugById(id) {
  for (const type of VALID_TYPES) {
    const dir = typeDir(type);
    for (const dirent of readDirSafe(dir)) {
      if (!dirent.isFile() || !dirent.name.endsWith('.json')) continue;
      const meta = readJsonSafe(path.join(dir, dirent.name));
      if (meta && meta.id === String(id)) {
        return { type, slug: dirent.name.slice(0, -'.json'.length) };
      }
    }
  }
  return null;
}

// Deactivates every other navigation of the same type (exclusive-active-per-type,
// matching the previous DB behavior in pages/api/navigations.js).
function deactivateSiblings(type, keepId) {
  const dir = typeDir(type);
  for (const dirent of readDirSafe(dir)) {
    if (!dirent.isFile() || !dirent.name.endsWith('.json')) continue;
    const metaPath = path.join(dir, dirent.name);
    const meta = readJsonSafe(metaPath);
    if (!meta || meta.id === String(keepId) || !meta.isActive) continue;
    meta.isActive = false;
    meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }
}

// Creates or updates a navigation. Pass `id` to update an existing one (its id
// is preserved even if the name/slug changes); omit it to create a new one.
export function saveNavigation({ id, name, type, code, isActive }) {
  const resolvedType = VALID_TYPES.includes(String(type || '').toUpperCase())
    ? String(type).toUpperCase()
    : 'MAIN';
  const dir = typeDir(resolvedType);
  fs.mkdirSync(dir, { recursive: true });

  const now = new Date().toISOString();
  let existing = null;
  let existingLocation = null;
  if (id) {
    existing = getNavigationById(id);
    existingLocation = existing ? findSlugById(id) : null;
  }

  const finalId = existing ? existing.id : (id ? String(id) : crypto.randomUUID());
  const finalName = name !== undefined ? String(name) : (existing ? existing.name : 'Navigation');
  const finalCode = code !== undefined ? String(code) : (existing ? existing.code : '');
  // PAGE navigations are placed explicitly (as blocks, or via a page's
  // navigation picker) rather than auto-injected, so "active/inactive" has
  // no effect on them — they are always available, like any other block.
  const finalActive = resolvedType === 'PAGE'
    ? true
    : (isActive !== undefined ? Boolean(isActive) : (existing ? existing.isActive : false));
  const createdAt = existing ? existing.createdAt : now;

  const slug = uniqueSlug(dir, finalName, existingLocation && existingLocation.type === resolvedType ? existingLocation.slug : null);

  // Moving type (or renaming) — remove the old files once the new ones are written.
  if (existingLocation && (existingLocation.type !== resolvedType || existingLocation.slug !== slug)) {
    const oldDir = typeDir(existingLocation.type);
    try { fs.unlinkSync(path.join(oldDir, `${existingLocation.slug}.html`)); } catch (_e) {}
    try { fs.unlinkSync(path.join(oldDir, `${existingLocation.slug}.json`)); } catch (_e) {}
  }

  fs.writeFileSync(path.join(dir, `${slug}.html`), finalCode, 'utf8');
  fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify({
    id: finalId,
    name: finalName,
    isActive: finalActive,
    createdAt,
    updatedAt: now,
  }, null, 2), 'utf8');

  // Exclusive-active-per-type only makes sense for MAIN (the single nav that
  // gets auto-injected sitewide) — PAGE navs can coexist freely.
  if (finalActive && resolvedType === 'MAIN') deactivateSiblings(resolvedType, finalId);

  return { id: finalId, name: finalName, type: resolvedType, code: finalCode, isActive: finalActive, createdAt, updatedAt: now };
}

export function deleteNavigation(id) {
  const location = findSlugById(id);
  if (!location) return false;
  const dir = typeDir(location.type);
  try { fs.unlinkSync(path.join(dir, `${location.slug}.html`)); } catch (_e) {}
  try { fs.unlinkSync(path.join(dir, `${location.slug}.json`)); } catch (_e) {}
  return true;
}
