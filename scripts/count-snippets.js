// Count snippets in DB
const { PrismaClient } = require('@prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const c = await prisma.snippet.count();
    console.log('Snippets in DB:', c);
  } catch (e) {
    console.error('Error counting snippets:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
