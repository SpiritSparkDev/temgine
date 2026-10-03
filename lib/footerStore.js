// Dünner Kompatibilitäts-Shim: Footer ist jetzt nur noch die Rolle 'FOOTER'
// im vereinheitlichten globalen Seitenkomponenten-Store (siehe
// lib/globalPageStore.js und components/GlobalPagesView.js). Diese Datei
// bleibt mit exakt denselben Exporten bestehen, damit pages/api/footers.js,
// lib/liveSnapshot.js, pages/api/admin/{import,export}.js unverändert
// weiterlaufen.
import { listGlobalPages, getGlobalPageById, getActiveGlobalPages, saveGlobalPage, deleteGlobalPage } from './globalPageStore';

function stripRole({ role, ...rest }) {
  return rest;
}

export function listFooters() {
  return listGlobalPages().filter((e) => e.role === 'FOOTER').map(stripRole);
}

export function getFooterById(id) {
  const entry = getGlobalPageById(id);
  return entry && entry.role === 'FOOTER' ? stripRole(entry) : null;
}

export function getActiveFooter() {
  const [first] = getActiveGlobalPages('FOOTER');
  return first ? stripRole(first) : null;
}

// Erstellt oder aktualisiert einen Footer. `id` übergeben zum Aktualisieren
// (ID bleibt über Umbenennungen erhalten); weglassen für einen neuen.
export function saveFooter({ id, name, code, isActive }) {
  return stripRole(saveGlobalPage({ id, name, role: 'FOOTER', code, isActive }));
}

export function deleteFooter(id) {
  return deleteGlobalPage(id);
}
