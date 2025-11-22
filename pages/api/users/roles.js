import { prisma } from '../../../lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  if (req.method === 'GET') {
    // Liste aller User
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          image: true
        }
      });

      res.status(200).json({ users });
    } catch (error) {
      res.status(500).json({ error: 'Fehler beim Laden der Benutzer' });
    }
  } else if (req.method === 'PUT') {
    // User-Rolle aktualisieren (nur Admin)
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (currentUser?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    try {
      const { userId, role } = req.body;

      if (!['ADMIN', 'MODERATOR', 'EDITOR'].includes(role)) {
        return res.status(400).json({ error: 'Ungültige Rolle' });
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role }
      });

      res.status(200).json({ success: true, user: updatedUser });
    } catch (error) {
      res.status(500).json({ error: 'Fehler beim Aktualisieren' });
    }
  } else {
    res.status(405).json({ error: 'Methode nicht erlaubt' });
  }
}
