import { prisma } from '../../lib/prisma';
import { rateLimit } from '../../lib/rateLimit';
import { verifySolution } from 'altcha-lib';
import nodemailer from 'nodemailer';

const ALTCHA_HMAC_KEY = process.env.ALTCHA_HMAC_KEY || 'temphelix-change-me-in-env';

// 5 submissions per IP per minute
const limiter = rateLimit({ windowMs: 60_000, max: 5 });

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function getOrCreateContactContentType() {
  const SLUG = 'kontakt-einsendungen';
  let ct = await prisma.contentType.findUnique({ where: { slug: SLUG } });
  if (!ct) {
    ct = await prisma.contentType.create({
      data: {
        name: 'Kontakt-Einsendungen',
        slug: SLUG,
        description: 'Automatisch erstellt für Kontaktformular-Einsendungen',
        fields: {
          create: [
            { name: 'Name',        key: 'name',       type: 'text',     required: true,  sortOrder: 0 },
            { name: 'E-Mail',      key: 'email',      type: 'text',     required: true,  sortOrder: 1 },
            { name: 'Nachricht',   key: 'message',    type: 'textarea', required: false, sortOrder: 2 },
            { name: 'Prioritäten', key: 'priorities', type: 'text',     required: false, sortOrder: 3 },
            { name: 'IP-Adresse',  key: 'ip',         type: 'text',     required: false, sortOrder: 4 },
          ],
        },
      },
    });
  }
  return ct;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    const [s, r] = errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    return res.status(s).json(r);
  }

  // Rate limiting
  const { ok, retryAfter } = limiter.check(req);
  if (!ok) {
    const [s, r] = errorResponse(429, 'Zu viele Anfragen', 'RATE_LIMIT_EXCEEDED', { retryAfter });
    return res.status(s).json(r);
  }

  const { name, email, message, priorities, altcha } = req.body || {};

  // Input validation
  if (!name || !String(name).trim()) {
    const [s, r] = errorResponse(400, 'Name ist erforderlich', 'VALIDATION_ERROR');
    return res.status(s).json(r);
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    const [s, r] = errorResponse(400, 'Gültige E-Mail-Adresse erforderlich', 'VALIDATION_ERROR');
    return res.status(s).json(r);
  }

  // ALTCHA verification
  if (!altcha) {
    const [s, r] = errorResponse(400, 'Spam-Schutz-Token fehlt', 'ALTCHA_MISSING');
    return res.status(s).json(r);
  }
  const altchaValid = await verifySolution(altcha, ALTCHA_HMAC_KEY, true);
  if (!altchaValid) {
    const [s, r] = errorResponse(400, 'Spam-Schutz nicht bestanden', 'ALTCHA_INVALID');
    return res.status(s).json(r);
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  const nameClean     = String(name).trim();
  const emailClean    = String(email).trim().toLowerCase();
  const messageClean  = String(message || '').trim();
  const prioritiesStr = Array.isArray(priorities)
    ? priorities.map(p => String(p)).join(', ')
    : String(priorities || '');

  // Store in DB
  let dbEntry;
  try {
    const ct = await getOrCreateContactContentType();
    dbEntry = await prisma.contentEntry.create({
      data: {
        contentTypeId: ct.id,
        title: nameClean,
        data: {
          name:        nameClean,
          email:       emailClean,
          message:     messageClean,
          priorities:  prioritiesStr,
          ip,
          submittedAt: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    console.error('[contact] DB error:', err.message);
    // Continue – still attempt email delivery
  }

  // Send email via configured SMTP
  try {
    const smtpSettings = await prisma.setting.findMany({
      where: { key: { in: [
        'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure',
        'contact_recipient_email', 'contact_sender_name',
        'contact_sender_email', 'contact_subject_prefix',
      ]}},
    });
    const cfg = Object.fromEntries(smtpSettings.map(s => [s.key, s.value]));

    if (cfg.smtp_host && cfg.contact_recipient_email) {
      const transporter = nodemailer.createTransport({
        host:   cfg.smtp_host,
        port:   parseInt(cfg.smtp_port || '587', 10),
        secure: cfg.smtp_secure === 'true',
        auth:   cfg.smtp_user
          ? { user: cfg.smtp_user, pass: cfg.smtp_pass || '' }
          : undefined,
      });

      const prefix      = cfg.contact_subject_prefix || '[Kontakt]';
      const senderName  = cfg.contact_sender_name  || 'Website';
      const senderEmail = cfg.contact_sender_email || cfg.smtp_user || 'noreply@example.com';

      await transporter.sendMail({
        from:    `"${senderName}" <${senderEmail}>`,
        to:      cfg.contact_recipient_email,
        replyTo: `"${nameClean}" <${emailClean}>`,
        subject: `${prefix} Neue Anfrage von ${nameClean}`,
        text: [
          `Name: ${nameClean}`,
          `E-Mail: ${emailClean}`,
          prioritiesStr ? `Prioritäten: ${prioritiesStr}` : '',
          '',
          messageClean || '(keine Nachricht)',
          '',
          `Eingegangen: ${new Date().toLocaleString('de-DE')}`,
          `IP: ${ip}`,
        ].filter(Boolean).join('\n'),
        html: `
          <table style="font-family:sans-serif;font-size:14px;max-width:600px">
            <tr><td><strong>Name:</strong></td><td>${escapeHtml(nameClean)}</td></tr>
            <tr><td><strong>E-Mail:</strong></td><td><a href="mailto:${escapeHtml(emailClean)}">${escapeHtml(emailClean)}</a></td></tr>
            ${prioritiesStr ? `<tr><td><strong>Prioritäten:</strong></td><td>${escapeHtml(prioritiesStr)}</td></tr>` : ''}
          </table>
          <hr>
          <p style="font-family:sans-serif;font-size:14px;white-space:pre-line">${escapeHtml(messageClean || '(keine Nachricht)').replace(/\n/g, '<br>')}</p>
          <hr>
          <p style="font-family:sans-serif;font-size:12px;color:#999">
            Eingegangen: ${new Date().toLocaleString('de-DE')} &middot; IP: ${escapeHtml(ip)}
          </p>
        `,
      });
    }
  } catch (err) {
    console.error('[contact] Email error:', err.message);
    // Don't fail the user request for email errors
  }

  return res.status(200).json({ ok: true, id: dbEntry?.id || null });
}
