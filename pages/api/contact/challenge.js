import { createChallenge } from 'altcha-lib/v1';
import { ALTCHA_HMAC_KEY } from '../../../lib/altcha';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  const challenge = await createChallenge({
    algorithm: 'SHA-256',
    maxNumber: 100000,
    hmacKey: ALTCHA_HMAC_KEY,
    expires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(challenge);
}
