import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { connectionString } = req.body;

  if (!connectionString) {
    return res.status(400).json({ error: 'Connection string required' });
  }

  const log = [];
  let prisma;

  try {
    log.push('Starte Migration...');

    // Prisma Client initialisieren
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: connectionString,
        },
      },
    });

    await prisma.$connect();
    log.push('✓ Datenbankverbindung hergestellt');

    // JSON-Dateien laden
    const dataDir = path.join(process.cwd(), 'data');
    
    const pagesData = JSON.parse(fs.readFileSync(path.join(dataDir, 'pages.json'), 'utf-8'));
    const templatesData = JSON.parse(fs.readFileSync(path.join(dataDir, 'templates.json'), 'utf-8'));
    const snippetsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'snippets.json'), 'utf-8'));
    
    log.push(`✓ JSON-Dateien geladen: ${pagesData.length} Seiten, ${Object.keys(templatesData).length} Templates, ${Object.keys(snippetsData).length} Snippets`);

    // Alte Daten löschen
    await prisma.snippet.deleteMany({});
    await prisma.template.deleteMany({});
    await prisma.page.deleteMany({});
    log.push('✓ Alte Daten gelöscht');

    // Pages migrieren
    for (const page of pagesData) {
      await prisma.page.create({
        data: {
          id: page.id,
          slug: page.slug,
          title: page.title,
          blocks: page.blocks || [],
          children: page.children || [],
        },
      });
    }
    log.push(`✓ ${pagesData.length} Seiten migriert`);

    // Templates migrieren
    let templateCount = 0;
    const templates = Array.isArray(templatesData) ? templatesData : Object.entries(templatesData).map(([name, code]) => ({ name, code }));
    for (const template of templates) {
      await prisma.template.create({
        data: {
          name: template.name,
          code: template.code,
        },
      });
      templateCount++;
    }
    log.push(`✓ ${templateCount} Templates migriert`);

    // Snippets migrieren
    let snippetCount = 0;
    const snippets = Array.isArray(snippetsData) 
      ? snippetsData 
      : Object.entries(snippetsData).map(([key, value]) => ({ 
          label: key, 
          snippet: typeof value === 'string' ? value : value.snippet || value 
        }));
    
    for (const snippet of snippets) {
      await prisma.snippet.create({
        data: {
          key: snippet.label || snippet.key,
          value: snippet.snippet || snippet.value,
        },
      });
      snippetCount++;
    }
    log.push(`✓ ${snippetCount} Snippets migriert`);

    // Backup erstellen
    const backupDir = path.join(process.cwd(), 'data', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(
      path.join(dataDir, 'pages.json'),
      path.join(backupDir, `pages-${timestamp}.json`)
    );
    fs.copyFileSync(
      path.join(dataDir, 'templates.json'),
      path.join(backupDir, `templates-${timestamp}.json`)
    );
    fs.copyFileSync(
      path.join(dataDir, 'snippets.json'),
      path.join(backupDir, `snippets-${timestamp}.json`)
    );
    log.push(`✓ Backup erstellt in data/backups/`);

    log.push('✓ Migration erfolgreich abgeschlossen!');

    res.status(200).json({ success: true, log });
  } catch (error) {
    console.error('Migration failed:', error);
    log.push(`✗ Fehler: ${error.message}`);
    res.status(500).json({ 
      error: error.message || 'Migration failed',
      log,
    });
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}
