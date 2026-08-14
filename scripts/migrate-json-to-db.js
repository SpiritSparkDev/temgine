// Migriere JSON-Daten in die PostgreSQL-Datenbank
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function migrateData() {
  console.log('📦 Starte Datenmigration von JSON zu PostgreSQL...\n');

  try {
    // JSON-Dateien laden
    // Project layout stores data in the repository root `data/` folder.
    // Resolve the repo root relative to this script (scripts/..)
    const dataDir = path.join(__dirname, '..', 'data');

    const pagesPath = path.join(dataDir, 'pages.json');
    const templatesPath = path.join(dataDir, 'templates.json');
    const snippetsPath = path.join(dataDir, 'snippets.json');

    if (!fs.existsSync(pagesPath) || !fs.existsSync(templatesPath) || !fs.existsSync(snippetsPath)) {
      console.error('❌ Migration: Eine oder mehrere JSON-Quelldateien fehlen unter:', dataDir);
      console.error('Erwartet:', pagesPath);
      console.error('Erwartet:', templatesPath);
      console.error('Erwartet:', snippetsPath);
      throw new Error('Migration abgebrochen: fehlende JSON-Dateien im data-Verzeichnis.');
    }

    const pagesData = JSON.parse(fs.readFileSync(pagesPath, 'utf-8'));
    const templatesData = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
    const snippetsData = JSON.parse(fs.readFileSync(snippetsPath, 'utf-8'));
    
    console.log(`📄 Geladen: ${pagesData.length} Seiten`);
    console.log(`📝 Geladen: ${templatesData.length} Templates`);
    console.log(`✂️ Geladen: ${snippetsData.length} Snippets\n`);

    // Templates migrieren
    console.log('📝 Migriere Templates...');
    for (const template of templatesData) {
      await prisma.template.upsert({
        where: { name: template.name },
        update: {
          code: template.code
        },
        create: {
          name: template.name,
          code: template.code
        }
      });
      console.log(`  ✓ ${template.name}`);
    }

    // Snippets migrieren
    console.log('\n✂️ Migriere Snippets...');
    for (const snippet of snippetsData) {
      // Use the label directly as the DB key so the admin UI maps keys to labels consistently.
      const key = String(snippet.label || '').trim();
      // Preserve metadata (type/handler) by JSON-encoding the value when present
      let value = String(snippet.snippet || '');
      if (snippet.type || snippet.handler) {
        value = JSON.stringify({ snippet: snippet.snippet || '', type: snippet.type || 'free', handler: snippet.handler || '' });
      }
      await prisma.snippet.upsert({
        where: { key: key },
        update: { value },
        create: { key: key, value }
      });
      console.log(`  ✓ ${snippet.label} (${key})`);
    }

    // Pages migrieren
    console.log('\n📄 Migriere Pages...');
    for (const page of pagesData) {
      // Slug generieren falls nicht vorhanden
      if (!page.slug) {
        page.slug = page.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        console.log(`  ⚠️ Generiere Slug für "${page.title}": ${page.slug}`);
      }

      await prisma.page.upsert({
        where: { slug: page.slug },
        update: {
          title: page.title,
          blocks: page.blocks || [],
          children: page.children || []
        },
        create: {
          slug: page.slug,
          title: page.title,
          blocks: page.blocks || [],
          children: page.children || []
        }
      });
      console.log(`  ✓ ${page.title} (/${page.slug})`);
    }

    // Finale Statistik
    console.log('\n✅ Migration abgeschlossen!\n');
    const stats = {
      users: await prisma.user.count(),
      pages: await prisma.page.count(),
      templates: await prisma.template.count(),
      snippets: await prisma.snippet.count()
    };
    
    console.log('📊 Datenbank-Status:');
    console.log(`   👥 Benutzer: ${stats.users}`);
    console.log(`   📄 Seiten: ${stats.pages}`);
    console.log(`   📝 Templates: ${stats.templates}`);
    console.log(`   ✂️ Snippets: ${stats.snippets}`);

  } catch (error) {
    console.error('\n❌ Fehler bei Migration:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

migrateData();
