import fs from 'fs';
import path from 'path';
import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false,
  },
};

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

// Stelle sicher, dass Upload-Verzeichnis existiert
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Liste aller Dateien mit Metadaten
    try {
      const fileList = [];
      
      // Dateien aus uploads/ lesen
      if (fs.existsSync(UPLOAD_DIR)) {
        const files = fs.readdirSync(UPLOAD_DIR);
        files.forEach(filename => {
          const filePath = path.join(UPLOAD_DIR, filename);
          if (fs.statSync(filePath).isFile()) {
            const stats = fs.statSync(filePath);
            fileList.push({
              name: filename,
              size: stats.size,
              modified: stats.mtime,
              type: path.extname(filename).toLowerCase(),
              url: `/uploads/${filename}`
            });
          }
        });
      }
      
      // Bilder aus uploads/images/ lesen (nur Originale, keine _small, _medium, etc.)
      const imageDir = path.join(process.cwd(), 'public', 'uploads', 'images');
      if (fs.existsSync(imageDir)) {
        const imageFiles = fs.readdirSync(imageDir);
        imageFiles.forEach(filename => {
          // Überspringe Größen-Varianten
          if (filename.includes('_thumbnail') || filename.includes('_small') || 
              filename.includes('_medium') || filename.includes('_large')) {
            return;
          }
          
          const filePath = path.join(imageDir, filename);
          if (fs.statSync(filePath).isFile()) {
            const stats = fs.statSync(filePath);
            fileList.push({
              name: filename,
              size: stats.size,
              modified: stats.mtime,
              type: path.extname(filename).toLowerCase(),
              url: `/uploads/images/${filename}`,
              isOptimized: true
            });
          }
        });
      }
      
      res.status(200).json({ files: fileList });
    } catch (error) {
      console.error('List files error:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Dateien' });
    }
  } else if (req.method === 'POST') {
    // Datei hochladen
    const form = formidable({
      uploadDir: UPLOAD_DIR,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      filename: (name, ext, part) => {
        // Bereinige Dateinamen
        const cleanName = part.originalFilename
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .toLowerCase();
        return `${Date.now()}_${cleanName}`;
      }
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        return res.status(500).json({ error: 'Upload fehlgeschlagen' });
      }

      const file = files.file;
      if (!file) {
        return res.status(400).json({ error: 'Keine Datei gefunden' });
      }

      const uploadedFile = Array.isArray(file) ? file[0] : file;
      
      res.status(200).json({
        success: true,
        file: {
          name: path.basename(uploadedFile.filepath),
          size: uploadedFile.size,
          type: uploadedFile.mimetype,
          url: `/uploads/${path.basename(uploadedFile.filepath)}`
        }
      });
    });
  } else if (req.method === 'DELETE') {
    // Datei löschen
    try {
      // Parse JSON body manuell, da bodyParser deaktiviert ist
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
      }
      const { filename } = JSON.parse(body);
      
      if (!filename) {
        return res.status(400).json({ error: 'Dateiname erforderlich' });
      }

      // Bestimme den richtigen Pfad (normales uploads/ oder uploads/images/)
      let filePath;
      let cleanFilename;
      
      if (filename.includes('/images/')) {
        // Bild aus images-Verzeichnis
        cleanFilename = filename.replace(/^\/uploads\/images\//, '').replace(/^uploads\/images\//, '');
        filePath = path.join(process.cwd(), 'public', 'uploads', 'images', cleanFilename);
      } else {
        // Normale Datei aus uploads/
        cleanFilename = filename.replace(/^\/uploads\//, '').replace(/^uploads\//, '');
        filePath = path.join(UPLOAD_DIR, cleanFilename);
      }

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        
        // Wenn es ein Bild ist, lösche auch die optimierten Versionen
        const ext = path.extname(cleanFilename).toLowerCase();
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
          const basename = path.basename(cleanFilename, ext);
          const imageDir = path.join(process.cwd(), 'public', 'uploads', 'images');
          const thumbDir = path.join(imageDir, 'thumbnails');
          
          // Lösche alle Größen
          const sizes = ['', '_thumbnail', '_small', '_medium', '_large'];
          sizes.forEach(suffix => {
            const imagePath = path.join(imageDir, `${basename}${suffix}.webp`);
            if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
            }
            const thumbPath = path.join(thumbDir, `${basename}${suffix}.webp`);
            if (fs.existsSync(thumbPath)) {
              fs.unlinkSync(thumbPath);
            }
          });
        }
        
        res.status(200).json({ success: true, message: 'Datei gelöscht' });
      } else {
        res.status(404).json({ error: 'Datei nicht gefunden: ' + cleanFilename });
      }
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({ error: 'Fehler beim Löschen: ' + error.message });
    }
  } else {
    res.status(405).json({ error: 'Methode nicht erlaubt' });
  }
}
