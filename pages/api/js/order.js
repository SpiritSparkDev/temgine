import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../../lib/auth';

const JS_DIR = path.join(process.cwd(), 'public', 'extern_js');
const ORDER_FILE = path.join(JS_DIR, '.order.json');

if (!fs.existsSync(JS_DIR)) {
  fs.mkdirSync(JS_DIR, { recursive: true });
}

export default async function handler(req, res) {
  const auth = await requireAuth(req, res, ['ADMIN', 'MODERATOR']);
  if (!auth.authorized) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  if (req.method === 'POST') {
    try {
      const { order } = req.body || {};
      if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'Order muss ein Array sein' });
      }

      fs.writeFileSync(ORDER_FILE, JSON.stringify({ order }, null, 2), 'utf-8');
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Fehler beim Speichern der Reihenfolge' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
