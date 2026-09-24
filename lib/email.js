/**
 * lib/email.js
 *
 * Nodemailer wrapper for sending transactional emails.
 * Reads SMTP configuration from the DB `Setting` table first (managed in the
 * admin under Kontaktformulare → SMTP-Einstellungen), falling back to
 * environment variables for deployments that only set those.
 *
 * DB keys:  smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure,
 *           contact_sender_email
 * Env fallback: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_FROM
 */

import nodemailer from 'nodemailer';
import { prisma } from './prisma';

const SMTP_SETTING_KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_secure', 'contact_sender_email'];

async function loadSmtpSettings() {
  try {
    const rows = await prisma.setting.findMany({ where: { key: { in: SMTP_SETTING_KEYS } } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch (e) {
    return {};
  }
}

async function createTransport() {
  const db = await loadSmtpSettings();

  const host = db.smtp_host || process.env.SMTP_HOST;
  const port = parseInt(db.smtp_port || process.env.SMTP_PORT || '587', 10);
  const user = db.smtp_user || process.env.SMTP_USER;
  const pass = db.smtp_pass || process.env.SMTP_PASS;
  const secure = (db.smtp_secure ?? process.env.SMTP_SECURE) === 'true';
  const from = db.contact_sender_email || process.env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    throw new Error('SMTP not configured. Setze SMTP-Zugangsdaten unter Kontaktformulare → SMTP-Einstellungen oder in .env.local (SMTP_HOST, SMTP_USER, SMTP_PASS).');
  }

  return { transport: nodemailer.createTransport({ host, port, secure, auth: { user, pass } }), from };
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
  const { transport, from } = await createTransport();
  await transport.sendMail({ from, to, subject, text, html });
}

/**
 * Test the SMTP connection without sending an email.
 * Returns true on success, throws on failure.
 */
export async function verifySMTP() {
  const { transport } = await createTransport();
  await transport.verify();
  return true;
}
