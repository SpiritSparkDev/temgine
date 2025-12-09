#!/usr/bin/env node

/**
 * Deployment Script - Template Sync
 * 
 * Dieses Script aktualisiert alle Templates in der Datenbank
 * mit der korrekten {{snippet:fieldname[Label]}} Syntax
 * 
 * Ausführen mit: node scripts/deploy-templates.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const templates = {
  'NurText': {
    type: 'BLOCK',
    code: `<section class="page">
  <header>
    <h2>{{snippet:title[Titel]}}</h2>
  </header>
  {{snippet:text[Inhalt]}}
  <footer>Footer</footer>
</section>`
  },
  'Text Artikel': {
    type: 'BLOCK',
    code: `<article class="text_article {{snippet:title[Titel]}}">
  <p>{{snippet:text[Text]}}</p>
</article>`
  },
  'Text': {
    type: 'BLOCK',
    code: `<section class="section text {{snippet:pageTitle[Seitentitel]}} {{snippet:pageSlug[Seiten-URL]}}">
  <article class="article">
    <h1>{{snippet:title[Titel]}}</h1>
    <p>{{snippet:text[Text]}}</p>
    <p>Test_ {{snippet:pageTitle[Seitentitel]}}</p>
  </article>
</section>`
  }
};

async function deployTemplates() {
  console.log('🚀 Starting template deployment...\n');
  
  try {
    for (const [name, data] of Object.entries(templates)) {
      const result = await prisma.template.upsert({
        where: { name },
        update: { code: data.code, type: data.type },
        create: { name, code: data.code, type: data.type }
      });
      console.log(`✅ ${name} (${data.type})`);
    }
    
    console.log('\n✅ Deployment erfolgreich abgeschlossen!');
    console.log(`📊 ${Object.keys(templates).length} Templates aktualisiert`);
    
  } catch (error) {
    console.error('❌ Deployment fehlgeschlagen:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deployTemplates();
