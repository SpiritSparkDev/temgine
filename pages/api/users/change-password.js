import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth/next';
import { prisma } from '../../../lib/prisma';
import { authOptions } from '../auth/[...nextauth]';
import { logAudit } from '../../../lib/audit';
import { rateLimit } from '../../../lib/rateLimit';

// Schützt gegen Brute-Force auf das aktuelle Passwort — 10 Versuche / 15 Min pro IP.
const limiter = rateLimit({ windowMs: 15 * 60_000, max: 10 });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  }

  const { ok, retryAfter } = limiter.check(req);
  if (!ok) {
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut versuchen.', retryAfter });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Aktuelles und neues Passwort sind erforderlich' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Das neue Passwort muss mindestens 8 Zeichen lang sein' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }
    if (!user.password) {
      return res.status(400).json({ error: 'Dieses Konto hat kein Passwort (Login z. B. über GitHub) und kann hier nicht geändert werden' });
    }

    // Accounts created before the bcrypt switch still have a plain SHA-256 hex
    // hash (64 chars, no bcrypt '$2' prefix) — mirrors pages/api/auth/[...nextauth].js.
    const isLegacyHash = !user.password.startsWith('$2');
    const currentValid = isLegacyHash
      ? user.password === crypto.createHash('sha256').update(String(currentPassword)).digest('hex')
      : await bcrypt.compare(String(currentPassword), user.password);

    if (!currentValid) {
      return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
    }

    const newHash = await bcrypt.hash(String(newPassword), 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: newHash } });

    await logAudit({ action: 'UPDATE', resource: 'user_password', resourceId: user.id, userId: user.id, details: { self: true } });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[/api/users/change-password] Error:', error.message, error.stack);
    return res.status(500).json({ error: 'Fehler beim Ändern des Passworts' });
  }
}
