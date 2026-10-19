/**
 * pages/api/contact.js
 *
 * Public POST endpoint for contact form submissions.
 * - Rate-limited (5 requests per minute per IP)
 * - Validates input
 * - Sends email via SMTP (if configured)
 * - Optionally saves message to DB (controlled by Setting contactSaveToDb)
 */

import crypto from 'crypto';
import Mustache from 'mustache';
import { verifySolution } from 'altcha-lib/v1';
import { rateLimit } from '../../lib/rateLimit';
import { sendMail } from '../../lib/email';
import { prisma } from '../../lib/prisma';
import { ALTCHA_HMAC_KEY } from '../../lib/altcha';
import { getTemplateByName } from '../../lib/templateStore';
import { getContactEmailTemplate } from '../../lib/contactEmailTemplateStore';
import { extractContactFormFields } from '../../lib/contactFormFields';
import { runContactHooks, isReservedMailVar } from '../../lib/plugins/registry';

const limiter = rateLimit({ windowMs: 60_000, max: 5 });
// Honeypot: für Menschen unsichtbares Feld im Formular; Bots füllen es aus.
const HONEYPOT_FIELD = 'hp_website';

const META_FIELD_KEYS = new Set([
  'altcha', 'captcha', 'hcaptcha', 'g-recaptcha-response',
  'recaptcha', 'csrf', 'csrfToken', '_csrf', '_method', '_cfTemplate', HONEYPOT_FIELD,
]);

// Rendert eine Admin-Email-Vorlage mit den (schon sanitisierten) Formularfeldern
// als Mustache-Kontext — bei Syntaxfehlern in der Vorlage lieber auf den
// generischen Text zurückfallen als den Versand ganz scheitern zu lassen.
function renderEmailTemplatePart(tpl, context, fallback) {
  if (!tpl) return fallback;
  try {
    return Mustache.render(String(tpl), context);
  } catch (_e) {
    return fallback;
  }
}

// Die Admin-Vorlage ist entweder reiner Text (dann wird sie für den HTML-Teil
// noch \n → <br> gewandelt) oder schon fertiges HTML — am öffnenden Tag erkannt,
// damit beides im selben "Text"-Feld funktioniert.
const looksLikeHtml = (str) => /<[a-z][\s\S]*>/i.test(String(str || ''));
const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stripHtmlTags = (str) => String(str || '').replace(/<[^>]*>/g, '').replace(/\n{3,}/g, '\n\n').trim();

const NAME_ALIASES = ['name', 'fullName', 'fullname', 'full_name'];
const EMAIL_ALIASES = ['email', 'mail', 'e-mail', 'emailAddress', 'email_address'];
const SUBJECT_ALIASES = ['subject', 'betreff'];
const MESSAGE_ALIASES = ['message', 'nachricht', 'text', 'content'];

// Fields already represented elsewhere in the email (name/email/subject/message
// header + body) — excluded when appending "extra" fields (checkboxes, phone, …)
// so they don't show up twice.
const ALIAS_KEYS = new Set([
  ...NAME_ALIASES, 'firstName', 'firstname', 'first_name', 'vorname', 'lastName', 'lastname', 'last_name', 'nachname',
  ...EMAIL_ALIASES, ...SUBJECT_ALIASES, ...MESSAGE_ALIASES,
]);

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

// Plugin-Hooks (hooks.beforeContactSubmission / contactMailContext / onContactSubmission, siehe development_docs/PLUGINS.md):
// formId = Name des Kontaktformular-Templates (_cfTemplate) oder null, values = Rohwerte ohne Meta-Felder.
function pluginHookInput(body, clientIp) {
  const formId = typeof body._cfTemplate === 'string' && body._cfTemplate.trim() ? body._cfTemplate.trim() : null;
  const form = formId ? getTemplateByName(formId) : null;
  return {
    formId,
    values: Object.fromEntries(Object.entries(body).filter(([key]) => !META_FIELD_KEYS.has(key))),
    fieldDefs: form && form.category === 'contact' ? extractContactFormFields(form.code) : [],
    clientIp,
  };
}

function buildAutoMessage(fields) {
  return fields.map((field) => `${field.label}: ${field.value}`).join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
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
        return res.status(403).json({ error: 'Zugriff verweigert' });
      }
    } catch {
      return res.status(403).json({ error: 'Zugriff verweigert' });
    }
  }

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

  // Spam: Honeypot ausgefüllt → still verwerfen (Bot sieht Erfolg), nichts wird gesendet.
  // Plugins erfahren davon nur über onContactSubmission mit honeypotTripped: true (ohne submissionId).
  if (body[HONEYPOT_FIELD]) {
    await runContactHooks('after', { ...pluginHookInput(body, clientIp), submissionId: null, messageId: null, honeypotTripped: true }, clientIp);
    return res.status(200).json({ ok: true });
  }

  // Spam protection — require a solved ALTCHA proof-of-work challenge
  const altchaValid = body.altcha
    ? await verifySolution(body.altcha, ALTCHA_HMAC_KEY).catch(() => false)
    : false;
  if (!altchaValid) {
    return res.status(400).json({ error: 'Spam-Schutz-Verifizierung fehlgeschlagen.' });
  }

  const name = sanitizeText(readName(body), 200);
  const email = sanitizeText(readAlias(body, EMAIL_ALIASES), 200);
  const subject = sanitizeText(readAlias(body, SUBJECT_ALIASES), 300);

  const formFields = buildFormFields(body);
  const explicitMessage = sanitizeText(readAlias(body, MESSAGE_ALIASES), 4000);
  const autoMessage = sanitizeText(buildAutoMessage(formFields), 4000);
  // When the form has its own message/nachricht field, other fields (checkboxes,
  // phone, …) would otherwise be silently dropped — append them instead of
  // discarding them.
  const extraFields = formFields.filter((field) => !ALIAS_KEYS.has(field.key));
  const extraMessage = sanitizeText(buildAutoMessage(extraFields), 4000);
  const message = explicitMessage
    ? (extraMessage ? `${explicitMessage}\n\n${extraMessage}` : explicitMessage)
    : autoMessage;

  // Validation
  const errors = {};
  if (!name) errors.name = 'Name ist erforderlich.';
  if (!isValidEmail(email)) errors.email = 'Gültige E-Mail-Adresse erforderlich.';
  if (!message || message.length < 5) errors.message = 'Nachricht ist zu kurz.';

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'Validierungsfehler', fields: errors });
  }

  // Plugin-Vorprüfung (z. B. Pflicht-Checkbox): ein Plugin kann die Absendung mit Feldfehlern ablehnen.
  // submissionId: stabile ID dieser Absendung für alle Hooks (before/mailContext/after); messageId = ContactMessage-ID (erst im Nach-Hook, falls gespeichert).
  const submissionId = crypto.randomUUID();
  const hookInput = { ...pluginHookInput(body, clientIp), submissionId };
  const pre = await runContactHooks('before', hookInput, clientIp);
  if (!pre.ok) {
    if (pre.retryAfter) res.setHeader('Retry-After', pre.retryAfter);
    return res.status(pre.status).json({
      error: pre.error || 'Validierungsfehler',
      ...(Object.keys(pre.errors).length ? { fields: pre.errors } : {}),
      ...(pre.retryAfter ? { retryAfter: pre.retryAfter } : {}),
    });
  }

  // Read settings from DB
  let contactMailTo = null;
  let subjectPrefix = '';
  let saveToDb = false;
  let messageId = null;
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['contact_recipient_email', 'contactMailTo', 'contact_subject_prefix', 'contactSaveToDb'] } },
    });
    const db = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    contactMailTo = db.contact_recipient_email || db.contactMailTo || process.env.CONTACT_MAIL_TO || null;
    subjectPrefix = db.contact_subject_prefix || '';
    saveToDb = db.contactSaveToDb === 'true';
  } catch (e) {
    // DB not available — fall back to env var
    contactMailTo = process.env.CONTACT_MAIL_TO || null;
  }

  const results = { emailSent: false, savedToDb: false };

  // Send email
  let mailCtx = { vars: {}, appendText: '', byPlugin: {} };
  if (contactMailTo) {
    // Plugins können vor dem Versand Zusatzdaten liefern (z. B. Termin-Link); Fehler/Timeouts = Mail geht ohne.
    mailCtx = await runContactHooks('mailContext', { ...hookInput, messageId: null, honeypotTripped: false }, clientIp);
    try {
      const genericSubject = subject
        ? `${subjectPrefix ? subjectPrefix + ' ' : ''}${subject}`
        : `${subjectPrefix || 'Neue Kontaktanfrage von'} ${name}`;
      const extra = mailCtx.appendText; // Plugin-Zusatzzeile(n), nur in der generischen Mail
      const genericText = `Name: ${name}\nE-Mail: ${email}\n\n${message}${extra ? `\n\n${extra}` : ''}`;
      const genericHtml = `<p><strong>Name:</strong> ${name}<br><strong>E-Mail:</strong> ${email}</p><p>${message.replace(/\n/g, '<br>')}</p>${extra ? `<p>${escapeHtml(extra).replace(/\n/g, '<br>')}</p>` : ''}`;

      // Welches Kontaktformular-Template wurde abgesendet? (vom Renderer als
      // verstecktes Feld eingefügt, siehe lib/templateEngine.js) — wenn dafür
      // eine eigene Email-Vorlage hinterlegt ist, ersetzt sie Betreff/Text.
      let subjectLine = genericSubject;
      let textBody = genericText;
      let htmlBody = genericHtml;
      const cfTemplateName = typeof body._cfTemplate === 'string' ? body._cfTemplate.trim() : '';
      if (cfTemplateName) {
        const form = getTemplateByName(cfTemplateName);
        if (form && form.category === 'contact') {
          const emailTpl = getContactEmailTemplate(form.name);
          if (emailTpl.subject || emailTpl.body) {
            // Plugin-Variablen haben einen reservierten Namensraum (z. B. tnt_): Formularfelder mit solchen Schlüsseln
            // werden verworfen, damit Besucher keine Plugin-Variablen (Termin-Link) einschleusen können.
            const mustacheContext = { ...mailCtx.vars, ...Object.fromEntries(formFields.filter((f) => !isReservedMailVar(f.key)).map((f) => [f.key, f.value])) };
            subjectLine = renderEmailTemplatePart(emailTpl.subject, mustacheContext, genericSubject);
            const renderedBody = renderEmailTemplatePart(emailTpl.body, mustacheContext, genericText);
            if (looksLikeHtml(emailTpl.body)) {
              htmlBody = renderedBody;
              textBody = stripHtmlTags(renderedBody);
            } else {
              textBody = renderedBody;
              htmlBody = `<p>${renderedBody.replace(/\n/g, '<br>')}</p>`;
            }
          }
        }
      }

      await sendMail({
        to: contactMailTo,
        // Formularfelder dürfen Zeilenumbrüche enthalten — im Betreff würde
        // das sonst als Header-Injection durchschlagen, egal ob Standard-
        // oder individuelle Vorlage.
        subject: subjectLine.replace(/[\r\n]+/g, ' ').trim(),
        text: textBody,
        html: htmlBody,
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
      const saved = await prisma.contactMessage.create({
        data: { name, email, subject: subject || null, message },
      });
      messageId = saved && saved.id != null ? String(saved.id) : null;
      results.savedToDb = true;
    } catch (e) {
      console.error('[contact] DB-Speicherung fehlgeschlagen:', e.message);
    }
  }

  if (!results.emailSent && !results.savedToDb && !contactMailTo) {
    // No destination configured — still return success to the user
    console.warn('[contact] Kein Empfänger konfiguriert (contactMailTo). Nachricht verworfen.');
  }

  // Plugin-Nachbereitung (Weiterleitung o. Ä.): Fehler eines Plugins lassen die Absendung nie scheitern.
  await runContactHooks('after', {
    ...hookInput,
    messageId,
    mailContextByPlugin: mailCtx.byPlugin,
    honeypotTripped: false,
  }, clientIp);

  return res.status(200).json({ ok: true });
}
