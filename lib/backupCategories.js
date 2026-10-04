// Einzeln per Checkbox wählbare Backup-Kategorien für den Projekttransfer
// (components/BackupView.js, pages/api/admin/export.js, pages/api/admin/import.js).
// Jeder `key` ist der exakte Feldname im Backup-JSON UND der Eintrag, der in
// `metadata.filesIncluded` landet — import.js liest genau diese Liste, um bei
// der "Ersetzen"-Strategie nur Kategorien zu löschen, die das Backup auch
// tatsächlich mitbringt (eine hier fehlende Kategorie wird nie als "leeren"
// interpretiert).
//
// `css` schließt den CSS-Aktivierungsstatus (cssConfig) mit ein, `uploadFonts`
// den Font-Aktivierungsstatus (fontsConfig) — beide sind ohne die zugehörigen
// Dateien bedeutungslos, daher kein eigenes Kästchen dafür.
export const BACKUP_CATEGORIES = [
  { key: 'pages', label: 'Seiten', group: 'Datenbank' },
  { key: 'blog', label: 'Blog / News', group: 'Datenbank', description: 'Blog-Channels und -Beiträge' },
  { key: 'snippets', label: 'Snippets', group: 'Datenbank' },
  { key: 'globalVariables', label: 'Globale Variablen', group: 'Datenbank' },
  { key: 'templates', label: 'Templates', group: 'Design & Vorlagen' },
  { key: 'css', label: 'CSS-Dateien', group: 'Design & Vorlagen', description: 'inkl. Aktivierungsstatus & Reihenfolge' },
  { key: 'navigations', label: 'Navigationen', group: 'Design & Vorlagen' },
  { key: 'footers', label: 'Footer', group: 'Design & Vorlagen' },
  { key: 'maintenance', label: 'Wartungsseiten', group: 'Design & Vorlagen', description: '404, 503, Lade-Bildschirm' },
  { key: 'uploadedFiles', label: 'Uploads (Bilder & Dateien)', group: 'Medien' },
  { key: 'uploadFonts', label: 'Schriftarten', group: 'Medien', description: 'inkl. Aktivierungsstatus' },
];

export const BACKUP_CATEGORY_KEYS = BACKUP_CATEGORIES.map((c) => c.key);

export function parseBackupCategories(raw) {
  const requested = typeof raw === 'string' && raw.length > 0
    ? raw.split(',').map((c) => c.trim()).filter(Boolean)
    : BACKUP_CATEGORY_KEYS;
  const valid = requested.filter((c) => BACKUP_CATEGORY_KEYS.includes(c));
  return new Set(valid.length > 0 ? valid : BACKUP_CATEGORY_KEYS);
}
