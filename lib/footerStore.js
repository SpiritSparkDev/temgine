import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Footers live as files instead of DB rows:
//   public/assets/template/footer/<slug>.html   (the Mustache code)
//   public/assets/template/footer/<slug>.json   (id, name, isActive, timestamps)
// The id is preserved across edits (pages reference footers by id via
// Page.data.pageFooter) — the filename/slug is just a human-readable handle.

const ROOT = path.join(process.cwd(), 'public', 'assets', 'template', 'footer');

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
  const base = String(name || 'footer')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'footer';
}

function uniqueSlug(name, excludeSlug = null) {
  const base = slugify(name);
  let slug = base;
  let i = 2;
  while (fs.existsSync(path.join(ROOT, `${slug}.json`)) && slug !== excludeSlug) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

export function listFooters() {
  const list = [];
  for (const dirent of readDirSafe(ROOT)) {
    if (!dirent.isFile() || !dirent.name.endsWith('.json')) continue;
    const slug = dirent.name.slice(0, -'.json'.length);
    const meta = readJsonSafe(path.join(ROOT, dirent.name));
    if (!meta) continue;
    const code = readFileSafe(path.join(ROOT, `${slug}.html`)) || '';
    list.push({
      id: meta.id,
      name: meta.name,
      code,
      isActive: Boolean(meta.isActive),
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    });
  }
  return list;
}

export function getFooterById(id) {
  if (!id) return null;
  return listFooters().find((f) => f.id === String(id)) || null;
}

export function getActiveFooter() {
  return listFooters().find((f) => f.isActive) || null;
}

function findSlugById(id) {
  for (const dirent of readDirSafe(ROOT)) {
    if (!dirent.isFile() || !dirent.name.endsWith('.json')) continue;
    const meta = readJsonSafe(path.join(ROOT, dirent.name));
    if (meta && meta.id === String(id)) return dirent.name.slice(0, -'.json'.length);
  }
  return null;
}

// Only one footer may be active at a time (matches the previous DB behavior
// in pages/api/footers.js).
function deactivateSiblings(keepId) {
  for (const dirent of readDirSafe(ROOT)) {
    if (!dirent.isFile() || !dirent.name.endsWith('.json')) continue;
    const metaPath = path.join(ROOT, dirent.name);
    const meta = readJsonSafe(metaPath);
    if (!meta || meta.id === String(keepId) || !meta.isActive) continue;
    meta.isActive = false;
    meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  }
}

// Creates or updates a footer. Pass `id` to update an existing one (its id is
// preserved even if the name/slug changes); omit it to create a new one.
export function saveFooter({ id, name, code, isActive }) {
  fs.mkdirSync(ROOT, { recursive: true });

  const now = new Date().toISOString();
  const existing = id ? getFooterById(id) : null;
  const existingSlug = existing ? findSlugById(id) : null;

  const finalId = existing ? existing.id : (id ? String(id) : crypto.randomUUID());
  const finalName = name !== undefined ? String(name) : (existing ? existing.name : 'Footer');
  const finalCode = code !== undefined ? String(code) : (existing ? existing.code : '');
  const finalActive = isActive !== undefined ? Boolean(isActive) : (existing ? existing.isActive : false);
  const createdAt = existing ? existing.createdAt : now;

  const slug = uniqueSlug(finalName, existingSlug);

  if (existingSlug && existingSlug !== slug) {
    try { fs.unlinkSync(path.join(ROOT, `${existingSlug}.html`)); } catch (_e) {}
    try { fs.unlinkSync(path.join(ROOT, `${existingSlug}.json`)); } catch (_e) {}
  }

  fs.writeFileSync(path.join(ROOT, `${slug}.html`), finalCode, 'utf8');
  fs.writeFileSync(path.join(ROOT, `${slug}.json`), JSON.stringify({
    id: finalId,
    name: finalName,
    isActive: finalActive,
    createdAt,
    updatedAt: now,
  }, null, 2), 'utf8');

  if (finalActive) deactivateSiblings(finalId);

  return { id: finalId, name: finalName, code: finalCode, isActive: finalActive, createdAt, updatedAt: now };
}

export function deleteFooter(id) {
  const slug = findSlugById(id);
  if (!slug) return false;
  try { fs.unlinkSync(path.join(ROOT, `${slug}.html`)); } catch (_e) {}
  try { fs.unlinkSync(path.join(ROOT, `${slug}.json`)); } catch (_e) {}
  return true;
}
