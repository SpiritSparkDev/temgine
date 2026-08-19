import fs from 'fs';
import path from 'path';

// Templates live as files instead of DB rows:
//   public/assets/template/block/<Name>.html
//   public/assets/template/site/<Name>.html
//   public/assets/template_blog/<MasterName>/_master.html      (role: master)
//   public/assets/template_blog/<MasterName>/<PreviewName>.html (role: preview)
// A template's file basename (or, for a master, its parent folder name) IS its
// globally unique name — mirrors the old DB `name @unique` column.

const ROOT = path.join(process.cwd(), 'public', 'assets');
const GENERAL_DIR = path.join(ROOT, 'template');
const BLOG_DIR = path.join(ROOT, 'template_blog');
const MASTER_FILE = '_master.html';

function readDirSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return [];
  }
}

function isHtmlFile(dirent) {
  return dirent.isFile() && dirent.name.toLowerCase().endsWith('.html');
}

function baseName(fileName) {
  return fileName.slice(0, -'.html'.length);
}

export function listTemplates() {
  const list = [];

  for (const typeDir of ['block', 'site']) {
    const dir = path.join(GENERAL_DIR, typeDir);
    for (const dirent of readDirSafe(dir)) {
      if (!isHtmlFile(dirent)) continue;
      const code = fs.readFileSync(path.join(dir, dirent.name), 'utf8');
      list.push({
        name: baseName(dirent.name),
        code,
        type: typeDir === 'site' ? 'SITE' : 'BLOCK',
        blogRole: null,
        masterTemplateName: null,
      });
    }
  }

  for (const masterDirent of readDirSafe(BLOG_DIR)) {
    if (!masterDirent.isDirectory()) continue;
    const masterName = masterDirent.name;
    const masterFolder = path.join(BLOG_DIR, masterName);
    for (const dirent of readDirSafe(masterFolder)) {
      if (!isHtmlFile(dirent)) continue;
      const code = fs.readFileSync(path.join(masterFolder, dirent.name), 'utf8');
      if (dirent.name === MASTER_FILE) {
        list.push({ name: masterName, code, type: 'BLOCK', blogRole: 'master', masterTemplateName: null });
      } else {
        list.push({ name: baseName(dirent.name), code, type: 'BLOCK', blogRole: 'preview', masterTemplateName: masterName });
      }
    }
  }

  return list;
}

// Case-insensitive, matching the old `mode: 'insensitive'` DB lookup.
export function getTemplateByName(name) {
  if (!name) return null;
  const target = String(name).toLowerCase();
  return listTemplates().find((t) => t.name.toLowerCase() === target) || null;
}

function resolvePath(t) {
  if (t.blogRole === 'master') return path.join(BLOG_DIR, t.name, MASTER_FILE);
  if (t.blogRole === 'preview') return path.join(BLOG_DIR, t.masterTemplateName, `${t.name}.html`);
  const typeDir = String(t.type).toUpperCase() === 'SITE' ? 'site' : 'block';
  return path.join(GENERAL_DIR, typeDir, `${t.name}.html`);
}

// Creates or updates a template. Pass `previousName` (the template's current
// name, before edits) when the caller allows renaming/re-parenting — the old
// file is removed once the new one is written so nothing is left behind.
export function saveTemplate({ name, code, type, blogRole, masterTemplateName }, previousName = null) {
  const next = {
    name: String(name).trim(),
    type,
    blogRole: blogRole || null,
    masterTemplateName: masterTemplateName || null,
  };
  const newPath = resolvePath(next);

  const existing = getTemplateByName(previousName || next.name);
  if (existing) {
    const oldPath = resolvePath(existing);
    if (oldPath !== newPath) {
      try { fs.unlinkSync(oldPath); } catch (_e) { /* already gone */ }
    }
  }

  fs.mkdirSync(path.dirname(newPath), { recursive: true });
  fs.writeFileSync(newPath, String(code), 'utf8');
  return next;
}

export function deleteTemplateByName(name) {
  const existing = getTemplateByName(name);
  if (!existing) return false;
  fs.unlinkSync(resolvePath(existing));
  return true;
}
