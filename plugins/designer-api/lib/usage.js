// Wo wird ein Template in Temgine verwendet? Dieselbe Zuordnung wie Temgines lib/templateUsage.js (getUsedTemplateNames),
// nur mit Titel/Slug/Kanalname statt bloßer Namen. Keine Temgine-Importe: server.js liefert die Datensätze.
const CHANNEL_FIELDS = { templateDetailPreview: 'detailPreview', templateSimplePreview: 'simplePreview', templateArchiveEntry: 'archiveEntry', templateReading: 'reading' };

// Seite nutzt das Template als Seiten-Template oder in einem (auch verschachtelten) Block
function pageVia(page, name) {
  if (page.template && String(page.template) === name) return 'template';
  const walk = (blocks) => Array.isArray(blocks) && blocks.some((b) => b && (String(b.template || b.type || '') === name || walk(b.children)));
  return walk(page.blocks) ? 'block' : null;
}

// pages: [{ id, slug, title, template, blocks }], channels: [{ id, slug, name, templateDetailPreview, … }]
export function findUsage(pages, channels, name) {
  const outPages = [];
  for (const p of pages) {
    const via = pageVia(p, name);
    if (via) outPages.push({ id: p.id, title: p.title, slug: p.slug, via });
  }
  const outChannels = [];
  for (const c of channels) {
    const roles = Object.entries(CHANNEL_FIELDS).filter(([f]) => c[f] && String(c[f]) === name).map(([, r]) => r);
    if (roles.length) outChannels.push({ id: c.id, name: c.name, slug: c.slug, roles });
  }
  return { name, count: outPages.length + outChannels.length, pages: outPages, channels: outChannels };
}
