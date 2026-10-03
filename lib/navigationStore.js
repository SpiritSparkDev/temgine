// Dünner Kompatibilitäts-Shim: Navigationen sind jetzt die Rollen 'MAIN',
// 'PAGE' und 'MOBILE' im vereinheitlichten globalen Seitenkomponenten-Store
// (siehe lib/globalPageStore.js und components/GlobalPagesView.js). Diese
// Datei bleibt mit exakt denselben Exporten bestehen, damit
// pages/api/navigations.js, pages/api/files.js, lib/liveSnapshot.js,
// pages/api/admin/{import,export}.js unverändert weiterlaufen.
import { listGlobalPages, getGlobalPageById, getActiveGlobalPages, saveGlobalPage, deleteGlobalPage } from './globalPageStore';

const VALID_TYPES = ['MAIN', 'PAGE', 'MOBILE'];

function toNavShape({ role, ...rest }) {
  return { ...rest, type: role };
}

export function listNavigations() {
  return listGlobalPages().filter((e) => VALID_TYPES.includes(e.role)).map(toNavShape);
}

export function getNavigationById(id) {
  const entry = getGlobalPageById(id);
  return entry && VALID_TYPES.includes(entry.role) ? toNavShape(entry) : null;
}

export function getActiveNavigations() {
  return getActiveGlobalPages().filter((e) => VALID_TYPES.includes(e.role)).map(toNavShape);
}

// Erstellt oder aktualisiert eine Navigation. `id` übergeben zum
// Aktualisieren (ID und Typ bleiben erhalten, auch bei Namensänderung);
// weglassen für eine neue.
export function saveNavigation({ id, name, type, code, isActive }) {
  const resolvedType = VALID_TYPES.includes(String(type || '').toUpperCase())
    ? String(type).toUpperCase()
    : 'MAIN';
  return toNavShape(saveGlobalPage({ id, name, role: resolvedType, code, isActive }));
}

export function deleteNavigation(id) {
  return deleteGlobalPage(id);
}
