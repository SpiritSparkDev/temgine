import bcrypt from 'bcryptjs';
import { prisma } from '../../../lib/prisma';
import { findPageHashById } from '../../../lib/pageAccessPassword';
import { PASSWORD_UNLOCK_COOKIE, parseUnlockCookieValue, serializeUnlockCookie } from '../../../lib/pagePasswordLock';

// Öffentliche, auth-lose Route für den passwortgeschützten Bereich "ohne
// Konto" (Gegenstück zur Mitglieder-Zugangskontrolle, siehe accessGroups
// und pages/member-login.js). Nur PUBLISHED-Seiten werden durchsucht, damit
// sich niemand das Passwort eines Entwurfs ergaunern kann.
async function findPasswordHash(pageId) {
  const pages = await prisma.page.findMany({ where: { status: 'PUBLISHED' } });
  return findPageHashById(pages, pageId);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const pageId = req.query?.pageId;
    if (!pageId) return res.status(400).json({ error: 'pageId erforderlich' });
    const unlocked = parseUnlockCookieValue(req.cookies?.[PASSWORD_UNLOCK_COOKIE]).includes(String(pageId));
    return res.status(200).json({ unlocked });
  }

  if (req.method === 'POST') {
    const { pageId, password } = req.body || {};
    if (!pageId || !password) {
      return res.status(400).json({ error: 'pageId und password erforderlich' });
    }

    try {
      const hash = await findPasswordHash(String(pageId));
      if (!hash) {
        return res.status(404).json({ error: 'Seite nicht gefunden oder nicht passwortgeschützt' });
      }

      const valid = await bcrypt.compare(String(password), hash);
      if (!valid) {
        return res.status(401).json({ error: 'Falsches Passwort.' });
      }

      const alreadyUnlocked = parseUnlockCookieValue(req.cookies?.[PASSWORD_UNLOCK_COOKIE]);
      res.setHeader('Set-Cookie', serializeUnlockCookie([...alreadyUnlocked, String(pageId)]));
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('[/api/pages/password-lock Error]', error.message, error.stack);
      return res.status(500).json({ error: 'Interner Serverfehler' });
    }
  }

  return res.status(405).json({ error: 'Methode nicht erlaubt' });
}
