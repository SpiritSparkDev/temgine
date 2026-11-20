import { MAX_CODE, sha256 } from '../common';

// WP-B4: "In Seite ansehen". Nur lesend, es wird nichts gespeichert. Die Seite wird so gebaut wie Temgines statische Auslieferung
// (lib/liveSnapshot.js in Temgine): Seitenbaum, Navigationen, Footer, Widgets, globale Variablen, Section-Daten, dann renderPage().
// Kernschnittstelle (server.js): core.pages { tree(), navigations(), footers(), widgets(), globalVars(), loadSections(keys),
// renderPage, buildNavHtml, collectSectionKeys }; Template-Code der Seitenblöcke kommt aus core.store.
export const features = ['page-preview'];

export const PREVIEW_TEMPLATE = '__designer_preview__';
const SPECIAL_TYPES = ['blog-channel', 'global-page', 'navigation'];
const ALWAYS_PROVIDED = ['inner', 'data', 'page', 'global', 'widget', 'title', 'id']; // von renderPage selbst gesetzt bzw. abgeleitet
const BUILTIN_NAVS = ['nav:main', 'nav:page', 'nav:mobile', 'nav:auto'];

// Reihenfolge wie Temgines Snapshot: data._order, dann Anlagezeit
const sortRows = (rows) => [...rows].sort((a, b) => {
  const ao = typeof a.data?._order === 'number' ? a.data._order : 99999;
  const bo = typeof b.data?._order === 'number' ? b.data._order : 99999;
  return ao !== bo ? ao - bo : (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
});
const kids = (n) => (Array.isArray(n.children) ? n.children : []);
const restricted = (n) => (Array.isArray(n.accessGroups) && n.accessGroups.length > 0) || !!n.accessPasswordHash;
const isPublic = (n) => (n.status === 'PUBLISHED' || n.isHomepage === true) && !restricted(n);
const publicTree = (nodes) => (nodes || []).filter(Boolean).map((n) => ({ ...n, children: publicTree(kids(n)) })).filter(isPublic);

// Alle Seiten (auch Entwürfe) mit Pfad, in Baumreihenfolge
function flatten(nodes, parent = [], out = []) {
  for (const node of nodes || []) {
    if (!node) continue;
    const segments = [...parent, String(node.slug || '').trim()].filter(Boolean);
    out.push({ node, segments, path: segments.join('/'), depth: parent.length });
    flatten(kids(node), segments, out);
  }
  return out;
}

// wie lib/liveSnapshot.js buildNestedPages
const nested = (nodes, currentPath, parentPath = '') => (nodes || []).map((n) => {
  const slug = parentPath ? `${parentPath}/${n.slug}` : String(n.slug || '');
  const children = nested(kids(n), currentPath, slug);
  return { id: n.id, slug, title: n.title, hasChildren: children.length > 0, children, isCurrent: slug === currentPath, data: n.data || {} };
});
const findById = (nodes, id, parentPath = '') => {
  if (!id) return null;
  for (const n of nodes || []) {
    const full = parentPath ? `${parentPath}/${n.slug}` : String(n.slug || '');
    if (n.id === id) return { node: n, parentPath: full };
    const f = findById(kids(n), id, full);
    if (f) return f;
  }
  return null;
};

const blockTemplateNames = (blocks, bucket = new Set()) => {
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b) continue;
    const t = b.template || b.type;
    if (t && !SPECIAL_TYPES.includes(b.type)) bucket.add(String(t));
    blockTemplateNames(b.children, bucket);
  }
  return bucket;
};

export const routes = ({ core, authed, varNames }) => {
  const resolve = (rows, param) => {
    let dec = String(param || '');
    try { dec = decodeURIComponent(dec); } catch (_e) { /* roh lassen */ }
    const want = dec.replace(/^\/+|\/+$/g, '');
    const all = flatten(rows);
    return (want && all.find((e) => e.path === want)) || all.find((e) => e.node.id === param) || (!want && all.find((e) => e.node.isHomepage)) || null;
  };

  return {
    'GET v1/pages': authed('view', async (req, res, ctx) => {
      let rows;
      try { rows = sortRows(await core.pages.tree()); } catch (_e) { return ctx.fail(500, 'Seiten nicht lesbar', 'PAGES_FAILED'); }
      const pages = flatten(rows).map((e) => ({
        key: e.path, id: e.node.id || null, slug: e.node.slug, path: e.path, title: e.node.title || e.node.slug,
        status: e.node.status || null, isHomepage: e.node.isHomepage === true, depth: e.depth, restricted: restricted(e.node),
      }));
      return res.status(200).json({ pages });
    }),

    // Body { code, position: 'end' | 'start' | 'replace' | Index, props }. 'replace' = nur das Template als Seiteninhalt (Navigation und Footer bleiben).
    'POST v1/pages/:slug/preview': authed('view', async (req, res, ctx) => {
      const { code, props = {}, position = 'end' } = req.body || {};
      if (typeof code !== 'string' || code.length > MAX_CODE) return ctx.fail(400, 'Code fehlt oder zu groß', 'VALIDATION_ERROR', { path: 'code' });
      if (!props || typeof props !== 'object' || Array.isArray(props)) return ctx.fail(400, 'props muss ein Objekt sein', 'VALIDATION_ERROR', { path: 'props' });
      if (!['end', 'start', 'replace'].includes(position) && !(Number.isInteger(position) && position >= 0)) return ctx.fail(400, "position: 'end', 'start', 'replace' oder ein Index ab 0", 'VALIDATION_ERROR', { path: 'position' });

      const rows = sortRows(await core.pages.tree());
      const hit = resolve(rows, ctx.params.slug);
      if (!hit) return ctx.fail(404, 'Seite nicht gefunden', 'PAGE_NOT_FOUND');
      const warnings = [];
      const { node } = hit;
      const home = node.isHomepage === true;
      const segments = home ? [] : hit.segments;
      const currentPath = segments.join('/');
      const tree = publicTree(rows);

      // Block einsetzen (Seiten mit Zugriffsschutz: eigene Blöcke werden nicht gezeigt)
      let own = Array.isArray(node.blocks) ? node.blocks : [];
      if (restricted(node)) { own = []; warnings.push('Die Seite ist zugriffsgeschützt: ihre eigenen Blöcke werden in der Vorschau nicht gezeigt.'); }
      const mine = { type: PREVIEW_TEMPLATE, template: PREVIEW_TEMPLATE, props };
      const index = position === 'replace' ? 0 : position === 'start' ? 0 : position === 'end' ? own.length : Math.min(position, own.length);
      const blocks = position === 'replace' ? [mine] : [...own.slice(0, index), mine, ...own.slice(index)];

      // Templates der Seitenblöcke
      const blockTemplates = { [PREVIEW_TEMPLATE]: code };
      for (const name of blockTemplateNames(own)) {
        const t = core.store.getTemplateByName(name);
        if (t && typeof t.code === 'string') blockTemplates[name] = t.code;
        else if (!own.some((b) => b && (b.template || b.type) === name && !b.template && typeof b.props?.html === 'string')) warnings.push(`Template '${name}' eines Seitenblocks fehlt in Temgine.`);
      }

      // Navigationen, Footer, Widgets, globale Variablen wie lib/liveSnapshot.js
      const [allNavs, allFooters, widgetRows, globalVars] = await Promise.all([core.pages.navigations(), core.pages.footers(), core.pages.widgets(), core.pages.globalVars()]);
      const navData = (() => {
        const anchors = Array.isArray(node.data?.anchors) ? node.data.anchors : [];
        const customAnchors = Array.isArray(node.data?.customAnchors) ? node.data.customAnchors : [];
        const raw = findById(tree, node.id);
        return { pages: nested(tree, currentPath), anchors, customAnchors, childPages: raw ? nested(kids(raw.node), currentPath, raw.parentPath) : [] };
      })();
      const navigations = { byId: {} };
      for (const n of allNavs.filter((x) => x.isActive === true)) navigations[String(n.type || '').toLowerCase()] = { code: n.code, data: navData };
      const pageNav = node.data?.pageNav && allNavs.find((n) => n.id === node.data.pageNav);
      if (pageNav?.code) navigations.page = { code: pageNav.code, data: navData };
      navigations.auto = { code: core.pages.buildNavHtml(tree, currentPath), data: {} };
      for (const n of allNavs) navigations.byId[n.id] = { name: n.name, code: n.code, data: navData };
      const activeFooter = allFooters.find((f) => f.isActive === true);
      const pageFooter = node.data?.pageFooter && allFooters.find((f) => f.id === node.data.pageFooter);
      const footer = pageFooter?.code ? { code: pageFooter.code, data: {} } : activeFooter ? { code: activeFooter.code, data: {} } : null;
      const globalPages = { byId: Object.fromEntries(widgetRows.map((w) => [w.id, { code: w.code, name: w.name }])) };

      let sectionData = {};
      try { sectionData = await core.pages.loadSections(core.pages.collectSectionKeys(blocks, blockTemplates)); } catch (_e) { warnings.push('Section-Daten konnten nicht geladen werden.'); }

      // Hinweise zu Platzhaltern des Templates
      try {
        const [ctxWidgets, ctxNavs] = await Promise.all([core.context.widgets(), core.context.navigations()]);
        const widgets = new Set(ctxWidgets.map((w) => w.slug));
        const navKeys = new Set([...BUILTIN_NAVS, ...ctxNavs.map((n) => n.key).filter(Boolean)]);
        // global.*, widget.*, nav:* nimmt Temgines Variablenliste (varNames) nicht auf: direkt im Code suchen
        for (const m of String(code).matchAll(/\{\{\{?\s*(global\.[\w.-]+|widget\.[\w.-]+|nav:[\w-]+)/g)) {
          const n = m[1];
          if (n.startsWith('global.')) { if (!(n.slice(7) in globalVars)) warnings.push(`Globale Variable '${n.slice(7)}' existiert nicht oder ist nicht aktiv.`); }
          else if (n.startsWith('widget.')) { if (!widgets.has(n.slice(7))) warnings.push(`Widget '${n.slice(7)}' existiert nicht.`); }
          else if (!navKeys.has(n)) warnings.push(`Navigation '${n}' ist in Temgine nicht definiert.`);
        }
        for (const n of varNames(code)) {
          if (!n.includes('.') && !n.includes(':') && !ALWAYS_PROVIDED.includes(n) && props[n] === undefined) warnings.push(`Variable '${n}' hat keinen Wert`);
        }
      } catch (_e) { /* Hinweise sind optional */ }

      let html = '';
      try {
        html = core.pages.renderPage({ ...node, blocks }, blockTemplates, { isChild: segments.length > 1, basePath: home ? '/' : `/${currentPath}`, query: {}, navigations, footer, globalVars, globalPages, sectionData });
      } catch (e) { warnings.push(`Die Seite konnte nicht gerendert werden: ${e.message}`); }
      if (/class="missing-block"/.test(html)) warnings.push('Ein Block der Seite oder das Template wurde von Temgine als fehlend gemeldet (Missing template).');

      let css = [];
      try { css = core.siteCss.list().filter((f) => f.enabled !== false).map((f) => ({ id: f.id, filename: f.filename, href: f.href, hash: typeof f.content === 'string' ? sha256(f.content) : null })); } catch (_e) { /* ohne Seiten-CSS-Liste */ }
      return res.status(200).json({ html, css, warnings: [...new Set(warnings)], page: { id: node.id || null, title: node.title, slug: node.slug, path: hit.path }, index: position === 'replace' ? 0 : index });
    }, { readOnlyOk: true }),
  };
};
