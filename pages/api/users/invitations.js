import { prisma } from '../../../lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import crypto from 'crypto';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  // Nur ADMIN kann Einladungen erstellen
  if (currentUser?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }

  if (req.method === 'POST') {
    // Neue Einladung erstellen
    try {
      const { name, role } = req.body;

      // Generiere Token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 Tage gültig

      const invitation = await prisma.userInvitation.create({
        data: {
          name: name || null,
          role: role || 'EDITOR',
          token,
          expiresAt,
          createdBy: currentUser.id
        }
      });

      const inviteUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/invite/${token}`;

      res.status(200).json({
        success: true,
        invitation: {
          id: invitation.id,
          name: invitation.name,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          inviteUrl
        }
      });
    } catch (error) {
      console.error('=== CREATE INVITATION ERROR ===');
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
      console.error('Full error:', error);
      res.status(500).json({ 
        error: 'Fehler beim Erstellen der Einladung',
        details: error.message 
      });
    }
  } else if (req.method === 'GET') {
    // Liste aller Einladungen
    try {
      const invitations = await prisma.userInvitation.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          creator: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      res.status(200).json({ invitations });
    } catch (error) {
      console.error('=== GET INVITATIONS ERROR ===');
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
      res.status(500).json({ 
        error: 'Fehler beim Laden der Einladungen',
        details: error.message 
      });
    }
  } else if (req.method === 'DELETE') {
    // Einladung löschen/widerrufen
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
      }
      const { id } = JSON.parse(body);

      await prisma.userInvitation.delete({
        where: { id }
      });

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('=== DELETE INVITATION ERROR ===');
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
      res.status(500).json({ 
        error: 'Fehler beim Löschen',
        details: error.message 
      });
    }
  } else {
    res.status(405).json({ error: 'Methode nicht erlaubt' });
  }
}
