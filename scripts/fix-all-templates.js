#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    // Update Text Artikel
    await prisma.template.update({
      where: { name: 'Text Artikel' },
      data: {
        code: `<article class="text_article {{snippet:title[Titel]}}">
  <p>{{snippet:text[Text]}}</p>
</article>`
      }
    });
    console.log('✅ Text Artikel aktualisiert');

    // Update Text
    await prisma.template.update({
      where: { name: 'Text' },
      data: {
        code: `<section class="section text {{snippet:pageTitle[Seitentitel]}} {{snippet:pageSlug[Seiten-URL]}}">
  <article class="article">
    <h1>{{snippet:title[Titel]}}</h1>
    <p>{{snippet:text[Text]}}</p>
    <p>Test_ {{snippet:pageTitle[Seitentitel]}}</p>
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
