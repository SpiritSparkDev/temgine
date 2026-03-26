#!/usr/bin/env node

/**
 * Deployment Script - Template Sync
 * 
 * Dieses Script aktualisiert alle Templates in der Datenbank
 * auf direkte Feldsyntax und stabile Snippet-Referenzen.
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
    <h2>{{title}}</h2>
  </header>
  {{text}}
  <footer>Footer</footer>
</section>`
  },
  'Text Artikel': {
    type: 'BLOCK',
    code: `<article class="text_article #class:title">
  <p>{{text}}</p>
</article>`
  },
  'Text': {
    type: 'BLOCK',
    code: `<section class="section text #class:page.title #class:page.slug">
  <article class="article">
    <h1>{{title}}</h1>
    <p>{{text}}</p>
    <p>Test_ {{page.title}}</p>
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
