import fs from 'fs';
import path from 'path';

const NAVIGATIONS_DIR = path.join(process.cwd(), 'data', 'navigations');

// Stelle sicher, dass das Verzeichnis existiert
if (!fs.existsSync(NAVIGATIONS_DIR)) {
  fs.mkdirSync(NAVIGATIONS_DIR, { recursive: true });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { name } = req.query;

    if (name) {
      // Einzelne Navigation laden
      const filePath = path.join(NAVIGATIONS_DIR, `${name}.html`);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Navigation nicht gefunden' });
      }

      const code = fs.readFileSync(filePath, 'utf-8');
      return res.status(200).json({ name, code });
    } else {
      // Liste aller Navigationen
      const files = fs.readdirSync(NAVIGATIONS_DIR);
      const navigations = files
        .filter(f => f.endsWith('.html'))
        .map(f => f.replace('.html', ''));
      return res.status(200).json({ navigations });
    }
  }

  if (req.method === 'POST') {
    const { name, code } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Name und Code sind erforderlich' });
    }

    const filePath = path.join(NAVIGATIONS_DIR, `${name}.html`);
    fs.writeFileSync(filePath, code, 'utf-8');

    return res.status(200).json({ success: true, name });
  }

  if (req.method === 'DELETE') {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name ist erforderlich' });
    }

    const filePath = path.join(NAVIGATIONS_DIR, `${name}.html`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Navigation nicht gefunden' });
    }

    fs.unlinkSync(filePath);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Methode nicht erlaubt' });
}
