const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function printHelp() {
  console.log(`
Usage:
  node scripts/rollback-model-migration.js --backup <path>

Options:
  --backup <path>   Path to a backup file created by migrate-models.js
  --help            Show this help text
`);
}

function parseArgs(argv) {
  const args = {
    help: false,
    backupPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    if (token === '--backup') {
      args.backupPath = argv[index + 1] || '';
      index += 1;
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

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.backupPath) {
    throw new Error('Fehlendes Argument: --backup <path>');
  }

  const backupPath = ensureAbsolutePath(args.backupPath);
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup nicht gefunden: ${backupPath}`);
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  if (!Array.isArray(backup.operations)) {
    throw new Error('Backup-Datei enthält keine gültigen Operationen');
  }

  if (backup.dryRun) {
    throw new Error('Backup stammt aus einem Dry-Run und enthält keine schreibbaren Änderungen');
  }

  let restoredUpdates = 0;
  let deletedCreates = 0;
  let ignored = 0;

  for (const operation of [...backup.operations].reverse()) {
    if (operation.action === 'create') {
      if (!operation.entryId) {
        ignored += 1;
        continue;
      }

      await prisma.contentEntry.deleteMany({ where: { id: String(operation.entryId) } });
      deletedCreates += 1;
      console.log(`delete create ${operation.entryId}`);
      continue;
    }

    if (operation.action === 'update') {
      if (!operation.entryId || !operation.before) {
        ignored += 1;
        continue;
      }

      await prisma.contentEntry.update({
        where: { id: String(operation.entryId) },
        data: {
          data: operation.before.data || {},
          title: operation.before.title || '',
        },
      });
      restoredUpdates += 1;
      console.log(`restore update ${operation.entryId}`);
      continue;
    }

    ignored += 1;
  }

  console.log('\nRollback abgeschlossen');
  console.log(`  Restored updates: ${restoredUpdates}`);
  console.log(`  Deleted creates:  ${deletedCreates}`);
  console.log(`  Ignored:          ${ignored}`);
}

run()
  .catch((error) => {
    console.error(`\nRollback fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });