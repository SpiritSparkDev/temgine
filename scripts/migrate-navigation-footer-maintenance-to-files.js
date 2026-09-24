#!/usr/bin/env node

/**
 * Migrates Navigation rows, Footer rows and maintenance_* Settings rows from
 * the database to the file-based system (mirrors migrate-templates-to-files.js):
 *   public/assets/template/navigation/<type>/<slug>.html + .json
 *   public/assets/template/footer/<slug>.html + .json
 *   public/assets/template/maintenance/<404|503|no-homepage|loading>.{html,css,js}
 *
 * IDs are preserved (as metadata, in the sidecar .json files) since Page.data.pageNav /
 * Page.data.pageFooter and `type: 'navigation'` blocks reference navigations/footers by id.
 *
 * Run this BEFORE applying the Prisma migration that drops the Navigation/Footer
 * tables — it reads from them directly.
 *
 * Idempotent: existing files are left untouched unless --force is passed.
 *
 * Usage:
 *   node scripts/migrate-navigation-footer-maintenance-to-files.js [--force] [--dry-run] [--delete-source]
 */

const { PrismaClient } = require('@prisma/client');
const path = require('path');

// scripts/ runs as plain CommonJS; lib/ uses ES module syntax transpiled only
// by Next/Jest — duplicate the tiny bit of file-writing logic here instead of
// importing lib/navigationStore.js etc.
const fs = require('fs');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const deleteSource = args.includes('--delete-source');

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
  while (usedSlugs.has(slug) || (fs.existsSync(path.join(dir, `${slug}.json`)) && !force)) {
    slug = `${base}-${i}`;
    i++;
  }
  usedSlugs.add(slug);
  return slug;
}

function writeFile(filePath, content) {
  const rel = path.relative(process.cwd(), filePath);
  if (dryRun) {
    console.log(`  [dry-run] würde schreiben: ${rel}`);
    return;
  }
  if (fs.existsSync(filePath) && !force) {
    console.log(`  übersprungen (existiert bereits): ${rel}`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  ✓ ${rel}`);
}

async function migrateNavigations() {
  const navs = await prisma.navigation.findMany({ orderBy: [{ type: 'asc' }, { createdAt: 'asc' }] });
  if (navs.length === 0) {
    console.log('Keine Navigationen in der Datenbank gefunden.');
    return [];
  }
  console.log(`\n📐 Migriere ${navs.length} Navigation(en)...`);
  const usedSlugsByType = {};
  for (const nav of navs) {
    const type = String(nav.type || 'MAIN').toLowerCase();
    const dir = path.join(NAV_ROOT, type);
    usedSlugsByType[type] = usedSlugsByType[type] || new Set();
    const slug = uniqueSlug(dir, nav.name, usedSlugsByType[type]);
    writeFile(path.join(dir, `${slug}.html`), nav.code || '');
    writeFile(path.join(dir, `${slug}.json`), JSON.stringify({
      id: nav.id,
      name: nav.name,
      isActive: nav.isActive,
      createdAt: nav.createdAt.toISOString(),
      updatedAt: nav.updatedAt.toISOString(),
    }, null, 2));
  }
  return navs;
}

async function migrateFooters() {
  const footers = await prisma.footer.findMany({ orderBy: { createdAt: 'asc' } });
  if (footers.length === 0) {
    console.log('Keine Footer in der Datenbank gefunden.');
    return [];
  }
  console.log(`\n🦶 Migriere ${footers.length} Footer...`);
  const usedSlugs = new Set();
  for (const f of footers) {
    const slug = uniqueSlug(FOOTER_ROOT, f.name, usedSlugs);
    writeFile(path.join(FOOTER_ROOT, `${slug}.html`), f.code || '');
    writeFile(path.join(FOOTER_ROOT, `${slug}.json`), JSON.stringify({
      id: f.id,
      name: f.name,
      isActive: f.isActive,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    }, null, 2));
  }
  return footers;
}

const MAINTENANCE_PREFIXES = {
  'maintenance_404': '404',
  'maintenance_503': '503',
  'maintenance_no_homepage': 'no-homepage',
  'maintenance_loading': 'loading',
};

async function migrateMaintenance() {
  const settings = await prisma.setting.findMany({
    where: { key: { startsWith: 'maintenance_' } },
  });
  if (settings.length === 0) {
    console.log('Keine Maintenance-Settings in der Datenbank gefunden.');
    return [];
  }
  console.log(`\n🚧 Migriere ${settings.length} Maintenance-Setting(s)...`);
  for (const s of settings) {
    const match = String(s.key).match(/^(maintenance_(?:404|503|no_homepage|loading))_(html|css|js)$/);
    if (!match) {
      console.warn(`  ⚠ Unbekannter Maintenance-Key übersprungen: ${s.key}`);
      continue;
    }
    const page = MAINTENANCE_PREFIXES[match[1]];
    const field = match[2];
    writeFile(path.join(MAINTENANCE_ROOT, `${page}.${field}`), s.value || '');
  }
  return settings;
}

async function migrate() {
  console.log('🚀 Migriere Navigationen, Footer und Maintenance-Seiten von der Datenbank in Dateien...');
  if (dryRun) console.log('(Dry-Run — es wird nichts geschrieben)');

  const navs = await migrateNavigations();
  const footers = await migrateFooters();
  const settings = await migrateMaintenance();

  if (deleteSource && !dryRun) {
    console.log('\n🗑  Lösche migrierte Zeilen aus der Datenbank (--delete-source)...');
    if (navs.length) await prisma.navigation.deleteMany({});
    if (footers.length) await prisma.footer.deleteMany({});
    if (settings.length) await prisma.setting.deleteMany({ where: { key: { startsWith: 'maintenance_' } } });
    console.log('  ✓ erledigt');
  }

  console.log(`\n✅ ${navs.length} Navigation(en), ${footers.length} Footer, ${settings.length} Maintenance-Setting(s) migriert.`);
  if (dryRun) console.log('(Dry-Run — nichts wurde tatsächlich geschrieben.)');
  else if (!force) console.log('Hinweis: bereits vorhandene Dateien wurden nicht überschrieben. --force erzwingt ein Update.');
  if (!deleteSource) console.log('Hinweis: die DB-Zeilen wurden NICHT gelöscht. --delete-source räumt danach auf (vor der Schema-Migration sinnvoll).');

  await prisma.$disconnect();
}

migrate().catch((err) => {
  console.error('❌ Migration fehlgeschlagen:', err);
  process.exit(1);
});
