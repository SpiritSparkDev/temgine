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
        // path traversal guard
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
  if (req.method === 'GET') {
    const disabled = loadDisabledSet();
    const fonts = scanUploadsForFonts(UPLOADS_DIR, '');
    const result = fonts.map(f => ({ ...f, enabled: !disabled.has(f.id) }));
    return res.status(200).json({ fonts: result });
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      if (!Array.isArray(body.disabled)) {
        return res.status(400).json({ error: 'Ungültige Anfrage: disabled array erwartet' });
      }
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ disabled: body.disabled }, null, 2), 'utf-8');
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: 'Fehler beim Speichern der Konfiguration' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
