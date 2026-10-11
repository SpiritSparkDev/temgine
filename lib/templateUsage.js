import { prisma } from './prisma';

function collectBlockTemplateNames(blocks, bucket) {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    const tname = block && (block.template || block.type);
    if (tname) bucket.add(String(tname));
    if (block && Array.isArray(block.children)) collectBlockTemplateNames(block.children, bucket);
  }
}

// Alle Template-Namen, die aktuell irgendwo referenziert werden — über alle
// Seiten (unabhängig vom Status, ein Entwurf "verwendet" sein Template genauso)
// und alle Blog-Kanäle. Grundlage für die "nicht verwendet"-Markierung im
// Template-Manager.
export async function getUsedTemplateNames() {
  const used = new Set();

  const pages = await prisma.page.findMany({ select: { template: true, blocks: true } });
  for (const page of pages) {
    if (page.template) used.add(String(page.template));
    collectBlockTemplateNames(page.blocks, used);
  }

  const channels = await prisma.blogChannel.findMany({
    select: {
      templateDetailPreview: true,
      templateSimplePreview: true,
      templateArchiveEntry: true,
      templateReading: true,
    },
  });
  for (const ch of channels) {
    if (ch.templateDetailPreview) used.add(String(ch.templateDetailPreview));
    if (ch.templateSimplePreview) used.add(String(ch.templateSimplePreview));
    if (ch.templateArchiveEntry) used.add(String(ch.templateArchiveEntry));
    if (ch.templateReading) used.add(String(ch.templateReading));
  }

  return used;
}
