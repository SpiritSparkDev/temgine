// Server-Hooks des Plugins "designer-api". Dieses Plugin läuft innerhalb von Temgine (nach `npm run plugins:sync`),
// deshalb sind relative Importe in den Kern (../../lib/…) hier erlaubt. Die Logik steht in lib/api.js (ohne Kernimporte, testbar).
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { createRoutes } from './lib/api';
import { findUsage } from './lib/usage';
import manifest from './plugin.json';
import { PERMISSIONS } from '../../lib/auth';
import { listTemplates, getTemplateByName, saveTemplate, deleteTemplateByName } from '../../lib/templateStore';
import { validatePreviewSubset } from '../../lib/blogTemplateWorkflow';
import { getUsedTemplateNames } from '../../lib/templateUsage';
import { extractTemplateVariables, extractTypedVariables } from '../../lib/templateParser';
import { renderTemplate, renderPage, buildNavHtml, collectSectionKeys, buildNavPlaceholderKeys, buildWidgetPlaceholderKeys } from '../../lib/templateEngine';
import { resolveGlobalValue, buildGlobalContext } from '../../lib/globalVariables';
import { listNavigations } from '../../lib/navigationStore';
import { listFooters } from '../../lib/footerStore';
import { loadSectionDataServer } from '../../lib/sections/server';
import { listGlobalPages } from '../../lib/globalPageStore';
import { loadExternFiles, importExternFiles, normalizeExternFilename } from '../../lib/externFiles';
import { listFolderItemsRecursive, resolveSafeDir, UPLOAD_DIR } from '../../lib/uploadFolder';
import { MAX_FILE_SIZE, invalidateFileCache } from '../../lib/fileListing';
import { getSectionProviders } from '../../lib/sections';
import { logAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';

// Zustand (Kopplungscodes, Token-Register, Schalter) in der vorhandenen Tabelle Setting (Schlüssel aus plugin.json).
// cas = atomarer Vergleich-und-Tausch: updateMany mit altem Wert (bzw. create bei erstem Schreiben, Unique-Konflikt = verloren).
const state = {
  get: async (key) => (await prisma.setting.findUnique({ where: { key } }))?.value ?? null,
  cas: async (key, expected, next) => {
    if (expected === null) {
      try { await prisma.setting.create({ data: { key, value: next } }); return true; } catch (e) { if (e.code === 'P2002') return false; throw e; }
    }
    return (await prisma.setting.updateMany({ where: { key, value: expected }, data: { value: next } })).count === 1;
  },
  set: (key, value) => prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } }),
};

const cssDir = () => path.join(process.cwd(), 'public', 'extern_css');
const dataFile = (name) => path.join(process.cwd(), 'data', name);
// Von Temgines Managern abgeschaltete Einträge (data/css-config.json, data/fonts-config.json: { disabled: [id, …] })
const readDisabled = (name) => { try { const d = JSON.parse(fs.readFileSync(dataFile(name), 'utf8')); return new Set(Array.isArray(d.disabled) ? d.disabled : []); } catch (_e) { return new Set(); } };
// Dateien mit bestimmter Endung unter public/uploads (rekursiv, wie Temgines /api/css und /api/fonts)
const scanUploads = (exts) => {
  const out = [];
  const walk = (abs, rel) => {
    let entries = [];
    try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch (_e) { return; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else if (exts.includes(path.extname(e.name).toLowerCase())) out.push({ rel: r, name: e.name, abs: path.join(abs, e.name) });
    }
  };
  if (fs.existsSync(UPLOAD_DIR)) walk(UPLOAD_DIR, '');
  return out;
};
const FONT_FORMAT = { '.ttf': 'truetype', '.woff': 'woff', '.woff2': 'woff2', '.otf': 'opentype', '.eot': 'embedded-opentype' };
const readVersion = () => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version; } catch (_e) { return null; } };

const core = {
  // Rollenlisten werden pro Anfrage gelesen (Admin-Overrides können sich ändern).
  roles: {
    get view() { return PERMISSIONS.TEMPLATES_VIEW; },
    get edit() { return PERMISSIONS.TEMPLATES_EDIT; },
    get delete() { return PERMISSIONS.TEMPLATES_DELETE; },
    get cssView() { return PERMISSIONS.CSS_VIEW; },
    get cssEdit() { return PERMISSIONS.CSS_EDIT; },
    get cssDelete() { return PERMISSIONS.CSS_DELETE; },
    get upload() { return PERMISSIONS.FILES_UPLOAD; },
    get filesView() { return PERMISSIONS.FILES_VIEW || PERMISSIONS.TEMPLATES_VIEW; },
  },
  // ponytail: Secret = NEXTAUTH_SECRET (alle Tokens widerrufen = Secret ändern); eigenes Setting, falls das stört.
  secret: () => process.env.NEXTAUTH_SECRET || null,
  now: () => Date.now(),
  version: readVersion(),
  bcrypt,
  store: { listTemplates, getTemplateByName, saveTemplate, deleteTemplateByName },
  validatePreviewSubset,
  getUsedTemplateNames,
  extractTemplateVariables,
  extractTypedVariables,
  renderTemplate,
  sectionProviders: getSectionProviders,
  // WP-B7, nur lesend: globale Variablen (aktive, mit aufgelöstem Wert), Widgets (mit Platzhalter-Slug wie die Render-Pipeline),
  // Navigationen MAIN/PAGE/MOBILE (PAGE zusätzlich mit nav:<slug>)
  context: {
    globals: async () => (await prisma.globalVariable.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] }))
      .map((g) => ({ key: g.key, label: g.label, type: g.type, value: resolveGlobalValue(g) })),
    widgets: async () => {
      const all = listGlobalPages().filter((e) => e.role === 'WIDGET');
      const slugs = buildWidgetPlaceholderKeys(all.map((w) => ({ id: w.id, name: w.name })));
      return all.map((w) => ({ name: w.name, slug: slugs[w.id] })).sort((a, b) => a.slug.localeCompare(b.slug));
    },
    navigations: async () => {
      const all = listGlobalPages().filter((e) => ['MAIN', 'PAGE', 'MOBILE'].includes(e.role));
      const keys = buildNavPlaceholderKeys(all.map((n) => ({ id: n.id, name: n.name })));
      return all.map((n) => ({ name: n.name, role: n.role, isActive: n.isActive, key: keys[n.id] }));
    },
  },
  // WP-B4, nur lesend: Rohdaten und Render-Funktionen für die Seitenvorschau (lib/routes/pagepreview.js baut daraus die Seite wie lib/liveSnapshot.js)
  pages: {
    tree: () => prisma.page.findMany({ where: {} }),
    navigations: async () => listNavigations(),
    footers: async () => listFooters(),
    widgets: async () => listGlobalPages().filter((e) => e.role === 'WIDGET'),
    globalVars: async () => buildGlobalContext(await prisma.globalVariable.findMany({ where: { isActive: true } })),
    loadSections: (keys) => loadSectionDataServer(keys, { query: {} }),
    renderPage, buildNavHtml, collectSectionKeys,
  },
  externCss: {
    list: () => loadExternFiles('css'),
    normalize: (name) => normalizeExternFilename('css', name),
    // importExternFiles meldet Fehler im Ergebnis statt zu werfen: hier werfen, sonst gälte ein gescheitertes Schreiben als Erfolg (Sammelübertragung)
    write: (filename, content) => {
      const r = importExternFiles('css', [{ filename, content }], 'merge');
      if (r.errors.length || !r.imported) throw new Error(r.errors[0] || `CSS-Datei ${filename} konnte nicht geschrieben werden`);
    },
    remove: (filename) => fs.unlinkSync(path.join(cssDir(), filename)),
    // .order.json (Reihenfolge) sichern/wiederherstellen für das Rückgängig der Sammelübertragung; null = Datei gab es nicht
    orderState: () => { try { return fs.readFileSync(path.join(cssDir(), '.order.json'), 'utf8'); } catch (_e) { return null; } },
    restoreOrder: (raw) => (raw === null ? fs.rmSync(path.join(cssDir(), '.order.json'), { force: true }) : fs.writeFileSync(path.join(cssDir(), '.order.json'), raw, 'utf8')),
  },
  // WP-B3, nur lesend: aktive CSS-Dateien in Temgines Reihenfolge (extern_css laut .order.json, dann CSS aus uploads)
  siteCss: {
    list: () => {
      const disabled = readDisabled('css-config.json');
      const extern = loadExternFiles('css').map((f) => ({ id: `extern_css/${f.filename}`, filename: f.filename, source: 'extern_css', href: `/extern_css/${f.filename}`, content: f.content }));
      const uploads = scanUploads(['.css']).map((f) => {
        const e = { id: `uploads/${f.rel}`, filename: f.name, source: 'uploads', href: `/uploads/${f.rel}` };
        try { e.content = fs.readFileSync(f.abs, 'utf8'); } catch (err) { e.error = err.message; }
        return e;
      });
      return [...extern, ...uploads].map((f) => ({ ...f, enabled: !disabled.has(f.id) }));
    },
  },
  siteFonts: {
    list: () => {
      const disabled = readDisabled('fonts-config.json');
      return scanUploads(Object.keys(FONT_FORMAT)).map((f) => {
        const ext = path.extname(f.name).toLowerCase();
        return { id: `uploads/${f.rel}`, name: f.name, ext, format: FONT_FORMAT[ext], href: `/uploads/${f.rel}`, enabled: !disabled.has(`uploads/${f.rel}`) };
      });
    },
  },
  listUploads: listFolderItemsRecursive,
  uploads: {
    maxFileSize: MAX_FILE_SIZE, // dieselbe Grenze wie Temgines Dateimanager
    // Ordnerbaum (relativ zu public/uploads), ohne Punkt-Ordner
    listFolders: () => {
      const out = [];
      const walk = (abs, rel) => {
        for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
          if (!e.isDirectory() || e.name.startsWith('.')) continue;
          const r = rel ? `${rel}/${e.name}` : e.name;
          out.push(r);
          walk(path.join(abs, e.name), r);
        }
      };
      if (fs.existsSync(UPLOAD_DIR)) walk(UPLOAD_DIR, '');
      return out.sort((a, b) => a.localeCompare(b, 'de'));
    },
    // Schreibt die fertig geprüfte Datei; eindeutiger Name wie im Dateimanager (name, name_2, …), nie überschreiben.
    commit: async (folder, filename, buf) => {
      const { resolved, safe } = resolveSafeDir(folder);
      if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) throw new Error('Ungültiger Pfad');
      fs.mkdirSync(resolved, { recursive: true });
      const { name: base, ext } = path.parse(filename);
      for (let n = 1; n < 1000; n += 1) {
        const name = n === 1 ? filename : `${base}_${n}${ext}`;
        const abs = path.join(resolved, name);
        try { fs.writeFileSync(abs, buf, { flag: 'wx' }); } catch (e) { if (e.code === 'EEXIST') continue; fs.rmSync(abs, { force: true }); throw e; }
        invalidateFileCache(); // erscheint sofort in Temgines Medienliste
        const rel = safe ? `${safe}/${name}` : name;
        return { name, path: rel, url: `/uploads/${rel}` };
      }
      throw new Error('Kein freier Dateiname');
    },
  },
  // Verwendung: dieselben Felder wie lib/templateUsage.js, mit Titel/Slug/Kanalname (Filter in lib/usage.js)
  getTemplateUsage: async (name) => findUsage(
    await prisma.page.findMany({ select: { id: true, slug: true, title: true, template: true, blocks: true } }),
    await prisma.blogChannel.findMany({ select: { id: true, slug: true, name: true, templateDetailPreview: true, templateSimplePreview: true, templateArchiveEntry: true, templateReading: true } }),
    name,
  ),
  // Letzte Designer-Aktionen (Audit-Log „designer.*“) mit Benutzername
  listDesignerAudit: async (take) => {
    const rows = await prisma.auditLog.findMany({ where: { action: { startsWith: 'designer.' } }, orderBy: { createdAt: 'desc' }, take });
    const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : [];
    const byId = new Map(users.map((u) => [u.id, u.name || u.email]));
    return rows.map((r) => ({ id: r.id, action: r.action, resourceId: r.resourceId, user: byId.get(r.userId) || null, details: r.details, createdAt: r.createdAt }));
  },
  pluginVersion: manifest.version,
  audit: logAudit,
  state,
};

export default { routes: createRoutes(core) };
