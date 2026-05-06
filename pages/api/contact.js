/**
 * pages/api/contact.js
 *
 * Public POST endpoint for contact form submissions.
 * - Rate-limited (5 requests per minute per IP)
 * - Validates input
 * - Sends email via SMTP (if configured)
 * - Optionally saves message to DB (controlled by Setting contactSaveToDb)
 */

import { rateLimit } from '../../lib/rateLimit';
import { sendMail } from '../../lib/email';
import { prisma } from '../../lib/prisma';

const limiter = rateLimit({ windowMs: 60_000, max: 5 });

// Validate that a string is a plausible email address
function isValidEmail(str) {
  return typeof str === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

// Sanitize a plain-text string — strip HTML tags, trim, truncate
function sanitizeText(str, maxLen = 2000) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const { ok, retryAfter } = limiter.check(req);
  if (!ok) {
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({ error: 'Zu viele Anfragen. Bitte warte einen Moment.', retryAfter });
  }

  // Origin check — only allow same-origin requests
  const origin = req.headers['origin'];
  const host = req.headers['host'];
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } catch {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const body = req.body || {};
  const name = sanitizeText(body.name, 200);
  const email = sanitizeText(body.email, 200);
  const subject = sanitizeText(body.subject, 300);
  const message = sanitizeText(body.message, 4000);

  // Validation
  const errors = {};
  if (!name) errors.name = 'Name ist erforderlich.';
  if (!isValidEmail(email)) errors.email = 'Gültige E-Mail-Adresse erforderlich.';
  if (!message || message.length < 5) errors.message = 'Nachricht ist zu kurz.';

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Validierungsfehler', fields: errors });
  }

  // Read settings from DB
  let contactMailTo = null;
  let saveToDb = false;
  try {
    const [mailSetting, saveSetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'contactMailTo' } }),
      prisma.setting.findUnique({ where: { key: 'contactSaveToDb' } }),
    ]);
    contactMailTo = mailSetting?.value || process.env.CONTACT_MAIL_TO || null;
    saveToDb = saveSetting?.value === 'true';
  } catch (e) {
    // DB not available — fall back to env var
    contactMailTo = process.env.CONTACT_MAIL_TO || null;
  }

  const results = { emailSent: false, savedToDb: false };

  // Send email
  if (contactMailTo) {
    try {
      const subjectLine = subject
        ? `Kontaktformular: ${subject}`
        : `Neue Kontaktanfrage von ${name}`;
      await sendMail({
        to: contactMailTo,
        subject: subjectLine,
        text: `Name: ${name}\nE-Mail: ${email}\n\n${message}`,
        html: `<p><strong>Name:</strong> ${name}<br><strong>E-Mail:</strong> ${email}</p><p>${message.replace(/\n/g, '<br>')}</p>`,
      });
      results.emailSent = true;
    } catch (e) {
      console.error('[contact] E-Mail-Versand fehlgeschlagen:', e.message);
      // Don't fail the request — we still save to DB if enabled
    }
  }

  // Save to DB (opt-in)
  if (saveToDb) {
    try {
      await prisma.contactMessage.create({
        data: { name, email, subject: subject || null, message },
      });
      results.savedToDb = true;
    } catch (e) {
      console.error('[contact] DB-Speicherung fehlgeschlagen:', e.message);
    }
  }

  if (!results.emailSent && !results.savedToDb && !contactMailTo) {
    // No destination configured — still return success to the user
    console.warn('[contact] Kein Empfänger konfiguriert (contactMailTo). Nachricht verworfen.');
  }

  return res.status(200).json({ ok: true });
}
