#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    const result = await prisma.template.upsert({
      where: { name: 'NurText' },
      update: {
        code: `<section class="page">
  <header>
    <h2>{{title}}</h2>
  </header>
  {{text}}
  <footer>Footer</footer>
</section>`
      },
      create: {
        name: 'NurText',
        type: 'BLOCK',
        code: `<section class="page">
  <header>
    <h2>{{title}}</h2>
  </header>
  {{text}}
  <footer>Footer</footer>
</section>`
      }
    });
    
    console.log('✅ Template aktualisiert:',result.name);
  } catch (e) {
    console.error('❌ Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
