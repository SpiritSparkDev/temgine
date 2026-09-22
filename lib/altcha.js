// Shared HMAC key for signing/verifying ALTCHA proof-of-work challenges.
// Set ALTCHA_HMAC_KEY in your .env to a strong random secret.
export const ALTCHA_HMAC_KEY = process.env.ALTCHA_HMAC_KEY || 'temphelix-change-me-in-env';
