import { prisma } from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  }

  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Token erforderlich' });
  }

  try {
    const invitation = await prisma.userInvitation.findUnique({
      where: { token },
      include: {
        creator: {
          select: {
            name: true,
            email: true
          }
        }
      }
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

    res.status(200).json({
      invitation: {
        name: invitation.name,
        role: invitation.role,
        createdBy: invitation.creator.name || invitation.creator.email
      }
    });
  } catch (error) {
    console.error('Validate invitation error:', error);
    res.status(500).json({ error: 'Fehler beim Validieren der Einladung' });
  }
}
