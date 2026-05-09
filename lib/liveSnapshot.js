import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';
import { renderPage, buildNavHtml } from './templateEngine';

export const LIVE_ROOT_DIR = path.join(process.cwd(), 'public', '__live');

const DEFAULT_404_HTML = '<div style="padding: 40px; text-align: center;"><h1>Seite nicht gefunden</h1></div>';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function toSafeRoutePath(routePath) {
  const parts = String(routePath || '/')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, '-'));
  return parts;
}

function writeRouteHtml(baseDir, routePath, html) {
  const safeParts = toSafeRoutePath(routePath);
  const targetDir = safeParts.length === 0 ? baseDir : path.join(baseDir, ...safeParts);
  ensureDir(targetDir);
  fs.writeFileSync(path.join(targetDir, 'index.html'), String(html || ''), 'utf-8');
}

function normalizePageNode(node) {
  if (!node || typeof node !== 'object') return null;
  const next = { ...node };
  next.children = Array.isArray(node.children)
    ? node.children.map(normalizePageNode).filter(Boolean)
    : [];
  return next;
}

function isPublicPage(node) {
  if (!node || typeof node !== 'object') return false;
  if (!(node.status === 'PUBLISHED' || node.isHomepage === true)) return false;
  const accessGroups = Array.isArray(node.accessGroups) ? node.accessGroups : [];
  if (accessGroups.length > 0) return false;
  return true;
}

function buildPublicTree(nodes) {
  const input = Array.isArray(nodes) ? nodes : [];
  const out = [];
  for (const raw of input) {
    const node = normalizePageNode(raw);
    if (!node) continue;
    node.children = buildPublicTree(node.children || []);
    if (isPublicPage(node)) {
      out.push(node);
    }
  }
  return out;
}

function buildNestedPages(nodes, parentPath = '') {
  return (nodes || [])
    .map((n) => {
      const slug = parentPath ? `${parentPath}/${n.slug}` : String(n.slug || '');
      const children = buildNestedPages(n.children || [], slug);
      return { slug, title: n.title, hasChildren: children.length > 0, children };
    });
}

function collectTemplateNames(blocks, bucket) {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    const tname = block && (block.template || block.type);
    if (tname) bucket.add(String(tname));
    if (block && Array.isArray(block.children)) collectTemplateNames(block.children, bucket);
  }
}

function createRouteEntries(nodes, parentSegments = [], out = []) {
  for (const node of nodes || []) {
    const slug = String(node.slug || '').trim();
    const nextSegments = slug ? [...parentSegments, slug] : [...parentSegments];
    const fullPath = nextSegments.length === 0 ? '/' : `/${nextSegments.join('/')}`;
    out.push({ routePath: fullPath, page: node, segments: nextSegments });
    if (node.isHomepage === true && fullPath !== '/') {
      out.push({ routePath: '/', page: node, segments: [] });
    }
    createRouteEntries(node.children || [], nextSegments, out);
  }
  return out;
}

async function loadMaintenance404Html() {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'maintenance_404_html' } });
    if (!setting || !setting.value) return DEFAULT_404_HTML;
    return String(setting.value);
  } catch (_e) {
    return DEFAULT_404_HTML;
  }
}

function writeMeta(baseDir, meta) {
  fs.writeFileSync(path.join(baseDir, '__meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
}

function buildNavigationsForPage(page, allPagesTree, activeNavigations, allNavigationsById, currentPath) {
  const nestedPages = buildNestedPages(allPagesTree);
  const anchors = Array.isArray(page?.data?.anchors) ? page.data.anchors : [];
  const navigations = {};

  for (const nav of activeNavigations) {
    const key = String(nav.type || '').toLowerCase();
    const data = key === 'page' ? { anchors } : { pages: nestedPages };
    navigations[key] = { code: nav.code, data };
  }

  if (page?.data?.pageNav && allNavigationsById[page.data.pageNav]?.code) {
    navigations.main = {
      code: allNavigationsById[page.data.pageNav].code,
      data: { pages: nestedPages }
    };
  }

  navigations.auto = {
    code: buildNavHtml(allPagesTree, currentPath),
    data: {}
  };

  return navigations;
}

export async function renderLiveSnapshot() {
  const startedAt = Date.now();
  console.log('[liveSnapshot] start', {
    liveRootDir: LIVE_ROOT_DIR,
    cwd: process.cwd(),
  });

  const rawPages = await prisma.page.findMany({
    where: {
      OR: [
        { status: 'PUBLISHED' },
        { isHomepage: true }
      ]
    }
  });

  rawPages.sort((a, b) => {
    const ao = (a.data && typeof a.data._order === 'number') ? a.data._order : 99999;
    const bo = (b.data && typeof b.data._order === 'number') ? b.data._order : 99999;
    return ao !== bo ? ao - bo : (a.createdAt < b.createdAt ? -1 : 1);
  });

  const pages = buildPublicTree(rawPages);
  console.log('[liveSnapshot] pages loaded', {
    rawCount: rawPages.length,
    publicCount: pages.length,
  });

  const allTemplates = await prisma.template.findMany({
    select: { name: true, code: true }
  });
  const templateMap = {};
  for (const t of allTemplates) {
    if (!t?.name) continue;
    templateMap[String(t.name)] = String(t.code || '');
  }

  const allNavigations = await prisma.navigation.findMany({
    select: { id: true, name: true, type: true, code: true, isActive: true }
  });
  const activeNavigations = allNavigations.filter((n) => n.isActive === true);
  console.log('[liveSnapshot] templates/navigations loaded', {
    templateCount: allTemplates.length,
    navigationCount: allNavigations.length,
    activeNavigationCount: activeNavigations.length,
  });
  const allNavigationsById = {};
  for (const nav of allNavigations) {
    allNavigationsById[nav.id] = nav;
  }

  const routeEntries = createRouteEntries(pages)
    .filter((entry, index, arr) => arr.findIndex((x) => x.routePath === entry.routePath) === index);

  const tempDir = `${LIVE_ROOT_DIR}.tmp-${Date.now()}`;
  ensureDir(tempDir);
  console.log('[liveSnapshot] temp dir prepared', { tempDir });

  let renderedRoutes = 0;
  const errors = [];

  for (const entry of routeEntries) {
    try {
      console.log('[liveSnapshot] rendering route', {
        routePath: entry.routePath,
        pageId: entry.page?.id || null,
        slug: entry.page?.slug || null,
      });
      const names = new Set();
      collectTemplateNames(entry.page.blocks, names);
      if (entry.page.template) names.add(String(entry.page.template));

      const blockTemplates = {};
      for (const name of names) {
        if (templateMap[name] !== undefined) {
          blockTemplates[name] = templateMap[name];
        }
      }

      const currentPath = entry.segments.join('/');
      const navigations = buildNavigationsForPage(entry.page, pages, activeNavigations, allNavigationsById, currentPath);
      const html = renderPage(entry.page, blockTemplates, { isChild: entry.segments.length > 1 }, navigations);
      console.log('[liveSnapshot] rendered html summary', {
        routePath: entry.routePath,
        htmlLength: String(html || '').length,
        containsLoadingText: String(html || '').includes('Lädt'),
        containsLoadingDots: String(html || '').includes('Lade Admin-Daten'),
        preview: String(html || '').slice(0, 220),
      });
      writeRouteHtml(tempDir, entry.routePath, html);
      renderedRoutes += 1;
    } catch (e) {
      console.error('[liveSnapshot] render route failed', {
        routePath: entry.routePath,
        error: e?.message || 'Render fehlgeschlagen',
      });
      errors.push({ route: entry.routePath, error: e?.message || 'Render fehlgeschlagen' });
    }
  }

  const maintenance404Html = await loadMaintenance404Html();
  fs.writeFileSync(path.join(tempDir, '404.html'), maintenance404Html, 'utf-8');

  const meta = {
    renderedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    renderedRoutes,
    totalRoutes: routeEntries.length,
    errors
  };
  writeMeta(tempDir, meta);
  console.log('[liveSnapshot] meta written', meta);

  if (fs.existsSync(LIVE_ROOT_DIR)) {
    console.log('[liveSnapshot] removing old live dir', { liveRootDir: LIVE_ROOT_DIR });
    fs.rmSync(LIVE_ROOT_DIR, { recursive: true, force: true });
  }
  fs.renameSync(tempDir, LIVE_ROOT_DIR);
  console.log('[liveSnapshot] publish complete', {
    liveRootDir: LIVE_ROOT_DIR,
    renderedRoutes,
    totalRoutes: routeEntries.length,
  });

  return meta;
}
