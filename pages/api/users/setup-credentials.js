import crypto from 'crypto';
import { prisma } from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  }

  try {
    const { token, authMethod, username, password, name, email } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token erforderlich' });
    }

    if (!authMethod || !['credentials', 'oauth'].includes(authMethod)) {
      return res.status(400).json({ error: 'Authentifizierungsmethode erforderlich' });
    }

    if (!email) {
      return res.status(400).json({ error: 'E-Mail erforderlich' });
    }

    if (authMethod === 'credentials' && (!username || !password)) {
      return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
    }

    // Validiere Einladung
    const invitation = await prisma.userInvitation.findUnique({
      where: { token }
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Einladung nicht gefunden' });
    }

    if (invitation.used) {
      return res.status(400).json({ error: 'Einladung bereits verwendet' });
    }

    if (new Date() > invitation.expiresAt) {
      return res.status(400).json({ error: 'Einladung abgelaufen' });
    }

    // Prüfe ob E-Mail bereits existiert
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'E-Mail bereits registriert' });
    }

    // Erstelle Benutzer
    const userData = {
      email,
      name: name || invitation.name || username || null,
      role: invitation.role
    };

    if (authMethod === 'credentials') {
      // Hash Passwort (einfaches Hashing für Demo - in Produktion bcrypt verwenden!)
      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
      userData.password = hashedPassword;
    }

    const user = await prisma.user.create({
      data: userData
    });

    // Markiere Einladung als verwendet
    await prisma.userInvitation.update({
      where: { id: invitation.id },
      data: {
        used: true,
        usedAt: new Date(),
        usedBy: user.email
      }
    });

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      message: authMethod === 'credentials' 
        ? 'Account erstellt. Sie können sich jetzt anmelden.'
        : 'Account erstellt. Sie können sich jetzt mit GitHub anmelden.'
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Fehler beim Akzeptieren der Einladung' });
  }
}
