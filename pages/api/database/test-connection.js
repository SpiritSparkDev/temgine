import { PrismaClient } from '@prisma/client';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { connectionString } = req.body;

  if (!connectionString) {
    return res.status(400).json({ error: 'Connection string required' });
  }

  let prisma;
  try {
    // Temporären Prisma Client mit dem angegebenen Connection String erstellen
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: connectionString,
        },
      },
    });

    // Einfache Query zum Testen der Verbindung
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({ success: true, message: 'Connection successful' });
  } catch (error) {
    console.error('Database connection test failed:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to connect to database',
    });
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}
