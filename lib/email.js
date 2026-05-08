/**
 * lib/email.js
 *
 * Nodemailer wrapper for sending transactional emails.
 * Reads SMTP configuration from environment variables.
 *
 * Required env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *
 * Optional:
 *   SMTP_FROM  – sender address (defaults to SMTP_USER)
 *   SMTP_SECURE – "true" for TLS on port 465 (default: false / STARTTLS)
 */

import nodemailer from 'nodemailer';

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true';

  if (!host || !user || !pass) {
    throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

/**
 * Send an email.
 *
 * @param {object} options
 * @param {string|string[]} options.to      Recipient address(es)
 * @param {string}          options.subject Email subject
 * @param {string}          [options.text]  Plain-text body
 * @param {string}          [options.html]  HTML body
 * @returns {Promise<void>}
 */
export async function sendMail({ to, subject, text, html }) {
  const transport = createTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await transport.sendMail({ from, to, subject, text, html });
}

/**
 * Test the SMTP connection without sending an email.
 * Returns true on success, throws on failure.
 */
export async function verifySMTP() {
  const transport = createTransport();
  await transport.verify();
  return true;
}
