// Migrate pages from pages.json to database
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

(async () => {
  try {
    // Load pages.json
    const pagesPath = path.join(__dirname, '../data/pages.json');
    const jsonData = fs.readFileSync(pagesPath, 'utf-8');
    const pages = JSON.parse(jsonData);

    console.log(`Found ${pages.length} pages in pages.json`);

    // Upsert each page
    for (const page of pages) {
      // Skip pages without slug or title
      if (!page.slug && !page.title) {
        console.log(`⊘ Skipped page with no slug/title`);
        continue;
      }
      
      // Generate slug from title if missing
      const slug = page.slug || page.title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
      if (!slug) {
        console.log(`⊘ Skipped page with invalid slug: ${page.title}`);
        continue;
      }

      const created = await prisma.page.upsert({
        where: { slug },
        create: {
          slug,
          title: page.title || 'Untitled',
          blocks: page.blocks || [],
          children: page.children || [],
          template: page.template || null,
          data: page.data || {},
          status: page.status || 'DRAFT',
          publishAt: page.publishAt || null,
          isHomepage: page.isHomepage || (slug === 'startseite' || slug === 'home')
        },
        update: {
          title: page.title || 'Untitled',
          blocks: page.blocks || [],
          children: page.children || [],
          template: page.template,
          data: page.data || {},
          status: page.status,
          publishAt: page.publishAt,
          isHomepage: page.isHomepage || (slug === 'startseite' || slug === 'home')
        }
      });
      console.log(`✓ Upserted ${created.slug} (${created.title}, homepage: ${created.isHomepage})`);
    }

    console.log('✓ All pages migrated to database!');
  } catch (e) {
    console.error('✗ Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
