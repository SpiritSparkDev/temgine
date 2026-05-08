import { prisma } from '../../../lib/prisma';
import { requireAuth } from '../../../lib/auth';
import nodemailer from 'nodemailer';

const errorResponse = (status, message, code = 'UNKNOWN_ERROR', details = null) => {
  const response = { error: message, code };
  if (details) response.details = details;
  return [status, response];
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    const [s, r] = errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    return res.status(s).json(r);
  }

  const auth = await requireAuth(req, res, ['ADMIN']);
  if (!auth.authorized) {
    const [s, r] = errorResponse(auth.status, auth.error, 'UNAUTHORIZED');
    return res.status(s).json(r);
  }

  try {
    // Load persisted SMTP settings; allow body override for "test before save"
    const stored = await prisma.setting.findMany({
      where: { key: { in: [
        'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure',
        'contact_recipient_email', 'contact_sender_name', 'contact_sender_email',
      ]}},
    });
    const db = Object.fromEntries(stored.map(s => [s.key, s.value]));
    const b  = req.body || {};

    const smtpHost    = b.smtp_host    || db.smtp_host;
    const smtpPort    = parseInt(b.smtp_port    || db.smtp_port    || '587', 10);
    const smtpUser    = b.smtp_user    || db.smtp_user;
    const smtpPass    = b.smtp_pass    || db.smtp_pass    || '';
    const smtpSecure  = (b.smtp_secure  ?? db.smtp_secure)  === 'true';
    const recipient   = b.contact_recipient_email || db.contact_recipient_email || smtpUser;
    const senderName  = b.contact_sender_name     || db.contact_sender_name     || 'Temphelix';
    const senderEmail = b.contact_sender_email    || db.contact_sender_email    || smtpUser || '';

    if (!smtpHost) {
      const [s, r] = errorResponse(400, 'SMTP-Host nicht konfiguriert', 'SMTP_NOT_CONFIGURED');
      return res.status(s).json(r);
    }
    if (!recipient) {
      const [s, r] = errorResponse(400, 'Empfänger-E-Mail nicht konfiguriert', 'RECIPIENT_NOT_CONFIGURED');
      return res.status(s).json(r);
    }

    const transporter = nodemailer.createTransport({
      host:   smtpHost,
      port:   smtpPort,
      secure: smtpSecure,
      auth:   smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    });

    await transporter.verify();

    await transporter.sendMail({
      from:    `"${senderName}" <${senderEmail || smtpUser}>`,
      to:      recipient,
      subject: '[Temphelix] Test-E-Mail',
      text:    'Die SMTP-Konfiguration funktioniert korrekt. Diese Nachricht wurde automatisch von Temphelix gesendet.',
      html:    '<p style="font-family:sans-serif">Die SMTP-Konfiguration funktioniert korrekt.</p><p style="font-family:sans-serif">Diese Nachricht wurde automatisch von <strong>Temphelix</strong> gesendet.</p>',
    });

    return res.status(200).json({ ok: true, message: `Test-E-Mail erfolgreich an ${recipient} gesendet.` });
  } catch (err) {
    console.error('[test-email] Error:', err.message);
    const [s, r] = errorResponse(500, `SMTP-Fehler: ${err.message}`, 'SMTP_ERROR');
    return res.status(s).json(r);
  }
}
