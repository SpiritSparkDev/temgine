// scripts/migrate-snippets-to-json.js
// Converts existing `snippets` rows so that `value` becomes JSON when needed:
// { snippet: string, type: 'free'|'bound'|'defined', handler: string }
// Usage (PowerShell):
//   $env:DATABASE_URL="postgresql://user:pass@host:5432/dbname"; node .\scripts\migrate-snippets-to-json.js --dry
//   $env:DATABASE_URL="postgresql://user:pass@host:5432/dbname"; node .\scripts\migrate-snippets-to-json.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BOUND_KEYS = new Set(['title', 'slug', 'blocks', 'metaTitle', 'header', 'pageHeader']);

function isStructuredJsonCandidate(raw) {
  if (!raw) return false;
  try {
    const p = JSON.parse(raw);
    return p && (p.snippet !== undefined || p.type !== undefined || p.handler !== undefined);
  } catch (e) {
    return false;
  }
}

async function main() {
  const dry = process.argv.includes('--dry') || process.argv.includes('-d');
  console.log(`Snippets migration start (dry run = ${dry})`);

  const rows = await prisma.snippet.findMany();
  for (const row of rows) {
    const key = row.key;
    const raw = row.value || '';

    if (isStructuredJsonCandidate(raw)) {
      console.log(`SKIP ${key} — already structured JSON`);
      continue;
    }

    // Heuristics: if key is one of known bound keys, or the raw value already starts with '#', treat as bound
    let type = 'free';
    if (BOUND_KEYS.has(key) || String(raw).trim().startsWith('#')) {
      type = 'bound';
    }

    // Build new structured object
    const snippetValue = String(raw || '').trim();
    const newObj = { snippet: snippetValue, type, handler: '' };

    console.log(`${key} -> type=${type} value=${snippetValue ? snippetValue : '(empty)'}`);

    if (!dry) {
      try {
        await prisma.snippet.update({ where: { key }, data: { value: JSON.stringify(newObj) } });
      } catch (e) {
        console.error(`Failed to update snippet ${key}:`, e.message || e);
      }
    }
  }

  console.log('Migration finished.');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Migration failed:', e);
  prisma.$disconnect().then(() => process.exit(1));
});
