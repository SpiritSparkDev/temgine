import { readHelpDoc } from '../../../lib/helpDocs';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' });
  const markdown = readHelpDoc(req.query.name);
  if (markdown === null) return res.status(404).json({ error: 'Anleitung nicht gefunden', code: 'HELP_NOT_FOUND' });
  return res.status(200).json({ name: String(req.query.name), markdown });
}
