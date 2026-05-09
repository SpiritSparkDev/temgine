import { getServerSession } from 'next-auth/next';
import { authOptions } from './[...nextauth]';

/**
 * Explicit /api/auth/session endpoint.
 * 
 * Turbopack in Next.js 16 has a bug where catch-all routes like [...nextauth].js
 * are not properly routed in development. This explicit endpoint ensures that
 * /api/auth/session works reliably. NextAuth will use this when available.
 * 
 * The catch-all route still handles other auth endpoints like /api/auth/signin, etc.
 */
export default async function handler(req, res) {
  // NextAuth expects GET and POST on session endpoint
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(session || {});
  } catch (error) {
    console.error('[api/auth/session] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
