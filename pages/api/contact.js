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

const META_FIELD_KEYS = new Set([
  'altcha', 'captcha', 'hcaptcha', 'g-recaptcha-response',
  'recaptcha', 'csrf', 'csrfToken', '_csrf', '_method',
]);

const NAME_ALIASES = ['name', 'fullName', 'fullname', 'full_name'];
const EMAIL_ALIASES = ['email', 'mail', 'e-mail', 'emailAddress', 'email_address'];
const SUBJECT_ALIASES = ['subject', 'betreff'];
const MESSAGE_ALIASES = ['message', 'nachricht', 'text', 'content'];

// Validate that a string is a plausible email address
function isValidEmail(str) {
  return typeof str === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

// Sanitize a plain-text string — strip HTML tags, trim, truncate
function sanitizeText(str, maxLen = 2000) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
}

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeText(String(entry ?? ''), 500))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'boolean') return value ? 'ja' : 'nein';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null) {
    return sanitizeText(JSON.stringify(value), 1200);
  }
  return sanitizeText(String(value ?? ''), 500);
}

function readAlias(body, aliases) {
  for (const alias of aliases) {
    if (body[alias] !== undefined && body[alias] !== null) {
      const value = normalizeValue(body[alias]);
      if (value) return value;
    }
  }
  return '';
}

function readName(body) {
  const direct = readAlias(body, NAME_ALIASES);
  if (direct) return direct;

  const firstName = readAlias(body, ['firstName', 'firstname', 'first_name', 'vorname']);
  const lastName = readAlias(body, ['lastName', 'lastname', 'last_name', 'nachname']);
  return sanitizeText(`${firstName} ${lastName}`.trim(), 200);
}

function toLabel(key) {
  if (!key) return 'Feld';
  const cleaned = key
    .replace(/[\[\]]+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Feld';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function buildFormFields(body) {
  const fields = [];
  for (const [rawKey, rawValue] of Object.entries(body || {})) {
    const key = String(rawKey || '').trim();
    if (!key || META_FIELD_KEYS.has(key)) continue;
    const value = normalizeValue(rawValue);
    if (!value) continue;
    fields.push({ key, label: toLabel(key), value });
  }
  return fields;
}

function buildAutoMessage(fields) {
  return fields.map((field) => `${field.label}: ${field.value}`).join('\n');
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

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const name = sanitizeText(readName(body), 200);
  const email = sanitizeText(readAlias(body, EMAIL_ALIASES), 200);
  const subject = sanitizeText(readAlias(body, SUBJECT_ALIASES), 300);

  const formFields = buildFormFields(body);
  const explicitMessage = sanitizeText(readAlias(body, MESSAGE_ALIASES), 4000);
  const autoMessage = sanitizeText(buildAutoMessage(formFields), 4000);
  const message = explicitMessage || autoMessage;

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
