import { createChallenge } from 'altcha-lib';

// ALTCHA HMAC key – set ALTCHA_HMAC_KEY in your .env to a strong random secret
const ALTCHA_HMAC_KEY = process.env.ALTCHA_HMAC_KEY || 'temphelix-change-me-in-env';

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
