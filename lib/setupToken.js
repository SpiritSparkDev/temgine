import crypto from 'crypto';

// ponytail: module-level cache — resets on restart and differs per
// process, so multi-instance deployments must still set SETUP_TOKEN
// explicitly in env. Fine for the single-process Plesk/dev target here.
let generatedToken = null;

/**
 * The token required to create the first admin account via /setup.
 * Uses SETUP_TOKEN from env if set, otherwise generates and caches
 * a random one for the lifetime of this process.
 */
export function getSetupToken() {
  if (process.env.SETUP_TOKEN) return process.env.SETUP_TOKEN;
  if (!generatedToken) generatedToken = crypto.randomBytes(24).toString('hex');
  return generatedToken;
}

/**
 * Logs a ready-to-click setup link if no admin account exists yet.
 * Called once at server boot from instrumentation.js.
 */
export async function logSetupLinkIfNeeded() {
  const { prisma } = await import('./prisma');
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) return;

    const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const link = `${base}/setup?token=${getSetupToken()}`;
    console.log('\n[setup] Kein Admin-Account vorhanden. Ersteinrichtung:');
    console.log(`[setup] ${link}\n`);
  } catch (err) {
    console.error('[setup] Konnte Setup-Status nicht prüfen:', err.message);
  }
}
