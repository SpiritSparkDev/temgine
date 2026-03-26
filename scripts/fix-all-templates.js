#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    // Update Text Artikel
    await prisma.template.update({
      where: { name: 'Text Artikel' },
      data: {
        code: `<article class="text_article #class:title">
  <p>{{text}}</p>
</article>`
      }
    });
    console.log('✅ Text Artikel aktualisiert');

    // Update Text
    await prisma.template.update({
      where: { name: 'Text' },
      data: {
        code: `<section class="section text #class:page.title #class:page.slug">
  <article class="article">
    <h1>{{title}}</h1>
    <p>{{text}}</p>
    <p>Test_ {{page.title}}</p>
  </article>
</section>`
      }
    });
    console.log('✅ Text aktualisiert');

    console.log('\n✅ Alle Templates aktualisiert!');
  } catch (e) {
    console.error('❌ Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
