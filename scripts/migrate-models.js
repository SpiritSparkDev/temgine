const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function printHelp() {
  console.log(`
Usage:
  node scripts/migrate-models.js --config <path> [--write] [--backup <path>]

Options:
  --config <path>   Path to a JSON migration config
  --write           Execute changes. Without this flag, the script runs as dry-run
  --backup <path>   Optional path for the rollback backup file
  --help            Show this help text

Config format:
{
  "models": [
    {
      "contentTypeSlug": "blog-post",
      "filter": {
        "template": ["Seiten"],
        "status": ["PUBLISHED"],
        "slugs": ["home", "features"],
        "slugPrefix": "blog/"
      },
      "mappings": {
        "title": "page.title",
        "slug": "page.slug",
        "excerpt": "page.data.excerpt",
        "body": "page.data.content",
        "publishedAt": "page.publishAt"
      },
      "static": {
        "origin": "page-migration"
      },
      "matchBy": "slug",
      "titleField": "title"
    }
  ]
}
`);
}

function parseArgs(argv) {
  const args = {
    write: false,
    help: false,
    configPath: '',
    backupPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    if (token === '--write') {
      args.write = true;
      continue;
    }

    if (token === '--config') {
      args.configPath = argv[index + 1] || '';
      index += 1;
      continue;
    }

    if (token === '--backup') {
      args.backupPath = argv[index + 1] || '';
      index += 1;
      continue;
    }
  }

  return args;
}

function ensureAbsolutePath(targetPath) {
  if (!targetPath) return '';
  return path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(process.cwd(), targetPath);
}

function loadJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function tokenizePath(expression) {
  return String(expression || '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function resolvePathValue(source, expression) {
  if (!expression) return undefined;
  const tokens = tokenizePath(expression);
  let current = source;

  for (const token of tokens) {
    if (current == null) return undefined;
    current = current[token];
  }

  return current;
}

function normalizeFieldValue(field, value) {
  if (value == null) return value;

  const fieldType = String(field?.type || 'text').toLowerCase();

  if (fieldType === 'number') {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : numeric;
  }

  if (fieldType === 'checkbox' || fieldType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return Boolean(value);
  }

  if (fieldType === 'date') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toISOString().slice(0, 10);
  }

  return value;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
}

function pageMatchesFilter(page, filter) {
  if (!filter || typeof filter !== 'object') return true;

  const templates = toArray(filter.template);
  if (templates.length > 0 && !templates.includes(page.template)) return false;

  const statuses = toArray(filter.status);
  if (statuses.length > 0 && !statuses.includes(page.status)) return false;

  const slugs = toArray(filter.slugs);
  if (slugs.length > 0 && !slugs.includes(page.slug)) return false;

  if (filter.slugPrefix && !String(page.slug || '').startsWith(String(filter.slugPrefix))) return false;

  if (filter.slugPattern) {
    const pattern = new RegExp(String(filter.slugPattern));
    if (!pattern.test(String(page.slug || ''))) return false;
  }

  return true;
}

function buildEntryData(page, rule, fieldMap) {
  const data = {};
  const missingRequired = [];

  for (const field of fieldMap.values()) {
    const expression = rule.mappings?.[field.key];
    const staticValue = rule.static && Object.prototype.hasOwnProperty.call(rule.static, field.key)
      ? rule.static[field.key]
      : undefined;
    const resolvedValue = expression ? resolvePathValue({ page }, expression) : staticValue;
    const normalizedValue = normalizeFieldValue(field, resolvedValue);

    if (normalizedValue !== undefined) {
      data[field.key] = normalizedValue;
    }

    const isEmptyString = typeof normalizedValue === 'string' && normalizedValue.trim() === '';
    if (field.required && (normalizedValue == null || isEmptyString)) {
      missingRequired.push(field.key);
    }
  }

  if (rule.static && typeof rule.static === 'object') {
    for (const [key, value] of Object.entries(rule.static)) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        data[key] = value;
      }
    }
  }

  return { data, missingRequired };
}

function serializeComparableValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function findExistingEntry(entries, matchBy, nextData) {
  if (!matchBy) return null;
  const nextComparable = serializeComparableValue(nextData[matchBy]);
  if (!nextComparable) return null;

  return entries.find((entry) => serializeComparableValue(entry.data?.[matchBy]) === nextComparable) || null;
}

function defaultBackupPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), 'data', 'backups', `content-model-migration-${stamp}.json`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.configPath) {
    throw new Error('Fehlendes Argument: --config <path>');
  }

  const configPath = ensureAbsolutePath(args.configPath);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config nicht gefunden: ${configPath}`);
  }

  const config = loadJsonFile(configPath);
  if (!Array.isArray(config.models) || config.models.length === 0) {
    throw new Error('Config muss ein nicht-leeres Array unter "models" enthalten');
  }

  const backup = {
    createdAt: new Date().toISOString(),
    configPath,
    dryRun: !args.write,
    operations: [],
  };

  console.log(args.write ? 'Write-Modus aktiviert' : 'Dry-Run aktiviert');
  console.log(`Konfiguration: ${configPath}`);

  const allPages = await prisma.page.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  let totalCandidates = 0;
  let totalCreates = 0;
  let totalUpdates = 0;
  let totalSkipped = 0;

  for (const rule of config.models) {
    if (!rule || !rule.contentTypeSlug) {
      throw new Error('Jede Modellregel braucht "contentTypeSlug"');
    }

    const contentType = await prisma.contentType.findUnique({
      where: { slug: String(rule.contentTypeSlug) },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!contentType) {
      const availableContentTypes = await prisma.contentType.findMany({
        orderBy: { slug: 'asc' },
        select: { slug: true },
      });
      const availableSlugs = availableContentTypes.map((item) => item.slug).filter(Boolean);
      const suggestion = availableSlugs.length > 0
        ? `Verfuegbar: ${availableSlugs.join(', ')}`
        : 'Keine Content Types vorhanden. Lege zuerst ein Modell an oder importiere die Init-Daten mit `npm run import-init`.';
      throw new Error(`Content Type nicht gefunden: ${rule.contentTypeSlug}. ${suggestion}`);
    }

    const fieldMap = new Map(contentType.fields.map((field) => [field.key, field]));

    const invalidMappings = Object.keys(rule.mappings || {}).filter((key) => !fieldMap.has(key));
    if (invalidMappings.length > 0) {
      throw new Error(`Unbekannte Feld-Keys in ${rule.contentTypeSlug}: ${invalidMappings.join(', ')}`);
    }

    const pages = allPages.filter((page) => pageMatchesFilter(page, rule.filter));
    const existingEntries = await prisma.contentEntry.findMany({
      where: { contentTypeId: contentType.id },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`\n[${rule.contentTypeSlug}] ${pages.length} passende Seiten gefunden`);

    for (const page of pages) {
      totalCandidates += 1;

      const { data, missingRequired } = buildEntryData(page, rule, fieldMap);
      const matchBy = rule.matchBy || 'slug';
      const titleField = rule.titleField || 'title';
      const title = data[titleField] || page.title || page.slug || '';

      if (missingRequired.length > 0) {
        totalSkipped += 1;
        console.log(`  skip ${page.slug || page.id}: fehlende Pflichtfelder ${missingRequired.join(', ')}`);
        backup.operations.push({
          action: 'skip',
          reason: 'missing-required-fields',
          pageId: page.id,
          pageSlug: page.slug,
          contentTypeSlug: contentType.slug,
          missingRequired,
          preview: data,
        });
        continue;
      }

      const existingEntry = findExistingEntry(existingEntries, matchBy, data);

      if (existingEntry) {
        totalUpdates += 1;
        console.log(`  update ${page.slug || page.id} -> entry ${existingEntry.id}`);
        backup.operations.push({
          action: 'update',
          pageId: page.id,
          pageSlug: page.slug,
          contentTypeSlug: contentType.slug,
          entryId: existingEntry.id,
          matchBy,
          before: existingEntry,
          after: { data, title },
        });

        if (args.write) {
          const updatedEntry = await prisma.contentEntry.update({
            where: { id: existingEntry.id },
            data: { data, title },
          });
          existingEntry.data = updatedEntry.data;
          existingEntry.title = updatedEntry.title;
        }
      } else {
        totalCreates += 1;
        console.log(`  create ${page.slug || page.id}`);

        if (args.write) {
          const createdEntry = await prisma.contentEntry.create({
            data: {
              contentTypeId: contentType.id,
              data,
              title,
            },
          });

          existingEntries.push(createdEntry);
          backup.operations.push({
            action: 'create',
            pageId: page.id,
            pageSlug: page.slug,
            contentTypeSlug: contentType.slug,
            entryId: createdEntry.id,
            after: createdEntry,
          });
        } else {
          backup.operations.push({
            action: 'create',
            pageId: page.id,
            pageSlug: page.slug,
            contentTypeSlug: contentType.slug,
            after: { data, title },
          });
        }
      }
    }
  }

  console.log('\nZusammenfassung');
  console.log(`  Kandidaten: ${totalCandidates}`);
  console.log(`  Creates:    ${totalCreates}`);
  console.log(`  Updates:    ${totalUpdates}`);
  console.log(`  Skips:      ${totalSkipped}`);

  if (args.write) {
    const backupPath = ensureAbsolutePath(args.backupPath) || defaultBackupPath();
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf-8');
    console.log(`\nBackup geschrieben: ${backupPath}`);
  } else {
    console.log('\nKeine Änderungen geschrieben. Für Ausführung --write verwenden.');
  }
}

run()
  .catch((error) => {
    console.error(`\nMigration fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });