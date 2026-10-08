import { listHelpDocs } from '../../../lib/helpDocs';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed', code: 'METHOD_NOT_ALLOWED' });
  return res.status(200).json(listHelpDocs());
}
