import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const orderFilePath = path.join(process.cwd(), 'data', '.templates-order.json');

  if (req.method === 'GET') {
    try {
      if (fs.existsSync(orderFilePath)) {
        const data = fs.readFileSync(orderFilePath, 'utf8');
        const order = JSON.parse(data);
        return res.status(200).json({ order });
      }
      return res.status(200).json({ order: [] });
    } catch (error) {
      return res.status(500).json({ error: 'Fehler beim Laden der Reihenfolge' });
    }
  }

  if (req.method === 'POST') {
    const { order } = req.body;
    
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Order muss ein Array sein' });
    }

    try {
      const dataDir = path.dirname(orderFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      fs.writeFileSync(orderFilePath, JSON.stringify(order, null, 2), 'utf8');
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: 'Fehler beim Speichern der Reihenfolge' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
