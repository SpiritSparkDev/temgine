import { prisma } from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Methode nicht erlaubt' });
  }

  try {
    
    // Teste Datenbankverbindung
    const startTime = Date.now();
    await prisma.$connect();
    const connectionTime = Date.now() - startTime;
    
    // Hole Datenbankinfo
    const result = await prisma.$queryRaw`SELECT version()`;
    
    // Prüfe Tabellen (falls welche existieren)
    let tableCount = 0;
    try {
      const tables = await prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `;
      tableCount = Number(tables[0]?.count || 0);
    } catch (e) {
      // Ignoriere Fehler wenn Schema noch nicht existiert
    }

    await prisma.$disconnect();

    return res.status(200).json({
      status: 'healthy',
      connected: true,
      connectionTime: `${connectionTime}ms`,
      version: result[0]?.version || 'Unknown',
      tables: tableCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Database health check failed:', error);
    
    return res.status(503).json({
      status: 'unhealthy',
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
