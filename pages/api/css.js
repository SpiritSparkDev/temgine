import fs from 'fs';
import path from 'path';

const CSS_DIR = path.join(process.cwd(), 'public', 'extern_css');
const ORDER_FILE = path.join(CSS_DIR, '.order.json');

// Verzeichnis erstellen falls nicht vorhanden
if (!fs.existsSync(CSS_DIR)) {
  fs.mkdirSync(CSS_DIR, { recursive: true });
}

export default function handler(req, res) {
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
    // CSS-Datei speichern
    try {
      const { filename, content } = req.body;

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
      const { filename } = req.body;

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
