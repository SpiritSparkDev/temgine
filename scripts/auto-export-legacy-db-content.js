#!/usr/bin/env node

/**
 * Runs automatically on every boot (see server.js), BEFORE `prisma migrate
 * deploy`. Older Temgine instances still have Navigation/Footer rows and
 * maintenance_* Settings in the database; the migration
 * 20260924190000_move_templates_navigation_footer_maintenance_to_files drops
 * those tables/rows. Without this step, updating an old instance straight to
 * the new code would silently delete that content the moment the container
 * boots and `migrate deploy` runs.
 *
 * Uses raw SQL ($queryRawUnsafe), not the generated Prisma Client's typed
 * accessors — the client is generated from the CURRENT schema.prisma, which
 * no longer declares Navigation/Footer/Template, so `prisma.navigation` etc.
 * don't exist as properties even though the tables may still be physically
 * present in an older database. Raw queries bypass that and talk straight to
 * Postgres.
 *
 * Idempotent (skips files that already exist) and a no-op once a database has
 * already been migrated (the tables are gone, so there's nothing to read).
 * Never throws — a failure here must not block the app from booting.
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public', 'assets', 'template');
const NAV_ROOT = path.join(ROOT, 'navigation');
const FOOTER_ROOT = path.join(ROOT, 'footer');
const MAINTENANCE_ROOT = path.join(ROOT, 'maintenance');

function slugify(name) {
  const base = String(name || 'item')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'item';
}

function uniqueSlug(dir, name, usedSlugs) {
  const base = slugify(name);
  let slug = base;
  let i = 2;
  while (usedSlugs.has(slug) || fs.existsSync(path.join(dir, `${slug}.json`))) {
    slug = `${base}-${i}`;
    i++;
  }
  usedSlugs.add(slug);
  return slug;
}

function writeIfMissing(filePath, content) {
  if (fs.existsSync(filePath)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

async function tableExists(prisma, name) {
  const rows = await prisma.$queryRawUnsafe(`SELECT to_regclass('public."${name}"')::text AS reg`);
  return rows?.[0]?.reg !== null;
}

async function exportNavigations(prisma) {
  if (!(await tableExists(prisma, 'Navigation'))) return 0;
  const navs = await prisma.$queryRawUnsafe(`SELECT * FROM "Navigation" ORDER BY type ASC, "createdAt" ASC`);
  if (navs.length === 0) return 0;
  console.log(`> [auto-export] ${navs.length} Navigation(en) in der DB gefunden, exportiere...`);
  const usedSlugsByType = {};
  let written = 0;
  for (const nav of navs) {
    const type = String(nav.type || 'MAIN').toLowerCase();
    const dir = path.join(NAV_ROOT, type);
    usedSlugsByType[type] = usedSlugsByType[type] || new Set();
    const slug = uniqueSlug(dir, nav.name, usedSlugsByType[type]);
    const wroteHtml = writeIfMissing(path.join(dir, `${slug}.html`), nav.code || '');
    const wroteJson = writeIfMissing(path.join(dir, `${slug}.json`), JSON.stringify({
      id: nav.id,
      name: nav.name,
      isActive: nav.isActive,
      createdAt: new Date(nav.createdAt).toISOString(),
      updatedAt: new Date(nav.updatedAt).toISOString(),
    }, null, 2));
    if (wroteHtml || wroteJson) written++;
  }
  return written;
}

async function exportFooters(prisma) {
  if (!(await tableExists(prisma, 'Footer'))) return 0;
  const footers = await prisma.$queryRawUnsafe(`SELECT * FROM "Footer" ORDER BY "createdAt" ASC`);
  if (footers.length === 0) return 0;
  console.log(`> [auto-export] ${footers.length} Footer in der DB gefunden, exportiere...`);
  const usedSlugs = new Set();
  let written = 0;
  for (const f of footers) {
    const slug = uniqueSlug(FOOTER_ROOT, f.name, usedSlugs);
    const wroteHtml = writeIfMissing(path.join(FOOTER_ROOT, `${slug}.html`), f.code || '');
    const wroteJson = writeIfMissing(path.join(FOOTER_ROOT, `${slug}.json`), JSON.stringify({
      id: f.id,
      name: f.name,
      isActive: f.isActive,
      createdAt: new Date(f.createdAt).toISOString(),
      updatedAt: new Date(f.updatedAt).toISOString(),
    }, null, 2));
    if (wroteHtml || wroteJson) written++;
  }
  return written;
}

async function exportTemplates(prisma) {
  if (!(await tableExists(prisma, 'Template'))) return 0;
  const templates = await prisma.$queryRawUnsafe(`SELECT * FROM "Template" ORDER BY "createdAt" ASC`);
  if (templates.length === 0) return 0;
  console.log(`> [auto-export] ${templates.length} Template(s) in der DB gefunden, exportiere...`);
  let written = 0;
  for (const t of templates) {
    const typeDir = String(t.type).toUpperCase() === 'SITE' ? 'site' : 'block';
    const filePath = path.join(ROOT, typeDir, `${t.name}.html`);
    if (writeIfMissing(filePath, t.code || '')) written++;
  }
  return written;
}

const MAINTENANCE_PREFIXES = {
  'maintenance_404': '404',
  'maintenance_503': '503',
  'maintenance_no_homepage': 'no-homepage',
  'maintenance_loading': 'loading',
};

async function exportMaintenance(prisma) {
  if (!(await tableExists(prisma, 'Setting'))) return 0;
  const rows = await prisma.$queryRawUnsafe(`SELECT * FROM "Setting" WHERE key LIKE 'maintenance_%'`);
  if (rows.length === 0) return 0;
  console.log(`> [auto-export] ${rows.length} Maintenance-Setting(s) in der DB gefunden, exportiere...`);
  let written = 0;
  for (const s of rows) {
    const match = String(s.key).match(/^(maintenance_(?:404|503|no_homepage|loading))_(html|css|js)$/);
    if (!match) continue;
    const page = MAINTENANCE_PREFIXES[match[1]];
    if (!page) continue;
    if (writeIfMissing(path.join(MAINTENANCE_ROOT, `${page}.${match[2]}`), s.value || '')) written++;
  }
  return written;
}

async function safely(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.warn(`> [auto-export] ${label} übersprungen: ${e.message}`);
    return 0;
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const navCount = await safely('Navigationen', () => exportNavigations(prisma));
    const footerCount = await safely('Footer', () => exportFooters(prisma));
    const templateCount = await safely('Templates', () => exportTemplates(prisma));
    const maintenanceCount = await safely('Maintenance-Seiten', () => exportMaintenance(prisma));
    const total = navCount + footerCount + templateCount + maintenanceCount;
    if (total > 0) {
      console.log(`> [auto-export] ${total} Datei(en) aus der Datenbank exportiert (Navigation/Footer/Templates/Maintenance).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
