import fs from 'fs';
import path from 'path';

// For multipart parsing
import formidable from 'formidable';

// Disable Next's default body parsing for this route so formidable can parse multipart
export const config = {
  api: {
    bodyParser: false,
  },
};

const CSS_DIR = path.join(process.cwd(), 'public', 'extern_css');
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const ORDER_FILE = path.join(CSS_DIR, '.order.json');
const CONFIG_FILE = path.join(process.cwd(), 'data', 'css-config.json');

// Verzeichnis erstellen falls nicht vorhanden
if (!fs.existsSync(CSS_DIR)) {
  fs.mkdirSync(CSS_DIR, { recursive: true });
}

function loadDisabledSet() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return new Set(Array.isArray(data.disabled) ? data.disabled : []);
    }
  } catch (e) {}
  return new Set();
}

function scanUploadsForCss(dir, relBase, results = []) {
  if (!fs.existsSync(dir)) return results;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryRel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scanUploadsForCss(path.join(dir, entry.name), entryRel, results);
      } else if (entry.name.toLowerCase().endsWith('.css')) {
        const id = `uploads/${entryRel}`;
        const absPath = path.join(dir, entry.name);
        // path traversal check
        if (!absPath.startsWith(UPLOADS_DIR)) continue;
        results.push({ id, name: entry.name, source: 'uploads', href: `/uploads/${entryRel}` });
      }
    }
  } catch (e) {}
  return results;
}

export default async function handler(req, res) {
  // If multipart/form-data, use formidable to handle file upload
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  // Helper to read raw request body when Next's bodyParser is disabled
  const readRawBody = () => new Promise((resolve, reject) => {
    try {
      let data = ''
      req.on('data', chunk => data += chunk)
      req.on('end', () => resolve(data))
      req.on('error', err => reject(err))
    } catch (e) { reject(e) }
  })
  if (req.method === 'POST' && contentType.includes('multipart/form-data')) {
    const form = formidable({ multiples: false });
    form.parse(req, (err, fields, files) => {
      if (err) {
        return res.status(500).json({ error: 'Fehler beim Parsen der Datei' });
      }
      try {
        const uploaded = files && files.file;
        if (!uploaded) return res.status(400).json({ error: 'Keine Datei empfangen' });

        // formidable may return a single file or an array
        const fileObj = Array.isArray(uploaded) ? uploaded[0] : uploaded;
        const originalName = fileObj.originalFilename || fileObj.name || 'upload.css';
        const safeName = originalName.endsWith('.css') ? originalName : originalName + '.css';
        const destPath = path.join(CSS_DIR, safeName);
        if (!destPath.startsWith(CSS_DIR)) return res.status(400).json({ error: 'Ungültiger Dateipfad' });

        // Move or copy the uploaded file to CSS_DIR
        const data = fs.readFileSync(fileObj.filepath || fileObj.path);
        fs.writeFileSync(destPath, data);

        return res.status(200).json({ success: true, file: safeName });
      } catch (e) {
        return res.status(500).json({ error: 'Fehler beim Speichern der hochgeladenen Datei' });
      }
    });
    return;
  }
  // If the request has a JSON body (editor save/upload sends JSON) we need to
  // parse it manually because `bodyParser` is disabled for formidable.
  let parsedBody = null
  if (req.method === 'POST' || req.method === 'DELETE') {
    try {
      if (contentType.includes('application/json')) {
        const raw = await readRawBody()
        parsedBody = raw ? JSON.parse(raw) : {}
      }
    } catch (e) {
      // ignore parsing errors here; handlers below will validate fields
      parsedBody = null
    }
  }
  if (req.method === 'GET') {
    // Liste aller CSS-Dateien oder Inhalt einer spezifischen Datei
    const { file } = req.query;

    if (file) {
      try {
        const filePath = path.join(CSS_DIR, file);
        if (!filePath.startsWith(CSS_DIR)) {
          return res.status(400).json({ error: 'Ungültiger Dateipfad' });
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        res.status(200).json({ content });
      } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Datei' });
      }
    } else {
      try {
        let fileNames = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css'));
        
        // Lade gespeicherte Reihenfolge
        if (fs.existsSync(ORDER_FILE)) {
          try {
            const orderData = JSON.parse(fs.readFileSync(ORDER_FILE, 'utf-8'));
            const order = orderData.order || [];
            
            // Sortiere Dateien nach gespeicherter Reihenfolge
            const orderedFiles = [];
            order.forEach(file => {
              if (fileNames.includes(file)) {
                orderedFiles.push(file);
              }
            });
            
            // Füge neue Dateien hinzu, die nicht in der Reihenfolge sind
            fileNames.forEach(file => {
              if (!orderedFiles.includes(file)) {
                orderedFiles.push(file);
              }
            });
            
            fileNames = orderedFiles;
          } catch (e) {
            // Falls Order-Datei korrupt ist, nutze alphabetische Sortierung
            fileNames.sort();
          }
        } else {
          fileNames.sort();
        }

        const disabled = loadDisabledSet();

        const externFiles = fileNames.map(name => ({
          id: `extern_css/${name}`,
          name,
          source: 'extern_css',
          href: `/extern_css/${name}`,
          enabled: !disabled.has(`extern_css/${name}`),
        }));

        const uploadFiles = scanUploadsForCss(UPLOADS_DIR, '', []).map(f => ({
          ...f,
          enabled: !disabled.has(f.id),
        }));
        
        res.status(200).json({ files: [...externFiles, ...uploadFiles] });
      } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Dateiliste' });
      }
    }
  } else if (req.method === 'POST') {
    // Sonderfall: disabled-Liste speichern
    const payload = parsedBody || {};
    if (!payload.filename && Array.isArray(payload.disabled)) {
      try {
        const dataDir = path.dirname(CONFIG_FILE);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ disabled: payload.disabled }, null, 2), 'utf-8');
        return res.status(200).json({ success: true });
      } catch (error) {
        return res.status(500).json({ error: 'Fehler beim Speichern der Konfiguration' });
      }
    }
    // CSS-Datei speichern (or upload via JSON payload)
    try {
      const { filename, content } = payload;

      if (!filename || !filename.endsWith('.css')) {
        return res.status(400).json({ error: 'Dateiname muss mit .css enden' });
      }

      const filePath = path.join(CSS_DIR, filename);
      if (!filePath.startsWith(CSS_DIR)) {
        return res.status(400).json({ error: 'Ungültiger Dateipfad' });
      }

      fs.writeFileSync(filePath, content || '', 'utf-8');
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Fehler beim Speichern der Datei' });
    }
  } else if (req.method === 'DELETE') {
    // CSS-Datei löschen
    try {
      const { filename } = parsedBody || {};

      if (!filename) {
        return res.status(400).json({ error: 'Dateiname erforderlich' });
      }

      const filePath = path.join(CSS_DIR, filename);
      if (!filePath.startsWith(CSS_DIR)) {
        return res.status(400).json({ error: 'Ungültiger Dateipfad' });
      }

      fs.unlinkSync(filePath);
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Fehler beim Löschen der Datei' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
