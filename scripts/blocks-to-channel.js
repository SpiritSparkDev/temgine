#!/usr/bin/env node
// Wandelt Download-Blöcke einer Seite in Beiträge eines Blog-/News-Kanals um
// (z. B. die Newsletter-Liste unter /mitgliederbereich/newsletter) und ersetzt
// sie auf der Seite durch einen Kanal-Block. Ohne --apply nur Probelauf.
//
// Aufruf (im App-Container, Pfade relativ zum Projekt):
//   node scripts/blocks-to-channel.js --page=mitgliederbereich/newsletter --channel=newsletter \
//     --channel-name=Newsletter --master=Newsletter --list-template="Newsletter Listeneintrag" \
//     --include-text-links --replace            # Probelauf: zeigt, was passieren würde
//   … dieselben Optionen plus --apply           # schreibt in die Datenbank
//
// Optionen:
//   --page=<pfad>             Seite (Slug-Pfad wie in der Seitenübersicht), Pflicht
//   --channel=<slug>          Kanal-Slug, Pflicht; wird angelegt, falls er fehlt
//   --channel-name=<name>     Name für einen neu angelegten Kanal (Standard: Slug)
//   --master=<template>       Master-Template eines neu angelegten Kanals
//   --list-template=<name>    Darstellung im Kanal-Block (Standard: Master des Kanals)
//   --block-template=<name>   Template der umzuwandelnden Blöcke (Standard: Download)
//   --title-field / --file-field  Felder dieser Blöcke (Standard: Beschriftung / Datei)
//   --date-field=<name>       Template-Feld für das Datum im Beitrag (Standard: Datum)
//   --include-text-links      auch Text-Blöcke umwandeln, die nur aus einem Link bestehen
//   --replace                 umgewandelte Blöcke auf der Seite durch einen Kanal-Block ersetzen
//   --apply                   wirklich schreiben (sonst Probelauf)
//
// Titel: Beschriftung ohne Datum in Klammern („4. Newsletter (26.05.2026)“ →
// „4. Newsletter“); das Datum kommt ins Datumsfeld und bestimmt Sortierung und
// Veröffentlichungsdatum. Der Slug enthält das Datum und ist damit eindeutig.
// Erneutes Ausführen legt keine Beiträge doppelt an (Abgleich per Slug).
// Vor dem Ändern der Seite wird eine Revision gesichert.

const { PrismaClient } = require('@prisma/client');

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

const DATE_IN_LABEL = /\(\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*\)/;

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Markdown-Escapes (\.) und Fettschrift entfernen
function cleanLabel(s) {
  return String(s || '').replace(/\\(.)/g, '$1').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
}

// Liefert { label, file } oder null für einen umwandelbaren Block.
function entryFromBlock(block, opts) {
  if (!block || typeof block !== 'object') return null;
  const props = block.props || {};
  if ((block.template || block.type) === opts.blockTemplate) {
    const file = String(props[opts.fileField] || '').trim();
    const label = cleanLabel(props[opts.titleField]);
    return file && label ? { label, file } : null;
  }
  if (opts.includeTextLinks && (block.template || block.type) === 'Text') {
    const text = Object.values(props).find(v => typeof v === 'string' && v.includes('](')) || '';
    const stripped = cleanLabel(text);
    const links = [...stripped.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)];
    if (links.length !== 1) return null;
    // „4[. Newsletter (06.06.2023)](url)“ → „4. Newsletter (06.06.2023)“
    const label = cleanLabel(stripped.replace(links[0][0], links[0][1]));
    // Nur reine Link-Zeilen, kein Fließtext mit Link darin
    if (label.length > 120 || /\n/.test(label)) return null;
    return { label, file: links[0][2] };
  }
  return null;
}

function toPost(entry, opts) {
  const m = DATE_IN_LABEL.exec(entry.label);
  const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  const title = cleanLabel(entry.label.replace(DATE_IN_LABEL, '')) || entry.label;
  return {
    title,
    slug: slugify(iso ? `${title} ${iso}` : title),
    date: iso,
    templateData: { [opts.dateField]: iso || '', [opts.fileField]: entry.file },
  };
}

function findNodeByPath(rows, segments) {
  let level = rows;
  let node = null;
  let top = null;
  for (let i = 0; i < segments.length; i++) {
    node = (level || []).find(n => n && n.slug === segments[i]) || null;
    if (!node) return null;
    if (i === 0) top = node;
    level = node.children || [];
  }
  return { node, top };
}

// Sucht die Geschwister-Liste mit den meisten umwandelbaren Blöcken
// (bei der Newsletter-Seite: die Kinder des Seitenrahmens).
function findBlockList(blocks, opts) {
  let best = null;
  const visit = (list) => {
    if (!Array.isArray(list)) return;
    const count = list.filter(b => entryFromBlock(b, opts)).length;
    if (count > 0 && (!best || count > best.count)) best = { list, count };
    for (const b of list) visit(b && b.children);
  };
  visit(blocks);
  return best ? best.list : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const opts = {
    page: args.page,
    channel: args.channel,
    channelName: args['channel-name'] || args.channel,
    master: args.master || null,
    listTemplate: args['list-template'] || '',
    blockTemplate: args['block-template'] || 'Download',
    titleField: args['title-field'] || 'Beschriftung',
    fileField: args['file-field'] || 'Datei',
    dateField: args['date-field'] || 'Datum',
    includeTextLinks: Boolean(args['include-text-links']),
    replace: Boolean(args.replace),
    apply: Boolean(args.apply),
  };
  if (!opts.page || !opts.channel) {
    console.error('Bitte --page=<pfad> und --channel=<slug> angeben (siehe Kopf der Datei).');
    process.exit(1);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(opts.channel)) {
    console.error('Kanal-Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.page.findMany();
    const hit = findNodeByPath(rows, String(opts.page).split('/').filter(Boolean));
    if (!hit) throw new Error(`Seite „${opts.page}“ nicht gefunden.`);
    const list = findBlockList(hit.node.blocks || [], opts);
    if (!list) throw new Error(`Keine umwandelbaren Blöcke (Template „${opts.blockTemplate}“) auf „${opts.page}“ gefunden — wurde die Seite schon umgewandelt? Dann ist nichts zu tun.`);

    const entries = list.map(b => entryFromBlock(b, opts));
    const posts = entries.filter(Boolean).map(e => toPost(e, opts));
    const undated = posts.filter(p => !p.date);
    const slugs = new Set();
    for (const p of posts) {
      let s = p.slug; let n = 2;
      while (slugs.has(s)) s = `${p.slug}-${n++}`;
      p.slug = s; slugs.add(s);
    }

    let channel = await prisma.blogChannel.findUnique({ where: { slug: opts.channel } });
    const existing = channel
      ? new Set((await prisma.blogPost.findMany({ where: { channelId: channel.id }, select: { slug: true } })).map(p => p.slug))
      : new Set();
    const toCreate = posts.filter(p => !existing.has(p.slug));

    console.log(`${opts.apply ? 'AUSFÜHRUNG' : 'PROBELAUF (nichts wird geschrieben, mit --apply ausführen)'}`);
    console.log(`Seite: /${opts.page} — ${posts.length} umwandelbare Blöcke, ${list.length - posts.length} andere Blöcke bleiben erhalten`);
    console.log(`Kanal: ${channel ? `„${channel.name}“ (/${channel.slug}) vorhanden` : `wird angelegt: „${opts.channelName}“ (/${opts.channel}), Master-Template ${opts.master || '–'}, Sortierung ${opts.dateField} absteigend`}`);
    console.log(`Beiträge: ${toCreate.length} neu, ${posts.length - toCreate.length} schon vorhanden`);
    for (const p of posts) {
      console.log(`  ${existing.has(p.slug) ? '=' : '+'} ${p.date || '????-??-??'}  ${p.title.padEnd(28)} ${p.templateData[opts.fileField]}`);
    }
    if (undated.length) console.log(`WARNUNG: ${undated.length} Einträge ohne Datum in der Beschriftung — Datum bitte danach im Backend nachtragen.`);
    if (opts.replace) {
      console.log(`Seite: die ${posts.length} Blöcke werden durch einen Kanal-Block ersetzt (Darstellung: ${opts.listTemplate || 'Master des Kanals'}, sortiert nach ${opts.dateField} absteigend).`);
    }
    if (!opts.apply) return;

    if (!channel) {
      channel = await prisma.blogChannel.create({
        data: {
          name: opts.channelName,
          slug: opts.channel,
          templateReading: opts.master, templateDetailPreview: opts.master, templateSimplePreview: opts.master, templateArchiveEntry: opts.master,
          sortField: opts.dateField, sortDir: 'desc',
        },
      });
    }
    for (const p of toCreate) {
      await prisma.blogPost.create({
        data: {
          channelId: channel.id,
          title: p.title,
          slug: p.slug,
          status: 'PUBLISHED',
          publishedAt: p.date ? new Date(`${p.date}T12:00:00Z`) : new Date(),
          templateData: p.templateData,
        },
      });
    }

    if (opts.replace) {
      const top = rows.find(r => r.id === hit.top.id);
      await prisma.pageRevision.create({
        data: {
          pageId: top.id,
          data: { title: top.title, slug: top.slug, blocks: top.blocks, children: top.children, template: top.template, status: top.status, publishAt: top.publishAt, data: top.data },
          note: `Backup vor blocks-to-channel (${opts.page} → Kanal ${opts.channel})`,
          createdBy: 'Skript blocks-to-channel',
        },
      });
      const channelBlock = {
        type: 'blog-channel',
        template: '',
        props: {
          channelSlug: opts.channel, templateSlot: 'templateDetailPreview', templateName: opts.listTemplate,
          postLimit: 100, sortField: opts.dateField, sortDir: 'desc',
        },
        children: [],
      };
      const firstIdx = entries.findIndex(Boolean);
      const newList = [];
      list.forEach((b, i) => {
        if (i === firstIdx) newList.push(channelBlock);
        if (!entries[i]) newList.push(b);
      });
      list.splice(0, list.length, ...newList); // list gehört zu hit.node (Objekt aus rows)
      // Stempel wie beim Speichern im Editor: ein offener Editor dieser Seite
      // erkennt die Änderung und überschreibt sie nicht (lib/pageConcurrency.js).
      hit.node.data = { ...(hit.node.data || {}), _savedAt: new Date().toISOString(), _savedBy: 'Skript blocks-to-channel' };
      const data = hit.node === top ? { blocks: top.blocks, data: top.data } : { children: top.children };
      await prisma.page.update({ where: { id: top.id }, data });
    }
    console.log(`Fertig: ${toCreate.length} Beiträge angelegt${opts.replace ? ', Seite umgestellt' : ''}.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}

module.exports = { entryFromBlock, toPost, cleanLabel, slugify, findBlockList };
