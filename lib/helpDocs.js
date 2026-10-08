// Anleitungen aus dem Ordner help/ (Markdown), im Editor als Dokumentation abrufbar.
// Nur Dateinamen aus diesem Ordner sind erreichbar – kein freier Pfad vom Client.
import fs from 'fs';
import path from 'path';

const HELP_DIR = path.join(process.cwd(), 'help');

// Reihenfolge im Dokumentations-Fenster; weitere .md-Dateien folgen alphabetisch.
const PREFERRED_ORDER = ['templates', 'navigationen', 'picgine-galerien'];

function titleOf(markdown, fallback) {
  const m = /^#\s+(.+)$/m.exec(markdown);
  return m ? m[1].trim() : fallback;
}

export function listHelpDocs() {
  let files = [];
  try { files = fs.readdirSync(HELP_DIR).filter(f => /^[a-z0-9-]+\.md$/.test(f)); } catch { return []; }
  const names = files.map(f => f.slice(0, -3)).sort((a, b) => {
    const ia = PREFERRED_ORDER.indexOf(a); const ib = PREFERRED_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
  return names.map(name => ({ name, title: titleOf(fs.readFileSync(path.join(HELP_DIR, `${name}.md`), 'utf8'), name) }));
}

export function readHelpDoc(name) {
  if (!/^[a-z0-9-]+$/.test(String(name))) return null;
  const file = path.join(HELP_DIR, `${name}.md`);
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}
