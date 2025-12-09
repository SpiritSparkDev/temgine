#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    const templates = await prisma.template.findMany({
      orderBy: { name: 'asc' }
    });
    
    console.log('\n📋 Alle Templates:\n');
    for (const t of templates) {
      console.log(`\n━━━ ${t.name} (${t.type}) ━━━`);
      console.log(t.code);
      console.log('─────────────────────────────');
    }
  } catch (e) {
    console.error('❌ Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
