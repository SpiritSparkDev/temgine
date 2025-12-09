import { prisma } from '../lib/prisma.js';

async function updateTemplates() {
  try {
    // Update NurText template
    const nurText = await prisma.template.upsert({
      where: { name: 'NurText' },
      create: {
        name: 'NurText',
        type: 'BLOCK',
        code: `<section class="page">
  <header>
    <h2>{{snippet:title[Titel]}}</h2>
  </header>
  {{snippet:text[Inhalt]}}
  <footer>Footer</footer>
</section>`
      },
      update: {
        code: `<section class="page">
  <header>
    <h2>{{snippet:title[Titel]}}</h2>
  </header>
  {{snippet:text[Inhalt]}}
  <footer>Footer</footer>
</section>`
      }
    });
    
    console.log('✅ Template NurText aktualisiert');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Fehler beim Update:', error.message);
    process.exit(1);
  }
}

updateTemplates();
