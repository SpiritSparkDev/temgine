import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Unified storage for "global page components" — reusable Mustache
// snippets that get injected into rendered pages: Footer, Hauptnavigation
// (MAIN, site-weit auto-injected), Seitennavigation (PAGE, als Baustein
// platziert) und die seit jeher ungenutzte MOBILE-Rolle (siehe unten).
// Ersetzt die vormals getrennten, aber strukturell fast identischen Stores
// lib/footerStore.js und lib/navigationStore.js mit einem Store + einer
// Admin-UI (components/GlobalPagesView.js), die Rollen statt getrennter
// Konzepte kennt.
//
//   public/assets/template/global/<role>/<slug>.html   (Mustache-Code)
//   public/assets/template/global/<role>/<slug>.json   (id, name, isActive, timestamps)
//
// IDs bleiben über Umbenennungen hinweg erhalten (Page.data.pageFooter /
// Page.data.pageNav und `type: 'navigation'`-Blöcke referenzieren per ID).
//
// Legacy-Fallback: bestehende Daten aus der alten, getrennten Ablage
// (public/assets/template/footer/, public/assets/template/navigation/<type>/)
// werden beim Lesen automatisch mit eingemischt (neuer Pfad gewinnt bei
// gleicher ID) — nichts verschwindet, auch ohne
// `npm run migrate-footer-navigation-to-global`. Wird ein Alt-Eintrag
// gespeichert, zieht er automatisch an den neuen Ort um.

const ROOT = path.join(process.cwd(), 'public', 'assets', 'template', 'global');
const LEGACY_FOOTER_DIR = path.join(process.cwd(), 'public', 'assets', 'template', 'footer');
const LEGACY_NAV_ROOT = path.join(process.cwd(), 'public', 'assets', 'template', 'navigation');

// exclusiveActive: nur ein aktiver Eintrag dieser Rolle gleichzeitig (ältere
// aktive Geschwister werden beim Speichern automatisch deaktiviert).
// alwaysActive: Aktivierung ist kein Konzept — immer "aktiv", wie PAGE-Navs
// und Widgets, die als Baustein gezielt platziert statt automatisch
// injiziert werden.
// MOBILE ist seit jeher weder in der Admin-UI noch in der Navigations-API
// erstellbar (siehe pages/api/navigations.js VALID_TYPES) — totes, aber
// kompatibel mitgeführtes Gleis; hier dennoch mit korrekter Exklusivität
// definiert, falls doch einmal Altdaten dafür existieren.
// WIDGET: freie, wiederverwendbare Inhaltsbausteine (Sidebars, Info-/CTA-Boxen
// u. Ä.) ohne eigenes Seiten-/Navigationskonzept — wie PAGE-Navs manuell als
// Block platziert (type: 'global-page', siehe lib/templateEngine.js), aber
// ohne deren seitenbaum-spezifische Daten (pages/anchors/childPages); nur
// {{global.X}} steht zur Verfügung.
export const GLOBAL_PAGE_ROLES = [
  { id: 'FOOTER', label: 'Footer', exclusiveActive: true, alwaysActive: false },
  { id: 'MAIN', label: 'Hauptnavigation', exclusiveActive: true, alwaysActive: false },
  { id: 'PAGE', label: 'Seitennavigation', exclusiveActive: false, alwaysActive: true },
  { id: 'MOBILE', label: 'Mobile-Navigation', exclusiveActive: true, alwaysActive: false },
  { id: 'WIDGET', label: 'Widget', exclusiveActive: false, alwaysActive: true },
];
const VALID_ROLES = GLOBAL_PAGE_ROLES.map((r) => r.id);

function getRoleMeta(role) {
  const meta = GLOBAL_PAGE_ROLES.find((r) => r.id === role);
  if (!meta) throw new Error(`Unbekannte Rolle für globale Seitenkomponente: "${role}"`);
  return meta;
}

function roleDir(role) {
  return path.join(ROOT, String(role).toLowerCase());
}

function legacyRoleDir(role) {
  return role === 'FOOTER' ? LEGACY_FOOTER_DIR : path.join(LEGACY_NAV_ROOT, String(role).toLowerCase());
}

function readDirSafe(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return [];
  }
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_e) {
    return null;
  }
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_e) {
    return null;
  }
}

function slugify(name) {
  const base = String(name || 'item')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'item';
}

function uniqueSlug(dir, name, excludeSlug = null) {
  const base = slugify(name);
  let slug = base;
  let i = 2;
  while (fs.existsSync(path.join(dir, `${slug}.json`)) && slug !== excludeSlug) {
    slug = `${base}-${i}`;
    i++;
  }
  return slug;
}

function readRoleDir(dir, role) {
  const list = [];
  for (const dirent of readDirSafe(dir)) {
    if (!dirent.isFile() || !dirent.name.endsWith('.json')) continue;
    const slug = dirent.name.slice(0, -'.json'.length);
    const meta = readJsonSafe(path.join(dir, dirent.name));
    if (!meta) continue;
    const code = readFileSafe(path.join(dir, `${slug}.html`)) || '';
    list.push({
      id: meta.id,
      name: meta.name,
      role,
      code,
      isActive: Boolean(meta.isActive),
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    });
  }
  return list;
}

export function listGlobalPages() {
  const byId = new Map();
  for (const role of VALID_ROLES) {
    // Legacy zuerst einlesen, unified-Ort danach darüberschreiben — so
    // gewinnt bei bereits (teil-)migrierten Daten immer die neue Version.
    for (const entry of readRoleDir(legacyRoleDir(role), role)) byId.set(entry.id, entry);
    for (const entry of readRoleDir(roleDir(role), role)) byId.set(entry.id, entry);
  }
  return Array.from(byId.values());
}

export function getGlobalPageById(id) {
  if (!id) return null;
  return listGlobalPages().find((e) => e.id === String(id)) || null;
}

export function getActiveGlobalPages(role = null) {
  const all = listGlobalPages().filter((e) => e.isActive);
  return role ? all.filter((e) => e.role === role) : all;
}

function findLocationById(id) {
  for (const role of VALID_ROLES) {
    for (const dir of [roleDir(role), legacyRoleDir(role)]) {
      for (const dirent of readDirSafe(dir)) {
        if (!dirent.isFile() || !dirent.name.endsWith('.json')) continue;
        const meta = readJsonSafe(path.join(dir, dirent.name));
        if (meta && meta.id === String(id)) {
          return { role, dir, slug: dirent.name.slice(0, -'.json'.length) };
        }
      }
    }
  }
  return null;
}

// Deaktiviert alle anderen aktiven Geschwister derselben Rolle (unified +
// legacy Ablage), nur relevant für exclusiveActive-Rollen.
function deactivateSiblings(role, keepId) {
  const roleMeta = getRoleMeta(role);
  if (!roleMeta.exclusiveActive) return;
  for (const dir of [roleDir(role), legacyRoleDir(role)]) {
    for (const dirent of readDirSafe(dir)) {
      if (!dirent.isFile() || !dirent.name.endsWith('.json')) continue;
      const metaPath = path.join(dir, dirent.name);
      const meta = readJsonSafe(metaPath);
      if (!meta || meta.id === String(keepId) || !meta.isActive) continue;
      meta.isActive = false;
      meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
    }
  }
}

// Erstellt oder aktualisiert eine globale Seitenkomponente. `id` übergeben
// zum Aktualisieren (ID bleibt erhalten, auch bei Namensänderung); weglassen
// für eine neue. Schreibt immer an den neuen, vereinheitlichten Ort — ein
// noch an der alten Stelle liegender Eintrag "wandert" dadurch automatisch um.
export function saveGlobalPage({ id, name, role, code, isActive }) {
  const existing = id ? getGlobalPageById(id) : null;
  const resolvedRole = existing ? existing.role : role;
  const roleMeta = getRoleMeta(resolvedRole);
  const dir = roleDir(resolvedRole);
  fs.mkdirSync(dir, { recursive: true });

  const now = new Date().toISOString();
  const existingLocation = id ? findLocationById(id) : null;

  const finalId = existing ? existing.id : (id ? String(id) : crypto.randomUUID());
  const finalName = name !== undefined ? String(name) : (existing ? existing.name : roleMeta.label);
  const finalCode = code !== undefined ? String(code) : (existing ? existing.code : '');
  const finalActive = roleMeta.alwaysActive
    ? true
    : (isActive !== undefined ? Boolean(isActive) : (existing ? existing.isActive : false));
  const createdAt = existing ? existing.createdAt : now;

  const slug = uniqueSlug(dir, finalName, existingLocation && existingLocation.dir === dir ? existingLocation.slug : null);

  // Altes File aufräumen: bei Umzug aus der Legacy-Ablage, Rollenwechsel
  // oder Slug-Änderung durch Umbenennung.
  if (existingLocation && (existingLocation.dir !== dir || existingLocation.slug !== slug)) {
    try { fs.unlinkSync(path.join(existingLocation.dir, `${existingLocation.slug}.html`)); } catch (_e) {}
    try { fs.unlinkSync(path.join(existingLocation.dir, `${existingLocation.slug}.json`)); } catch (_e) {}
  }

  fs.writeFileSync(path.join(dir, `${slug}.html`), finalCode, 'utf8');
  fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify({
    id: finalId,
    name: finalName,
    isActive: finalActive,
    createdAt,
    updatedAt: now,
  }, null, 2), 'utf8');

  if (finalActive) deactivateSiblings(resolvedRole, finalId);

  return { id: finalId, name: finalName, role: resolvedRole, code: finalCode, isActive: finalActive, createdAt, updatedAt: now };
}

export function deleteGlobalPage(id) {
  const location = findLocationById(id);
  if (!location) return false;
  try { fs.unlinkSync(path.join(location.dir, `${location.slug}.html`)); } catch (_e) {}
  try { fs.unlinkSync(path.join(location.dir, `${location.slug}.json`)); } catch (_e) {}
  return true;
}
