import fs from 'fs';
import path from 'path';

const CSS_DIR = path.join(process.cwd(), 'public', 'extern_css');
const ORDER_FILE = path.join(CSS_DIR, '.order.json');

export default function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const { order } = req.body;

      if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'Order muss ein Array sein' });
      }

      fs.writeFileSync(ORDER_FILE, JSON.stringify({ order }, null, 2), 'utf-8');
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Fehler beim Speichern der Reihenfolge' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
