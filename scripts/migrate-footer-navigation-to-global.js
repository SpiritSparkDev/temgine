#!/usr/bin/env node

/**
 * Migrates the (already file-based) Footer and Navigation storage into the
 * unified "global page component" layout used by lib/globalPageStore.js:
 *
 *   public/assets/template/footer/<slug>.html + .json
 *   public/assets/template/navigation/<type>/<slug>.html + .json
 *     → public/assets/template/global/<role>/<slug>.html + .json
 *       (role = footer | main | page | mobile)
 *
 * IDs are preserved (as metadata, in the sidecar .json files) since
 * Page.data.pageFooter / Page.data.pageNav and `type: 'navigation'` blocks
 * reference entries by id.
 *
 * Not strictly required to keep the app working — lib/globalPageStore.js
 * already reads the old locations as a fallback — but this gives you a
 * clean, single location and stops the extra fallback reads. Idempotent:
 * existing files at the new location are left untouched unless --force is
 * passed.
 *
 * Usage:
 *   node scripts/migrate-footer-navigation-to-global.js [--force] [--dry-run] [--delete-source]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const deleteSource = args.includes('--delete-source');

const TEMPLATE_ROOT = path.join(__dirname, '..', 'public', 'assets', 'template');
const LEGACY_FOOTER_DIR = path.join(TEMPLATE_ROOT, 'footer');
const LEGACY_NAV_ROOT = path.join(TEMPLATE_ROOT, 'navigation');
const GLOBAL_ROOT = path.join(TEMPLATE_ROOT, 'global');

const SOURCES = [
  { role: 'footer', dir: LEGACY_FOOTER_DIR },
  { role: 'main', dir: path.join(LEGACY_NAV_ROOT, 'main') },
  { role: 'page', dir: path.join(LEGACY_NAV_ROOT, 'page') },
  { role: 'mobile', dir: path.join(LEGACY_NAV_ROOT, 'mobile') },
];

function readDirSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return [];
  }
}

function logAction(prefix, relPath) {
  console.log(`  ${prefix} ${relPath}`);
}

function migrateRole({ role, dir }) {
  const entries = readDirSafe(dir).filter((d) => d.isFile() && d.name.endsWith('.json'));
  if (entries.length === 0) return { found: 0, migrated: 0, sourceFiles: [] };

  console.log(`\n📦 Rolle "${role}": ${entries.length} Eintrag/Einträge in ${path.relative(process.cwd(), dir)}`);
  const destDir = path.join(GLOBAL_ROOT, role);
  let migrated = 0;
  const sourceFiles = [];

  for (const dirent of entries) {
    const slug = dirent.name.slice(0, -'.json'.length);
    const jsonSrc = path.join(dir, `${slug}.json`);
    const htmlSrc = path.join(dir, `${slug}.html`);
    const jsonDest = path.join(destDir, `${slug}.json`);
    const htmlDest = path.join(destDir, `${slug}.html`);
    sourceFiles.push(jsonSrc, htmlSrc);

    if (fs.existsSync(jsonDest) && !force) {
      logAction('übersprungen (existiert bereits):', path.relative(process.cwd(), jsonDest));
      continue;
    }

    if (dryRun) {
      logAction('[dry-run] würde schreiben:', path.relative(process.cwd(), jsonDest));
      migrated++;
      continue;
    }

    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(jsonSrc, jsonDest);
    fs.writeFileSync(htmlDest, fs.existsSync(htmlSrc) ? fs.readFileSync(htmlSrc, 'utf8') : '', 'utf8');
    logAction('✓', path.relative(process.cwd(), jsonDest));
    migrated++;
  }

  return { found: entries.length, migrated, sourceFiles };
}

function migrate() {
  console.log('🚀 Migriere Footer/Navigation in die vereinheitlichte globale Ablage...');
  if (dryRun) console.log('(Dry-Run — es wird nichts geschrieben)');

  let totalFound = 0;
  let totalMigrated = 0;
  const allSourceFiles = [];

  for (const source of SOURCES) {
    const { found, migrated, sourceFiles } = migrateRole(source);
    totalFound += found;
    totalMigrated += migrated;
    allSourceFiles.push(...sourceFiles);
  }

  if (totalFound === 0) {
    console.log('\nNichts zu migrieren gefunden (keine Footer/Navigationen in der alten Ablage).');
  } else if (totalMigrated === 0) {
    console.log('\nAlle gefundenen Einträge waren bereits am neuen Ort vorhanden — nichts zu tun.');
  }

  if (deleteSource && !dryRun) {
    console.log('\n🗑  Lösche migrierte Dateien aus der alten Ablage (--delete-source)...');
    for (const filePath of allSourceFiles) {
      try { fs.unlinkSync(filePath); } catch (_e) {}
    }
    console.log('  ✓ erledigt');
  }

  console.log(`\n✅ ${totalMigrated} Eintrag/Einträge migriert.`);
  if (dryRun) console.log('(Dry-Run — nichts wurde tatsächlich geschrieben.)');
  else if (!force) console.log('Hinweis: bereits vorhandene Dateien am neuen Ort wurden nicht überschrieben. --force erzwingt ein Update.');
  if (!deleteSource) console.log('Hinweis: die alten Dateien wurden NICHT gelöscht (lib/globalPageStore.js liest sie ohnehin weiter als Fallback). --delete-source räumt danach auf.');
}

migrate();
