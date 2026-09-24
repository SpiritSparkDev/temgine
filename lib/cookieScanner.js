import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';
import { findCatalogServicesForJs, findCatalogServiceForIframe } from './cookieCatalog';

const JS_DIR = path.join(process.cwd(), 'public', 'extern_js');
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

function readJsSources() {
  const sources = [];

  if (fs.existsSync(JS_DIR)) {
    for (const name of fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js'))) {
      sources.push({ id: `extern_js/${name}`, content: fs.readFileSync(path.join(JS_DIR, name), 'utf-8') });
    }
  }

  const walk = (dir, relBase) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryRel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), entryRel);
      } else if (entry.name.toLowerCase().endsWith('.js')) {
        sources.push({ id: `uploads/${entryRel}`, content: fs.readFileSync(path.join(dir, entry.name), 'utf-8') });
      }
    }
  };
  walk(UPLOADS_DIR, '');

  return sources;
}

export function extractIframeSrcs(text) {
  const srcs = [];
  const re = /<iframe[^>]*\ssrc=["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(String(text || '')))) srcs.push(match[1]);
  return srcs;
}

export function matchServicesInSources(jsSources, textSources) {
  const results = new Map();

  const addMatch = (service, { jsFileId, iframeSrc }) => {
    if (!results.has(service.id)) {
      results.set(service.id, { service, matchedJsFiles: new Set(), matchedIframeSources: new Set() });
    }
    const entry = results.get(service.id);
    if (jsFileId) entry.matchedJsFiles.add(jsFileId);
    if (iframeSrc) entry.matchedIframeSources.add(iframeSrc);
  };

  const scanJs = (id, text) => {
    for (const service of findCatalogServicesForJs(text)) addMatch(service, { jsFileId: id });
    for (const src of extractIframeSrcs(text)) {
      const service = findCatalogServiceForIframe(src);
      if (service) addMatch(service, { iframeSrc: src });
    }
  };

  const scanText = (text) => {
    for (const service of findCatalogServicesForJs(text)) addMatch(service, {});
    for (const src of extractIframeSrcs(text)) {
      const service = findCatalogServiceForIframe(src);
      if (service) addMatch(service, { iframeSrc: src });
    }
  };

  (jsSources || []).forEach(({ id, content }) => scanJs(id, content));
  (textSources || []).forEach(({ label, text }) => scanText(text));

  return Array.from(results.values()).map(({ service, matchedJsFiles, matchedIframeSources }) => ({
    service,
    matchedJsFiles: Array.from(matchedJsFiles),
    matchedIframeSources: Array.from(matchedIframeSources),
  }));
}

export async function collectScanSources() {
  const jsSources = readJsSources();

  const pages = await prisma.page.findMany({ select: { slug: true, blocks: true, data: true } });
  const posts = await prisma.blogPost.findMany({ select: { slug: true, body: true, templateData: true } });

  const textSources = [
    ...pages.map((p) => ({ label: `Seite: ${p.slug}`, text: `${JSON.stringify(p.blocks)} ${JSON.stringify(p.data)}` })),
    ...posts.map((p) => ({ label: `Blog: ${p.slug}`, text: `${p.body || ''} ${JSON.stringify(p.templateData || '')}` })),
  ];

  return { jsSources, textSources };
}

export async function scanForServices() {
  const { jsSources, textSources } = await collectScanSources();
  return matchServicesInSources(jsSources, textSources);
}
