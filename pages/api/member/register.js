/**
 * pages/api/member/register.js
 *
 * Public POST endpoint for member self-registration.
 * - Rate-limited (3 registrations per 15 min per IP)
 * - Validates email uniqueness
 * - Hashes password with bcrypt
 * - Sends verification email if SMTP is configured and Setting memberEmailVerification=true
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../../lib/prisma';
import { rateLimit } from '../../../lib/rateLimit';
import { sendMail } from '../../../lib/email';

const limiter = rateLimit({ windowMs: 15 * 60_000, max: 3 });

function isValidEmail(str) {
  return typeof str === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { ok, retryAfter } = limiter.check(req);
  if (!ok) {
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ error: 'Zu viele Registrierungsversuche. Bitte warte.', retryAfter });
  }

  const body = req.body || {};
  const email = (body.email || '').toString().trim().toLowerCase().slice(0, 200);
  const name = (body.name || '').toString().trim().slice(0, 100);
  const password = (body.password || '').toString();

  // Validation
  const errors = {};
  if (!isValidEmail(email)) errors.email = 'Gültige E-Mail-Adresse erforderlich.';
  if (!password || password.length < 8) errors.password = 'Passwort muss mindestens 8 Zeichen haben.';
  if (Object.keys(errors).length > 0) return res.status(400).json({ error: 'Validierungsfehler', fields: errors });

  // Check if email already taken (don't leak via timing — always hash first)
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.member.findUnique({ where: { email } });
  if (existing) {
    // Return generic message to prevent email enumeration
    return res.status(200).json({ ok: true, message: 'Falls diese E-Mail noch nicht registriert ist, erhältst du eine Bestätigungsmail.' });
  }

  // Check if open registration is enabled
  const regSetting = await prisma.setting.findUnique({ where: { key: 'memberOpenRegistration' } }).catch(() => null);
  const openReg = regSetting?.value !== 'false'; // default: open
  if (!openReg) {
    return res.status(403).json({ error: 'Registrierung ist derzeit nicht möglich.' });
  }

  // Determine if email verification is required
  const verSetting = await prisma.setting.findUnique({ where: { key: 'memberEmailVerification' } }).catch(() => null);
  const requireVerification = verSetting?.value === 'true';

  const verifyToken = requireVerification ? crypto.randomBytes(32).toString('hex') : null;
  const verifyTokenExp = requireVerification ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

  await prisma.member.create({
    data: {
      email,
      name: name || null,
      password: passwordHash,
      verified: !requireVerification,
      verifyToken,
      verifyTokenExp,
    },
  });

  // Send verification email
  if (requireVerification && verifyToken) {
    const baseUrl = process.env.NEXTAUTH_URL || `https://${req.headers.host}`;
    const link = `${baseUrl}/api/member/verify?token=${verifyToken}`;
    try {
      await sendMail({
        to: email,
        subject: 'Dein Konto bestätigen',
        text: `Bitte bestätige dein Konto:\n\n${link}\n\nDer Link ist 24 Stunden gültig.`,
        html: `<p>Bitte bestätige dein Konto:</p><p><a href="${link}">${link}</a></p><p>Der Link ist 24 Stunden gültig.</p>`,
      });
    } catch (e) {
      console.error('[member/register] Bestätigungs-E-Mail fehlgeschlagen:', e.message);
    }
  }

  return res.status(200).json({
    ok: true,
    message: requireVerification
      ? 'Registrierung erfolgreich. Bitte prüfe deine E-Mails zur Bestätigung.'
      : 'Registrierung erfolgreich. Du kannst dich jetzt einloggen.',
  });
}
