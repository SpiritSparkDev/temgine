import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const CONFIG_FILE = path.join(process.cwd(), 'data', 'fonts-config.json');

const FONT_EXTS = new Set(['.ttf', '.woff', '.woff2', '.otf', '.eot']);

const FONT_FORMAT = {
  '.ttf':   'truetype',
  '.woff':  'woff',
  '.woff2': 'woff2',
  '.otf':   'opentype',
  '.eot':   'embedded-opentype',
};

function loadDisabledSet() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return new Set(Array.isArray(data.disabled) ? data.disabled : []);
    }
  } catch (e) {}
  return new Set();
}

function scanUploadsForFonts(dir, relBase, results = []) {
  if (!fs.existsSync(dir)) return results;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryRel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scanUploadsForFonts(path.join(dir, entry.name), entryRel, results);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (!FONT_EXTS.has(ext)) continue;
        const absPath = path.join(dir, entry.name);
        if (!absPath.startsWith(UPLOADS_DIR)) continue;
        results.push({
          id: `uploads/${entryRel}`,
          name: entry.name,
          ext,
          format: FONT_FORMAT[ext] || ext.slice(1),
          href: `/uploads/${entryRel}`,
        });
      }
    }
  } catch (e) {}
  return results;
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end();
  }

  const disabled = loadDisabledSet();
  const fonts = scanUploadsForFonts(UPLOADS_DIR, '');
  const enabled = fonts.filter(f => !disabled.has(f.id));

  const css = enabled.map(f => {
    const family = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    return `@font-face {\n  font-family: "${family}";\n  src: url("${f.href}") format("${f.format}");\n  font-display: swap;\n}`;
  }).join('\n\n');

  // No-store so changes in Font Manager are picked up immediately
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(css || '/* no fonts enabled */');
}
