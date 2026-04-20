import { prisma } from '../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = {
    database: { ok: false, message: '' },
    schema: { ok: false, tables: [], message: '' },
    env: { ok: false, message: '' },
  };

  // --- Env check ---
  const missing = [];
  if (!process.env.NEXTAUTH_SECRET) missing.push('NEXTAUTH_SECRET');
  if (!process.env.NEXTAUTH_URL) missing.push('NEXTAUTH_URL');
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');

  if (missing.length === 0) {
    result.env.ok = true;
    result.env.message = `NEXTAUTH_URL: ${process.env.NEXTAUTH_URL}`;
  } else {
    result.env.ok = false;
    result.env.message = `Fehlende Variablen: ${missing.join(', ')}`;
  }

  // --- DB connection check ---
  try {
    await prisma.$queryRaw`SELECT 1`;
    result.database.ok = true;
    result.database.message = 'Verbindung OK';
  } catch (err) {
    result.database.ok = false;
    result.database.message = err.message || 'Verbindung fehlgeschlagen';
    // Return early — schema check will also fail
    return res.status(200).json(result);
  }

  // --- Schema check: required tables ---
  const requiredTables = ['User', 'Page', 'UserInvitation'];
  try {
    const existing = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `;
    const existingNames = existing.map((r) => r.table_name);

    const found = [];
    const missing_tables = [];

    for (const t of requiredTables) {
      // Prisma lowercases table names by default
      if (existingNames.some((n) => n.toLowerCase() === t.toLowerCase())) {
        found.push(t);
      } else {
        missing_tables.push(t);
      }
    }

    if (missing_tables.length === 0) {
      result.schema.ok = true;
      result.schema.tables = found;
      result.schema.message = 'Schema OK';
    } else {
      result.schema.ok = false;
      result.schema.tables = found;
      result.schema.message = `Fehlende Tabellen: ${missing_tables.join(', ')}`;
    }

    // --- User count ---
    const userCount = await prisma.user.count();
    result.schema.userCount = userCount;
  } catch (err) {
    result.schema.ok = false;
    result.schema.message = err.message || 'Schema-Prüfung fehlgeschlagen';
  }

  return res.status(200).json(result);
}
