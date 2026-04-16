import fs from 'fs';
import path from 'path';

const CSS_DIR = path.join(process.cwd(), 'public', 'extern_css');

/**
 * Extracts CSS class names from a CSS string.
 * Returns an array of { className, section } objects where section is
 * derived from /* --- Preset: Name --- *\/ comments found before the class.
 */
function parseClasses(cssContent) {
  const results = [];
  const seen = new Set();

  // Split on Preset comment markers first so we can track sections
  const sectionRegex = /\/\*\s*---\s*Preset:\s*(.+?)\s*---\s*\*\//g;
  const classRegex = /\.([a-zA-Z][a-zA-Z0-9_-]*)\s*[{,:\[]/g;

  // Build a map: character offset → section name
  const sections = [];
  let m;
  while ((m = sectionRegex.exec(cssContent)) !== null) {
    sections.push({ offset: m.index, name: m[1].trim() });
  }

  function sectionAt(offset) {
    let current = null;
    for (const s of sections) {
      if (s.offset <= offset) current = s.name;
      else break;
    }
    return current;
  }

  while ((m = classRegex.exec(cssContent)) !== null) {
    const cls = m[1];
    // Skip utility artifacts like numbers, single letters (a-z used as selectors)
    if (cls.length < 2) continue;
    if (seen.has(cls)) continue;
    seen.add(cls);
    results.push({ className: cls, section: sectionAt(m.index) });
  }

  return results;
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!fs.existsSync(CSS_DIR)) {
      return res.status(200).json({ files: [], duplicates: [] });
    }

    const allFiles = fs.readdirSync(CSS_DIR).filter(
      (f) => f.endsWith('.css') && !f.startsWith('.')
    );

    const fileResults = [];
    // classname → array of filenames where it appears
    const classMap = {};

    for (const filename of allFiles) {
      const filePath = path.join(CSS_DIR, filename);
      let content = '';
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch {
        continue;
      }

      const parsed = parseClasses(content);

      for (const { className } of parsed) {
        if (!classMap[className]) classMap[className] = [];
        classMap[className].push(filename);
      }

      fileResults.push({ name: filename, classes: parsed });
    }

    const duplicates = Object.entries(classMap)
      .filter(([, files]) => files.length > 1)
      .map(([className, files]) => ({ className, files }));

    return res.status(200).json({ files: fileResults, duplicates });
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Parsen der CSS-Dateien: ' + err.message });
  }
}
