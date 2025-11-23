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
const ORDER_FILE = path.join(CSS_DIR, '.order.json');

// Verzeichnis erstellen falls nicht vorhanden
if (!fs.existsSync(CSS_DIR)) {
  fs.mkdirSync(CSS_DIR, { recursive: true });
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
        let files = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css'));
        
        // Lade gespeicherte Reihenfolge
        if (fs.existsSync(ORDER_FILE)) {
          try {
            const orderData = JSON.parse(fs.readFileSync(ORDER_FILE, 'utf-8'));
            const order = orderData.order || [];
            
            // Sortiere Dateien nach gespeicherter Reihenfolge
            const orderedFiles = [];
            order.forEach(file => {
              if (files.includes(file)) {
                orderedFiles.push(file);
              }
            });
            
            // Füge neue Dateien hinzu, die nicht in der Reihenfolge sind
            files.forEach(file => {
              if (!orderedFiles.includes(file)) {
                orderedFiles.push(file);
              }
            });
            
            files = orderedFiles;
          } catch (e) {
            // Falls Order-Datei korrupt ist, nutze alphabetische Sortierung
            files.sort();
          }
        } else {
          files.sort();
        }
        
        res.status(200).json({ files });
      } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Dateiliste' });
      }
    }
  } else if (req.method === 'POST') {
    // CSS-Datei speichern (or upload via JSON payload)
    try {
      const payload = parsedBody || req.body || {}
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
      const { filename } = parsedBody || req.body || {};

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
