const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function run() {
  try {
    // Non-destructive import: upsert existing records instead of deleting data
    console.log('Running non-destructive import (upserts where supported)');

    const root = path.join(process.cwd(), 'init');
    if (!fs.existsSync(root)) {
      console.error('init directory not found:', root);
      process.exit(1);
    }

    // Templates
    const templatesPath = path.join(root, 'templates.json');
    if (fs.existsSync(templatesPath)) {
      const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf-8')) || [];
      console.log('Importing templates:', templates.length);
      for (const t of templates) {
        if (!prisma.template) { console.log('  Prisma model `Template` not available — skip'); break; }
        await prisma.template.upsert({ where: { name: t.name }, update: { code: t.code }, create: { name: t.name, code: t.code } });
        console.log('  upserted template:', t.name);
      }
    }

    // Snippets
    const snippetsPath = path.join(root, 'snippets.json');
    if (fs.existsSync(snippetsPath)) {
      const snippets = JSON.parse(fs.readFileSync(snippetsPath, 'utf-8')) || [];
      console.log('Importing snippets:', snippets.length);
      for (const s of snippets) {
        if (!prisma.snippet) { console.log('  Prisma model `Snippet` not available — skip'); break; }
        const key = (s.label || s.label === 0 ? String(s.label) : s.key || s.label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        await prisma.snippet.upsert({ where: { key }, update: { value: s.snippet }, create: { key, value: s.snippet } });
        console.log('  upserted snippet:', key);
      }
    }

    // CSS files (write to public/extern_css) — non-destructive (skip existing files)
    const cssPath = path.join(root, 'css.json');
    const CSS_DIR = path.join(process.cwd(), 'public', 'extern_css');
    if (!fs.existsSync(CSS_DIR)) fs.mkdirSync(CSS_DIR, { recursive: true });
    if (fs.existsSync(cssPath)) {
      const cssList = JSON.parse(fs.readFileSync(cssPath, 'utf-8')) || [];
      console.log('Importing css files:', cssList.length);
      for (const c of cssList) {
        const filePath = path.join(CSS_DIR, c.filename);
        if (fs.existsSync(filePath)) {
          console.log('  skip css (exists):', c.filename);
          continue;
        }
        fs.writeFileSync(filePath, c.content || '', 'utf-8');
        console.log('  wrote css:', c.filename);
      }
    }

    // Navigations (write to data/navigations) — non-destructive (skip existing files)
    const navPath = path.join(root, 'navigations.json');
    const NAV_DIR = path.join(process.cwd(), 'data', 'navigations');
    if (!fs.existsSync(NAV_DIR)) fs.mkdirSync(NAV_DIR, { recursive: true });
    if (fs.existsSync(navPath)) {
      const navs = JSON.parse(fs.readFileSync(navPath, 'utf-8')) || [];
      console.log('Importing navigations:', navs.length);
      for (const n of navs) {
        const filePath = path.join(NAV_DIR, `${n.name}.html`);
        if (fs.existsSync(filePath)) { console.log('  skip nav (exists):', n.name); continue; }
        fs.writeFileSync(filePath, n.code || '', 'utf-8');
        console.log('  wrote nav:', n.name);
      }
    }

    // Content Models
    const cmPath = path.join(root, 'content-models.json');
    if (fs.existsSync(cmPath)) {
      const cms = JSON.parse(fs.readFileSync(cmPath, 'utf-8')) || [];
      console.log('Importing content models:', cms.length);
      if (!prisma.contentType || !prisma.contentField) {
        console.log('  Prisma models for ContentType/ContentField not available — skipping content models import');
      } else {
        for (const cm of cms) {
          const ct = await prisma.contentType.upsert({ where: { slug: cm.slug }, update: { name: cm.name, description: cm.description || '' }, create: { name: cm.name, slug: cm.slug, description: cm.description || '' } });
          console.log('  upserted content-type:', cm.slug);
          if (Array.isArray(cm.fields) && cm.fields.length > 0) {
            for (const f of cm.fields) {
              const existingField = await prisma.contentField.findFirst({ where: { contentTypeId: ct.id, key: f.key } });
              if (existingField) {
                await prisma.contentField.update({ where: { id: existingField.id }, data: { name: f.name, type: f.type, options: f.options || null, required: !!f.required, sortOrder: f.sortOrder || 0 } });
                console.log('    updated field:', f.key);
              } else {
                await prisma.contentField.create({ data: { contentTypeId: ct.id, name: f.name, key: f.key, type: f.type, options: f.options || null, required: !!f.required, sortOrder: f.sortOrder || 0 } });
                console.log('    created field:', f.key);
              }
            }
          }
        }
      }
    }

    // Pages (flatten tree and upsert by slug)
    const pagesPath = path.join(root, 'pages.json');
    if (fs.existsSync(pagesPath)) {
      const pages = JSON.parse(fs.readFileSync(pagesPath, 'utf-8')) || [];
      console.log('Importing pages (flatten):');
      const flat = [];
      const walk = (node) => { flat.push(node); if (Array.isArray(node.children)) node.children.forEach(child => walk(child)); };
      pages.forEach(p => walk(p));
      console.log('  total pages found in tree:', flat.length);
      for (const p of flat) {
        if (!p.slug) { console.log('  skip page (no slug):', p); continue; }
        if (!prisma.page) { console.log('  Prisma model `Page` not available — skip pages import'); break; }
        const up = await prisma.page.upsert({
          where: { slug: String(p.slug) },
          update: {
            title: p.title || undefined,
            blocks: p.blocks || undefined,
            children: p.children || undefined,
            status: p.status || undefined,
            publishAt: p.publishAt ? new Date(p.publishAt) : undefined,
            template: p.template || undefined,
            data: p.data || undefined
          },
          create: {
            slug: String(p.slug),
            title: p.title || '',
            blocks: p.blocks || [],
            children: p.children || [],
            status: p.status || 'DRAFT',
            publishAt: p.publishAt ? new Date(p.publishAt) : null,
            template: p.template || null,
            data: p.data || {}
          }
        });
        console.log('  upserted page:', p.slug);
        try {
          await prisma.pageRevision.create({ data: { pageId: up.id, data: { title: up.title, slug: up.slug, blocks: up.blocks, children: up.children, status: up.status, publishAt: up.publishAt } } });
        } catch (e) { console.error('    revision create failed', e); }
      }
    }

    console.log('Import finished.');
  } catch (e) {
    console.error('Import failed', e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
