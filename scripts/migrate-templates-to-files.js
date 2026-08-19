#!/usr/bin/env node

/**
 * Migrates Template rows from the database to the new file-based template
 * system:
 *   public/assets/template/block/<Name>.html
 *   public/assets/template/site/<Name>.html
 *   public/assets/template_blog/<MasterName>/_master.html
 *   public/assets/template_blog/<MasterName>/<PreviewName>.html
 *
 * Idempotent: existing files are left untouched (a file may already have been
 * hand-edited since a previous run) unless --force is passed. Run this once
 * per environment when patching to the file-based template system, or again
 * with --force to re-export the current DB state.
 *
 * Usage:
 *   node scripts/migrate-templates-to-files.js [--force] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ROOT = path.join(__dirname, '..', 'public', 'assets');
const GENERAL_DIR = path.join(ROOT, 'template');
const BLOG_DIR = path.join(ROOT, 'template_blog');

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

// Same encoding blogType used in the DB (see lib/blogTemplateWorkflow.js),
// duplicated here rather than imported since scripts/ runs as plain
// CommonJS and lib/ uses ES module syntax transpiled only by Next/Jest.
function parseBlogTemplateMeta(blogType) {
  const value = String(blogType || '').trim();
  if (!value) return { blogRole: null, masterTemplateName: null };

  const lower = value.toLowerCase();
  if (lower === 'master' || lower === 'reading') {
    return { blogRole: 'master', masterTemplateName: null };
  }
  if (lower.startsWith('preview:')) {
    const masterTemplateName = value.slice(value.indexOf(':') + 1).trim() || null;
    return { blogRole: 'preview', masterTemplateName };
  }
  if (lower === 'detail' || lower === 'simple' || lower === 'archive') {
    return { blogRole: 'preview', masterTemplateName: null };
  }
  return { blogRole: null, masterTemplateName: null };
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

async function migrate() {
  console.log('🚀 Migriere Templates von der Datenbank in Dateien...\n');
  if (dryRun) console.log('(Dry-Run — es wird nichts geschrieben)\n');

  const templates = await prisma.template.findMany({
    select: { name: true, code: true, type: true, blogType: true },
    orderBy: { createdAt: 'asc' },
  });

  if (templates.length === 0) {
    console.log('Keine Templates in der Datenbank gefunden — nichts zu tun.');
    await prisma.$disconnect();
    return;
  }

  const byName = new Map(templates.map((t) => [t.name, t]));
  let migrated = 0;
  let orphanedPreviews = 0;

  for (const t of templates) {
    const meta = parseBlogTemplateMeta(t.blogType);

    if (meta.blogRole === 'master') {
      writeFile(path.join(BLOG_DIR, t.name, '_master.html'), t.code);
      migrated++;
      continue;
    }

    if (meta.blogRole === 'preview') {
      const masterName = meta.masterTemplateName;
      if (!masterName || !byName.has(masterName)) {
        console.warn(`  ⚠ "${t.name}" ist ein Vorschau-Template ohne auffindbares Master-Template ("${masterName || '—'}") — wird stattdessen als allgemeines Block-Template abgelegt.`);
        writeFile(path.join(GENERAL_DIR, 'block', `${t.name}.html`), t.code);
        orphanedPreviews++;
        continue;
      }
      writeFile(path.join(BLOG_DIR, masterName, `${t.name}.html`), t.code);
      migrated++;
      continue;
    }

    const typeDir = String(t.type).toUpperCase() === 'SITE' ? 'site' : 'block';
    writeFile(path.join(GENERAL_DIR, typeDir, `${t.name}.html`), t.code);
    migrated++;
  }

  console.log(`\n✅ ${migrated} Template(s) migriert${orphanedPreviews ? `, ${orphanedPreviews} verwaiste Vorschau(en) als Block-Template abgelegt` : ''}.`);
  if (dryRun) console.log('(Dry-Run — nichts wurde tatsächlich geschrieben. Erneut ohne --dry-run ausführen, um zu schreiben.)');
  else if (!force) console.log('Hinweis: bereits vorhandene Dateien wurden nicht überschrieben. --force erzwingt ein Update.');

  await prisma.$disconnect();
}

migrate().catch((err) => {
  console.error('❌ Migration fehlgeschlagen:', err);
  process.exit(1);
});
